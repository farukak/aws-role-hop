/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  buildAwsRedirectUrl,
  buildAwsStandardSwitchFields,
  buildAwsSwitchEndpoint,
  readAwsConsoleSessionMetadata,
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
