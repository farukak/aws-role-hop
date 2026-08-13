import type { Partition } from './profile';
import type { AwsSwitchFailureCode, RoleSwitchRequest } from './role-handoff';

export interface AwsConsoleSessionMetadata {
  prismModeEnabled: boolean;
  sessionDifferentiator?: string;
  signInEndpoint?: string;
}

export type AwsStandardSwitchFields = Record<
  | 'mfaNeeded'
  | 'action'
  | 'src'
  | 'csrf'
  | 'roleName'
  | 'account'
  | 'color'
  | 'redirect_uri'
  | 'displayName',
  string
>;

const DEFAULT_SIGN_IN_HOSTS: Record<Partition, string> = {
  aws: 'signin.aws.amazon.com',
  'aws-us-gov': 'signin.amazonaws-us-gov.com',
  'aws-cn': 'signin.amazonaws.cn',
};

const CONSOLE_HOST_SUFFIXES: Record<Partition, readonly string[]> = {
  aws: ['console.aws.amazon.com', 'health.aws.amazon.com', 'lightsail.aws.amazon.com'],
  'aws-us-gov': ['console.amazonaws-us-gov.com', 'phd.amazonaws-us-gov.com'],
  'aws-cn': ['console.amazonaws.cn', 'health.amazonaws.cn'],
};

/** Carries the classified reason for an AWS-rejected switch alongside its message. */
export class AwsSwitchFailure extends Error {
  readonly code: AwsSwitchFailureCode;

  constructor(code: AwsSwitchFailureCode, message: string) {
    super(message);
    this.name = 'AwsSwitchFailure';
    this.code = code;
  }
}

/**
 * A multi-session switch can fail with a 200 that carries an errorCode, so the
 * body is as authoritative as the status.
 */
export function classifyAwsSwitchStatus(
  status: number,
  awsErrorCode?: string,
): AwsSwitchFailureCode {
  if (awsErrorCode === 'UNAUTHORIZED') return 'unauthorized';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404 || status === 410) return 'sessionMissing';
  if (status === 429) return 'throttled';
  if (status >= 500) return 'unavailable';
  return 'rejected';
}

export function isAllowedAwsConsoleDestination(value: string, partition: Partition): boolean {
  try {
    const destination = new URL(value);
    if (
      destination.protocol !== 'https:' ||
      destination.username !== '' ||
      destination.password !== '' ||
      destination.port !== ''
    ) {
      return false;
    }

    const hostname = destination.hostname.toLowerCase();
    return CONSOLE_HOST_SUFFIXES[partition].some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

interface ParsedAwsSessionData {
  prismModeEnabled: boolean;
  sessionDifferentiator?: string;
  signInEndpoint?: string;
  infrastructureRegion?: string;
}

function parseAwsSessionData(document: Document): ParsedAwsSessionData {
  const content = document
    .querySelector<HTMLMetaElement>('meta[name="awsc-session-data"]')
    ?.getAttribute('content');
  if (!content) return { prismModeEnabled: false };

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      prismModeEnabled: parsed.prismModeEnabled === true,
      ...(typeof parsed.sessionDifferentiator === 'string'
        ? { sessionDifferentiator: parsed.sessionDifferentiator }
        : {}),
      ...(typeof parsed.signInEndpoint === 'string'
        ? { signInEndpoint: parsed.signInEndpoint }
        : {}),
      ...(typeof parsed.infrastructureRegion === 'string'
        ? { infrastructureRegion: parsed.infrastructureRegion }
        : {}),
    };
  } catch {
    return { prismModeEnabled: false };
  }
}

/**
 * Some Console pages omit signInEndpoint from the session metadata and publish
 * it separately. A multi-session switch only exists on that exact host, so an
 * unresolved endpoint would be sent to the wrong host and rejected.
 */
function readSignInEndpointFallback(
  document: Document,
  infrastructureRegion: string | undefined,
): string | undefined {
  const published = document.getElementById('awsc-signin-endpoint')?.getAttribute('content');
  if (published) return published;
  if (infrastructureRegion?.startsWith('us-gov-')) return 'signin.amazonaws-us-gov.com';
  if (infrastructureRegion?.startsWith('cn-')) return 'signin.amazonaws.cn';
  return undefined;
}

