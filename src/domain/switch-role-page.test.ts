/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  buildAwsRedirectUrl,
  buildAwsStandardSwitchFields,
  buildAwsSwitchEndpoint,
  classifyAwsSwitchStatus,
  hasAssumedRole,
  isAllowedAwsConsoleDestination,
  readAwsConsoleSessionMetadata,
  resolveAwsCsrfValue,
  resolveAwsSignInHost,
} from './switch-role-page';
import type { RoleSwitchRequest } from './role-handoff';

const REQUEST: RoleSwitchRequest = {
  type: 'rolehop:switch-role',
  account: '123456789012',
  roleName: 'Developer',
  displayName: 'Development',
  color: '69b4e3',
  partition: 'aws',
  region: 'eu-west-1',
};

describe('AWS Console session metadata', () => {
  it('reads standard and multi-session fields from AWS metadata', () => {
    document.head.innerHTML = `<meta name="awsc-session-data" content='{"prismModeEnabled":true,"sessionDifferentiator":"session-1","signInEndpoint":"eu-west-1.signin.aws.amazon.com"}'>`;
    expect(readAwsConsoleSessionMetadata(document)).toEqual({
      prismModeEnabled: true,
      sessionDifferentiator: 'session-1',
      signInEndpoint: 'eu-west-1.signin.aws.amazon.com',
    });
  });

  it('fails closed to standard metadata when AWS content is absent or malformed', () => {
    document.head.innerHTML = '<meta name="awsc-session-data" content="not-json">';
    expect(readAwsConsoleSessionMetadata(document)).toEqual({ prismModeEnabled: false });
  });
});

describe('AWS switch endpoints', () => {
  it.each([
    ['aws', 'signin.aws.amazon.com'],
    ['aws-us-gov', 'signin.amazonaws-us-gov.com'],
    ['aws-cn', 'signin.amazonaws.cn'],
  ] as const)('uses the partition-correct endpoint for %s', (partition, host) => {
    expect(buildAwsSwitchEndpoint({ partition }, { prismModeEnabled: false })).toBe(
      `https://${host}/switchrole`,
    );
  });

  it('accepts an AWS regional sign-in endpoint but rejects an untrusted host', () => {
    expect(resolveAwsSignInHost('https://eu-west-1.signin.aws.amazon.com/path', 'aws')).toBe(
      'eu-west-1.signin.aws.amazon.com',
    );
    expect(resolveAwsSignInHost('signin.aws.amazon.com.evil.example', 'aws')).toBe(
      'signin.aws.amazon.com',
    );
  });

  it('builds the AWS multi-session endpoint only with a session differentiator', () => {
    expect(
      buildAwsSwitchEndpoint(REQUEST, {
        prismModeEnabled: true,
        sessionDifferentiator: 'session/one',
        signInEndpoint: 'signin.aws.amazon.com',
      }),
    ).toBe('https://signin.aws.amazon.com/sessions/session%2Fone/v1/switchrole');
  });
});

describe('AWS switch destinations', () => {
  it.each([
    ['https://console.aws.amazon.com/console/home', 'aws'],
    ['https://session.eu-west-1.console.aws.amazon.com/console/home', 'aws'],
    ['https://health.aws.amazon.com/health/home', 'aws'],
    ['https://us-gov-west-1.console.amazonaws-us-gov.com/', 'aws-us-gov'],
    ['https://cn-north-1.console.amazonaws.cn/', 'aws-cn'],
  ] as const)('accepts a partition-correct Console destination %s', (destination, partition) => {
    expect(isAllowedAwsConsoleDestination(destination, partition)).toBe(true);
  });

  it.each([
    ['http://console.aws.amazon.com/', 'aws'],
    ['https://console.aws.amazon.com.evil.test/', 'aws'],
    ['https://placeholder-user@console.aws.amazon.com/', 'aws'],
    ['https://console.aws.amazon.com:8443/', 'aws'],
    ['https://console.amazonaws.cn/', 'aws'],
    ['not-a-url', 'aws'],
  ] as const)(
    'rejects an unsafe or partition-mismatched destination %s',
    (destination, partition) => {
      expect(isAllowedAwsConsoleDestination(destination, partition)).toBe(false);
    },
  );
});

describe('AWS CSRF values', () => {
  it.each([
    ['primitive string', 'csrf-value'],
    ['boxed string', new String('csrf-value')],
    ['asynchronous string', Promise.resolve('csrf-value')],
  ])('normalizes a %s', async (_label, value) => {
    await expect(resolveAwsCsrfValue(value)).resolves.toBe('csrf-value');
  });

  it.each([undefined, null, {}, Promise.resolve({})])(
    'rejects a missing or opaque value',
    async (value) => {
      await expect(resolveAwsCsrfValue(value)).rejects.toThrow(/did not provide a CSRF value/i);
    },
  );
});

