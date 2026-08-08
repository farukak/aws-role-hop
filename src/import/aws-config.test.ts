import { describe, expect, it } from 'vitest';
import { parseAwsConfig } from './aws-config';

describe('parseAwsConfig — credential safety', () => {
  it('never imports credential material and reports that it was ignored', () => {
    const result = parseAwsConfig(`
[profile legacy]
role_arn = arn:aws:iam::123456789012:role/Developer
aws_access_key_id = EXAMPLE_ACCESS_KEY_NOT_STORED
aws_secret_access_key = EXAMPLE_SECRET_KEY_NOT_STORED
aws_session_token = EXAMPLE_SESSION_TOKEN_NOT_STORED
credential_process = EXAMPLE_CREDENTIAL_PROCESS_NOT_STORED
credential_source = EXAMPLE_CREDENTIAL_SOURCE_NOT_STORED
web_identity_token_file = EXAMPLE_TOKEN_FILE_NOT_STORED
`);

    expect(result.credentialsIgnored).toBe(true);
    expect(result.profiles).toHaveLength(1);

    const serialized = JSON.stringify(result);
    for (const secret of [
      'EXAMPLE_ACCESS_KEY_NOT_STORED',
      'EXAMPLE_SECRET_KEY_NOT_STORED',
      'EXAMPLE_SESSION_TOKEN_NOT_STORED',
      'EXAMPLE_CREDENTIAL_PROCESS_NOT_STORED',
      'EXAMPLE_CREDENTIAL_SOURCE_NOT_STORED',
      'EXAMPLE_TOKEN_FILE_NOT_STORED',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('ignores credential keys regardless of case or padding', () => {
    const result = parseAwsConfig(`
[profile legacy]
role_arn = arn:aws:iam::123456789012:role/Developer
  AWS_ACCESS_KEY_ID   =   EXAMPLE_ACCESS_KEY_NOT_STORED
`);

    expect(result.credentialsIgnored).toBe(true);
    expect(JSON.stringify(result)).not.toContain('EXAMPLE_ACCESS_KEY_NOT_STORED');
  });

  it('does not flag credentials when none are present', () => {
    const result = parseAwsConfig(`
[profile clean]
role_arn = arn:aws:iam::123456789012:role/Developer
`);
    expect(result.credentialsIgnored).toBe(false);
  });
});

describe('parseAwsConfig — IAM role profiles', () => {
  it('extracts the account, role and partition from a role ARN', () => {
    const { profiles } = parseAwsConfig(`
[profile development]
role_arn = arn:aws:iam::123456789012:role/Developer
`);

    expect(profiles).toHaveLength(1);
    const [draft] = profiles;
    expect(draft?.type).toBe('role');
    expect(draft?.name).toBe('development');
    expect(draft?.accountId).toBe('123456789012');
    expect(draft?.roleName).toBe('Developer');
    expect(draft?.type === 'role' && draft.partition).toBe('aws');
    expect(draft?.environment).toBe('development');
  });

  it.each([
    ['arn:aws-us-gov:iam::123456789012:role/Ops', 'aws-us-gov'],
    ['arn:aws-cn:iam::123456789012:role/Ops', 'aws-cn'],
  ])('reads the partition from %s', (roleArn, partition) => {
    const { profiles } = parseAwsConfig(`[profile ops]\nrole_arn = ${roleArn}\n`);
    const [draft] = profiles;
    expect(draft?.type === 'role' && draft.partition).toBe(partition);
  });

  it('keeps a role path from the ARN', () => {
    const { profiles } = parseAwsConfig(
      '[profile p]\nrole_arn = arn:aws:iam::123456789012:role/team/ReadOnly\n',
    );
    expect(profiles[0]?.roleName).toBe('team/ReadOnly');
  });

  it('falls back to explicit account and role keys', () => {
    const { profiles } = parseAwsConfig(`
[profile fallback]
aws_account_id = 123456789012
role_name = Auditor
partition = aws-cn
`);
    const [draft] = profiles;
    expect(draft?.accountId).toBe('123456789012');
    expect(draft?.roleName).toBe('Auditor');
    expect(draft?.type === 'role' && draft.partition).toBe('aws-cn');
  });

  it('imports an optional landing region for an IAM role', () => {
    const { profiles } = parseAwsConfig(`
[profile regional]
role_arn = arn:aws:iam::123456789012:role/Developer
region = EU-WEST-1
`);
    expect(profiles[0]?.type === 'role' && profiles[0].region).toBe('eu-west-1');
  });

  it('defaults to the standard partition when the configured value is unsupported', () => {
    const { profiles } = parseAwsConfig(`
[profile p]
account_id = 123456789012
role_name = Auditor
partition = aws-iso
`);
    expect(profiles[0]?.type === 'role' && profiles[0].partition).toBe('aws');
  });

  it('reports a malformed role ARN instead of guessing', () => {
    const result = parseAwsConfig('[profile broken]\nrole_arn = arn:aws:iam::123:role/Developer\n');
    expect(result.profiles).toHaveLength(0);
    expect(result.issues[0]?.section).toBe('profile broken');
    expect(result.issues[0]?.message).toContain('Role ARN');
  });

  it('reports a role profile that is missing the role name', () => {
    const result = parseAwsConfig('[profile partial]\naws_account_id = 123456789012\n');
    expect(result.profiles).toHaveLength(0);
    expect(result.issues[0]?.message).toContain('account ID or alias and a role name');
  });

  it.each(['12345678901', '1234567890123'])(
    'rejects a numeric IAM account value that is not exactly 12 digits (%s)',
    (accountId) => {
      const result = parseAwsConfig(
        `[profile invalid]\naws_account_id = ${accountId}\nrole_name = ReadOnly\n`,
      );
      expect(result.profiles).toHaveLength(0);
      expect(result.issues[0]?.message).toContain('exactly 12 digits');
    },
  );
});

describe('parseAwsConfig — complex source profiles', () => {
  it('uses base-account target role and region defaults without importing the base', () => {
    const result = parseAwsConfig(`
[profile organization]
aws_account_id = 000011112222
target_role_name = Developer
target_region = eu-west-1
partition = aws-us-gov

[profile workload-a]
aws_account_id = 123456789012
source_profile = organization

[profile workload-b]
aws_account_id = 210987654321
role_name = Manager
region = us-east-2
source_profile = ORGANIZATION
`);

    expect(result.issues).toHaveLength(0);
    expect(result.ignored).toEqual([
      {
        section: 'profile organization',
        reason: 'Base account used to resolve source_profile defaults; it is not a switch target.',
      },
    ]);
    expect(result.profiles).toHaveLength(2);
    expect(result.profiles[0]).toMatchObject({
      type: 'role',
      name: 'workload-a',
      roleName: 'Developer',
      region: 'eu-west-1',
      partition: 'aws-us-gov',
    });
    expect(result.profiles[1]).toMatchObject({ roleName: 'Manager', region: 'us-east-2' });
  });

  it('supports a target role declared with a role ARN and source_profile', () => {
    const result = parseAwsConfig(`
[base]
aws_account_id = 000011112222

[target]
role_arn = arn:aws-cn:iam::123456789012:role/team/ReadOnly
source_profile = base
`);
    expect(result.profiles[0]).toMatchObject({
      accountId: '123456789012',
      roleName: 'team/ReadOnly',
      partition: 'aws-cn',
    });
  });

  it('accepts an account alias as a target identifier', () => {
    const { profiles } = parseAwsConfig(`
[target]
aws_account_alias = acme-production
role_name = Auditor
`);
    expect(profiles[0]?.accountId).toBe('acme-production');
  });

  it('reports an unknown source_profile instead of dropping the target', () => {
    const result = parseAwsConfig(`
[target]
aws_account_id = 123456789012
role_name = Auditor
source_profile = missing
`);
    expect(result.profiles).toHaveLength(0);
    expect(result.issues[0]?.message).toContain('unknown section: missing');
  });
});

describe('parseAwsConfig — Identity Center profiles', () => {
  it('resolves the start URL through an sso-session block', () => {
    const { profiles } = parseAwsConfig(`
[sso-session company]
sso_start_url = https://example.awsapps.com/start
sso_region = eu-west-1

[profile platform]
sso_session = company
sso_account_id = 123456789012
sso_role_name = PlatformAccess
region = eu-west-1
`);

    expect(profiles).toHaveLength(1);
    const [draft] = profiles;
    expect(draft?.type).toBe('sso');
    expect(draft?.type === 'sso' && draft.portalUrl).toBe('https://example.awsapps.com/start');
    expect(draft?.type === 'sso' && draft.region).toBe('eu-west-1');
    expect(draft?.roleName).toBe('PlatformAccess');
  });

  it('accepts a start URL declared directly on the profile', () => {
    const { profiles } = parseAwsConfig(`
[profile direct]
sso_start_url = https://example.awsapps.com/start
sso_account_id = 123456789012
sso_role_name = ReadOnly
`);
    expect(profiles[0]?.type === 'sso' && profiles[0].portalUrl).toBe(
      'https://example.awsapps.com/start',
    );
  });

  it('does not emit the sso-session block itself as a profile', () => {
    const result = parseAwsConfig(`
[sso-session company]
sso_start_url = https://example.awsapps.com/start
`);
    expect(result.profiles).toHaveLength(0);
    expect(result.ignored).toHaveLength(0);
  });

  it('reports an Identity Center profile with an unresolvable session', () => {
    const result = parseAwsConfig(`
[profile orphan]
sso_session = missing
sso_account_id = 123456789012
sso_role_name = ReadOnly
`);
    expect(result.profiles).toHaveLength(0);
    expect(result.issues[0]?.message).toContain('start URL');
  });

  it('rejects a start URL that is not an AWS access portal', () => {
    const result = parseAwsConfig(`
[profile evil]
sso_start_url = https://phish.example.com/start
sso_account_id = 123456789012
sso_role_name = ReadOnly
`);
    expect(result.profiles).toHaveLength(0);
    expect(result.issues[0]?.message).toContain('access portal URL');
  });

  it('rejects an Identity Center profile whose account is an alias', () => {
    const result = parseAwsConfig(`
[profile alias]
sso_start_url = https://example.awsapps.com/start
sso_account_id = acme-prod
sso_role_name = ReadOnly
`);
    expect(result.profiles).toHaveLength(0);
    expect(result.issues[0]?.message).toContain('12-digit account ID');
  });
});

describe('parseAwsConfig — INI handling', () => {
  it('strips the "profile" prefix and trims the name', () => {
    const { profiles } = parseAwsConfig(
      '[profile   spaced   ]\nrole_arn = arn:aws:iam::123456789012:role/R\n',
    );
    expect(profiles[0]?.name).toBe('spaced');
  });

  it('supports a bare section name without the profile prefix', () => {
    const { profiles } = parseAwsConfig('[default]\nrole_arn = arn:aws:iam::123456789012:role/R\n');
    expect(profiles[0]?.name).toBe('default');
  });

  it.each([
    ['hash comments', '# comment\n[profile p]\n# another\nrole_arn = %ARN%\n'],
    ['semicolon comments', '; comment\n[profile p]\nrole_arn = %ARN%\n'],
    ['CRLF line endings', '[profile p]\r\nrole_arn = %ARN%\r\n'],
    ['a UTF-8 BOM', '\uFEFF[profile p]\nrole_arn = %ARN%\n'],
    ['blank lines', '\n\n[profile p]\n\nrole_arn = %ARN%\n\n'],
  ])('handles %s', (_label, template) => {
    const input = template.replace('%ARN%', 'arn:aws:iam::123456789012:role/R');
    const result = parseAwsConfig(input);
    expect(result.profiles).toHaveLength(1);
    expect(result.issues).toHaveLength(0);
  });

  it('strips inline comments from unquoted values', () => {
    const { profiles } = parseAwsConfig(
      '[profile p]\nrole_arn = arn:aws:iam::123456789012:role/R # inline\n',
    );
    expect(profiles[0]?.roleName).toBe('R');
  });

  it('unquotes quoted values', () => {
    const { profiles } = parseAwsConfig(
      '[profile p]\nrole_arn = "arn:aws:iam::123456789012:role/R"\n',
    );
    expect(profiles[0]?.roleName).toBe('R');
  });

  it('keeps values that legitimately contain an equals sign', () => {
    const { profiles } = parseAwsConfig(
      '[profile p]\naws_account_id = 123456789012\nrole_name = Role=Special\n',
    );
    expect(profiles[0]?.roleName).toBe('Role=Special');
  });

  it('reports an entry that appears before any section header', () => {
    const result = parseAwsConfig('role_arn = arn:aws:iam::123456789012:role/R\n');
    expect(result.issues[0]).toMatchObject({ line: 1 });
    expect(result.issues[0]?.message).toContain('before a section header');
  });

  it('reports a line that is not a key = value entry', () => {
    const result = parseAwsConfig('[profile p]\nnonsense\n');
    expect(result.issues[0]?.message).toContain('key = value');
    expect(result.issues[0]?.line).toBe(2);
  });

  it('counts sections that carry no profile information as ignored', () => {
    const result = parseAwsConfig('[profile empty]\nregion = eu-west-1\n');
    expect(result.profiles).toHaveLength(0);
    expect(result.ignored).toEqual([
      { section: 'profile empty', reason: 'No role ARN, account ID, or Identity Center fields.' },
    ]);
    expect(result.issues).toHaveLength(0);
  });

  it('parses the favorite flag and caps tags at eight', () => {
    const { profiles } = parseAwsConfig(`
[profile p]
role_arn = arn:aws:iam::123456789012:role/R
favorite = true
tags = a, b, c, d, e, f, g, h, i, j
`);
    expect(profiles[0]?.favorite).toBe(true);
    expect(profiles[0]?.tags).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  });

  it('treats any non-"true" favorite value as false', () => {
    const { profiles } = parseAwsConfig(
      '[profile p]\nrole_arn = arn:aws:iam::123456789012:role/R\nfavorite = yes\n',
    );
    expect(profiles[0]?.favorite).toBe(false);
  });

  it('infers the environment from the profile name', () => {
    const { profiles } = parseAwsConfig(`
[profile acme-prod]
role_arn = arn:aws:iam::123456789012:role/R

[profile acme-staging]
role_arn = arn:aws:iam::123456789012:role/R2
`);
    expect(profiles.map((draft) => draft.environment)).toEqual(['production', 'staging']);
  });

  it('returns an empty result for empty input', () => {
    expect(parseAwsConfig('')).toEqual({
      profiles: [],
      issues: [],
      ignored: [],
      credentialsIgnored: false,
    });
  });

  it('keeps parsing after a bad section', () => {
    const result = parseAwsConfig(`
[profile broken]
role_arn = not-an-arn

[profile good]
role_arn = arn:aws:iam::123456789012:role/R
`);
    expect(result.profiles.map((draft) => draft.name)).toEqual(['good']);
    expect(result.issues).toHaveLength(1);
  });
});
