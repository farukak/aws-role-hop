import {
  AwsSwitchFailure,
  buildAwsRedirectUrl,
  buildAwsStandardSwitchFields,
  buildAwsSwitchEndpoint,
  classifyAwsSwitchStatus,
  isAllowedAwsConsoleDestination,
  readAwsConsoleSessionMetadata,
  resolveAwsCsrfValue,
} from '../domain/switch-role-page';
import { isRoleSwitchRequest, type RoleSwitchResult } from '../domain/role-handoff';

const BRIDGE_ID = 'rolehop-aws-console-bridge';
const REQUEST_EVENT = 'rolehop:switch-request';
const RESPONSE_EVENT = 'rolehop:switch-response';
const MULTI_SESSION_TIMEOUT_MS = 14_000;

type AwsGlobals = typeof globalThis & {
  AWSC?: { Auth?: { getMbtc?: () => unknown } };
};

/**
 * The Console mints its request token lazily, and AWS's own multi-session switch
 * always reads it first. Read it here too and discard the value: skipping it
 * leaves the session-scoped endpoint without a minted token.
 */
async function primeAwsConsoleToken(): Promise<void> {
  try {
    await Promise.resolve((globalThis as AwsGlobals).AWSC?.Auth?.getMbtc?.());
  } catch {
    // A missing or failing accessor must not stop the switch attempt itself.
  }
}

export default defineUnlistedScript(() => {
  const bridge = document.getElementById(BRIDGE_ID);
  if (!bridge || bridge.dataset.rolehopReady === 'true') return;
  bridge.dataset.rolehopReady = 'true';

  const respond = (result: RoleSwitchResult): void => {
    bridge.dataset.response = JSON.stringify(result);
    bridge.dispatchEvent(new Event(RESPONSE_EVENT));
  };

  bridge.addEventListener(REQUEST_EVENT, () => {
    void (async () => {
      try {
        const serializedRequest = bridge.dataset.request;
        delete bridge.dataset.request;
        const request = JSON.parse(serializedRequest ?? 'null') as unknown;
        if (!isRoleSwitchRequest(request))
          throw new Error('AWS Role Hop switch request is invalid.');

        const metadata = readAwsConsoleSessionMetadata(document);

        if (metadata.prismModeEnabled) {
          // The session-scoped endpoint only exists on the session's own sign-in
          // host, so guessing a default host here would fail authorization.
          const { sessionDifferentiator, signInEndpoint } = metadata;
          if (!sessionDifferentiator || !signInEndpoint) {
            throw new Error(
              'AWS multi-session details are incomplete. Reload the AWS Console tab and try again.',
            );
          }
          const endpoint = buildAwsSwitchEndpoint(request, metadata);

          await primeAwsConsoleToken();

          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), MULTI_SESSION_TIMEOUT_MS);
          let body: { destination?: unknown };
          try {
            const response = await fetch(endpoint, {
              method: 'POST',
              credentials: 'include',
              headers: {
                'X-CSRF-PROTECTION': '1',
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                account: request.account,
                color: request.color,
                displayName: request.displayName,
                redirectUri: buildAwsRedirectUrl(
                  window.location.href,
                  request.region,
                  sessionDifferentiator,
                ),
                roleName: request.roleName,
              }),
              signal: controller.signal,
            });
            if (!response.ok) {
              throw new AwsSwitchFailure(
                classifyAwsSwitchStatus(response.status),
                `AWS switch-role request failed (${response.status}).`,
              );
            }
            body = (await response.json()) as { destination?: unknown };
          } catch (error: unknown) {
            if (controller.signal.aborted) {
              throw new Error(
                'AWS switch-role request timed out. Refresh the Console and try again.',
                { cause: error },
              );
            }
            throw error;
          } finally {
            window.clearTimeout(timeout);
          }

          if (typeof body.destination !== 'string') {
            throw new Error('AWS did not return a switch destination.');
          }
          if (!isAllowedAwsConsoleDestination(body.destination, request.partition)) {
            throw new Error('AWS returned an unsafe switch destination.');
          }
          respond({ ok: true });
          window.location.assign(body.destination);
          return;
        }

        const endpoint = buildAwsSwitchEndpoint(request, metadata);
        const csrf = await resolveAwsCsrfValue((globalThis as AwsGlobals).AWSC?.Auth?.getMbtc?.());
        const fields = buildAwsStandardSwitchFields(request, window.location.href, csrf);
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = endpoint;
        form.target = '_top';
        form.hidden = true;
        for (const [name, value] of Object.entries(fields)) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value;
          form.append(input);
        }
        document.body.append(form);
        respond({ ok: true });
        form.submit();
      } catch (error: unknown) {
        respond({
          ok: false,
          error: error instanceof Error ? error.message : 'AWS role switch failed.',
          ...(error instanceof AwsSwitchFailure ? { code: error.code } : {}),
        });
      }
    })();
  });
});