describe('AWS switch POST data', () => {
  it('matches AWS native standard-switch fields and carries the profile color', () => {
    expect(
      buildAwsStandardSwitchFields(
        REQUEST,
        'https://eu-west-1.console.aws.amazon.com/console/home?region=us-east-1',
        'csrf-value',
      ),
    ).toEqual({
      mfaNeeded: '0',
      action: 'switchFromBasis',
      src: 'nav',
      csrf: 'csrf-value',
      roleName: 'Developer',
      account: '123456789012',
      color: '69b4e3',
      redirect_uri: encodeURIComponent(
        'https://eu-west-1.console.aws.amazon.com/console/home?region=eu-west-1',
      ),
      displayName: 'Development',
    });
  });

  it.each(['', '   '])('rejects a missing CSRF value', (csrf) => {
    expect(() =>
      buildAwsStandardSwitchFields(
        REQUEST,
        'https://eu-west-1.console.aws.amazon.com/console/home',
        csrf,
      ),
    ).toThrow(/did not provide a CSRF value/i);
  });
  it('removes the multi-session hostname prefix and preserves other destination data', () => {
    expect(
      buildAwsRedirectUrl(
        'https://session-1.eu-west-1.console.aws.amazon.com/console/home?foo=bar',
        'eu-west-1',
        'session-1',
      ),
    ).toBe('https://eu-west-1.console.aws.amazon.com/console/home?foo=bar&region=eu-west-1');
  });
});

describe('classifyAwsSwitchStatus', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'sessionMissing'],
    [410, 'sessionMissing'],
    [429, 'throttled'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [400, 'rejected'],
  ] as const)('maps %i to %s', (status, expected) => {
    expect(classifyAwsSwitchStatus(status)).toBe(expected);
  });
});

describe('readAwsConsoleSessionMetadata sign-in endpoint fallbacks', () => {
  it('uses the separately published endpoint when the session data omits it', () => {
    document.head.innerHTML = `<meta name="awsc-session-data" content='{"prismModeEnabled":true,"sessionDifferentiator":"934030966520-z3trodsy"}'>`;
    document.body.innerHTML = `<div id="awsc-signin-endpoint" content="eu-west-1.signin.aws.amazon.com"></div>`;

    expect(readAwsConsoleSessionMetadata(document)).toEqual({
      prismModeEnabled: true,
      sessionDifferentiator: '934030966520-z3trodsy',
      signInEndpoint: 'eu-west-1.signin.aws.amazon.com',
    });
  });

  it.each([
    ['us-gov-west-1', 'signin.amazonaws-us-gov.com'],
    ['cn-north-1', 'signin.amazonaws.cn'],
  ] as const)('derives the endpoint from the %s infrastructure region', (region, expected) => {
    document.head.innerHTML = `<meta name="awsc-session-data" content='{"infrastructureRegion":"${region}"}'>`;
    document.body.innerHTML = '';

    expect(readAwsConsoleSessionMetadata(document).signInEndpoint).toBe(expected);
  });

  it('leaves the endpoint unresolved when AWS publishes nothing', () => {
    document.head.innerHTML = `<meta name="awsc-session-data" content='{"prismModeEnabled":true}'>`;
    document.body.innerHTML = '';

    expect(readAwsConsoleSessionMetadata(document)).toEqual({ prismModeEnabled: true });
  });
});

describe('classifyAwsSwitchStatus with an AWS error code', () => {
  it('treats an UNAUTHORIZED body as unauthorized even on a 200', () => {
    expect(classifyAwsSwitchStatus(200, 'UNAUTHORIZED')).toBe('unauthorized');
  });

  it.each([
    ['0243-1459-6708', '', true],
    ['', 'OrganizationAccountAccessRole/user', true],
    ['', '', false],
  ] as const)('detects an assumed role from account %s and user %s', (account, user, expected) => {
    document.body.innerHTML = `<span id="awsc-role-display-name-account">${account}</span><span id="awsc-role-display-name-user">${user}</span>`;
    expect(hasAssumedRole(document)).toBe(expected);
  });

  it('prefers the nav service when the Console renders no display-name nodes', () => {
    document.body.innerHTML = '';
    expect(
      hasAssumedRole(document, { roleDisplayNameUser: 'OrganizationAccountAccessRole/faruk' }),
    ).toBe(true);
    expect(hasAssumedRole(document, { roleDisplayNameAccount: '   ' })).toBe(false);
    expect(hasAssumedRole(document, null)).toBe(false);
  });
});