export function readAwsConsoleSessionMetadata(document: Document): AwsConsoleSessionMetadata {
  const parsed = parseAwsSessionData(document);
  const signInEndpoint =
    parsed.signInEndpoint ?? readSignInEndpointFallback(document, parsed.infrastructureRegion);

  return {
    prismModeEnabled: parsed.prismModeEnabled,
    ...(parsed.sessionDifferentiator
      ? { sessionDifferentiator: parsed.sessionDifferentiator }
      : {}),
    ...(signInEndpoint ? { signInEndpoint } : {}),
  };
}

/**
 * The Console only publishes a role display name once a role has been assumed.
 * A multi-session switch made from such a session is a role-to-role chain, which
 * AWS refuses unless the target role trusts the assumed role.
 *
 * Current Console pages expose this through their nav service and only older
 * pages still render the matching DOM nodes, so both are consulted.
 */
export function hasAssumedRole(document: Document, accountInfo?: unknown): boolean {
  const info =
    accountInfo && typeof accountInfo === 'object'
      ? (accountInfo as Record<string, unknown>)
      : undefined;
  const publishedByService = [info?.roleDisplayNameAccount, info?.roleDisplayNameUser].some(
    (value) => typeof value === 'string' && value.trim() !== '',
  );
  if (publishedByService) return true;

  const account = document.getElementById('awsc-role-display-name-account')?.textContent?.trim();
  const user = document.getElementById('awsc-role-display-name-user')?.textContent?.trim();
  return Boolean(account || user);
}

export function resolveAwsSignInHost(candidate: string | undefined, partition: Partition): string {
  const fallback = DEFAULT_SIGN_IN_HOSTS[partition];
  if (!candidate) return fallback;

  const normalized = candidate
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  return normalized === fallback || normalized.endsWith(`.${fallback}`) ? normalized : fallback;
}

export function buildAwsSwitchEndpoint(
  request: Pick<RoleSwitchRequest, 'partition'>,
  metadata: AwsConsoleSessionMetadata,
): string {
  const host = resolveAwsSignInHost(metadata.signInEndpoint, request.partition);
  if (metadata.prismModeEnabled && metadata.sessionDifferentiator) {
    return `https://${host}/sessions/${encodeURIComponent(metadata.sessionDifferentiator)}/v1/switchrole`;
  }
  return `https://${host}/switchrole`;
}

export function buildAwsRedirectUrl(
  currentUrl: string,
  region?: string,
  sessionDifferentiator?: string,
): string {
  const redirect = new URL(currentUrl);
  if (region) redirect.searchParams.set('region', region);
  if (sessionDifferentiator && redirect.hostname.startsWith(`${sessionDifferentiator}.`)) {
    redirect.hostname = redirect.hostname.slice(sessionDifferentiator.length + 1);
  }
  return redirect.toString();
}

export async function resolveAwsCsrfValue(value: unknown): Promise<string> {
  const resolved = await Promise.resolve(value);
  let csrf = '';

  if (typeof resolved === 'string') {
    csrf = resolved;
  } else if (typeof resolved === 'number' && Number.isFinite(resolved)) {
    csrf = resolved.toString();
  } else if (typeof resolved === 'bigint') {
    csrf = resolved.toString();
  } else if (resolved instanceof String) {
    csrf = resolved.valueOf();
  } else if (Array.isArray(resolved) && resolved.length === 1 && typeof resolved[0] === 'string') {
    csrf = resolved[0];
  }

  if (!csrf.trim()) {
    throw new Error('AWS Console did not provide a CSRF value. Refresh the Console and try again.');
  }
  return csrf;
}

export function buildAwsStandardSwitchFields(
  request: RoleSwitchRequest,
  currentUrl: string,
  csrf: string,
): AwsStandardSwitchFields {
  if (typeof csrf !== 'string' || !csrf.trim()) {
    throw new Error('AWS Console did not provide a CSRF value. Refresh the Console and try again.');
  }

  return {
    mfaNeeded: '0',
    action: 'switchFromBasis',
    src: 'nav',
    csrf,
    roleName: request.roleName,
    account: request.account,
    color: request.color,
    redirect_uri: encodeURIComponent(buildAwsRedirectUrl(currentUrl, request.region)),
    displayName: request.displayName,
  };
}
