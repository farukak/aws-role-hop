import {
  buildAwsRedirectUrl,
  buildAwsStandardSwitchFields,
  buildAwsSwitchEndpoint,
  readAwsConsoleSessionMetadata,
} from '../domain/switch-role-page';
import { isRoleSwitchRequest, type RoleSwitchResult } from '../domain/role-handoff';

const BRIDGE_ID = 'rolehop-aws-console-bridge';
const REQUEST_EVENT = 'rolehop:switch-request';
const RESPONSE_EVENT = 'rolehop:switch-response';

type AwsGlobals = typeof globalThis & {
  AWSC?: { Auth?: { getMbtc?: () => string } };
};

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
        const request = JSON.parse(bridge.dataset.request ?? 'null') as unknown;
        if (!isRoleSwitchRequest(request))
          throw new Error('AWS Role Hop switch request is invalid.');

        const metadata = readAwsConsoleSessionMetadata(document);
        const endpoint = buildAwsSwitchEndpoint(request, metadata);

        if (metadata.prismModeEnabled) {
          if (!metadata.sessionDifferentiator) {
            throw new Error('AWS multi-session metadata is incomplete.');
          }
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
                metadata.sessionDifferentiator,
              ),
              roleName: request.roleName,
            }),
          });
          if (!response.ok) throw new Error(`AWS switch-role request failed (${response.status}).`);
          const body = (await response.json()) as { destination?: unknown };
          if (typeof body.destination !== 'string') {
            throw new Error('AWS did not return a switch destination.');
          }
          const destination = new URL(body.destination);
          if (destination.protocol !== 'https:') {
            throw new Error('AWS returned an unsafe switch destination.');
          }
          respond({ ok: true });
          window.location.assign(destination.toString());
          return;
        }

        const csrf = (globalThis as AwsGlobals).AWSC?.Auth?.getMbtc?.() ?? '';
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
        });
      }
    })();
  });
});
