import type { Partition } from './profile';
import type { RoleSwitchRequest } from './role-handoff';

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

export function readAwsConsoleSessionMetadata(document: Document): AwsConsoleSessionMetadata {
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
    };
  } catch {
    return { prismModeEnabled: false };
  }
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

export function buildAwsStandardSwitchFields(
  request: RoleSwitchRequest,
  currentUrl: string,
  csrf: string,
): AwsStandardSwitchFields {
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
