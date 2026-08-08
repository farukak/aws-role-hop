import { describe, expect, it } from 'vitest';
import { detectImportFormat } from './format';

describe('detectImportFormat', () => {
  it.each([
    ['a profile section', '[profile dev]\nrole_arn = arn:aws:iam::123456789012:role/R\n'],
    ['a bare default section', '[default]\nregion = eu-west-1\n'],
    ['an sso-session block', '[sso-session corp]\nsso_start_url = https://c.awsapps.com/start\n'],
    ['leading comments', '# my config\n\n[profile dev]\nregion = eu-west-1\n'],
    ['a UTF-8 BOM', '\uFEFF[profile dev]\nregion = eu-west-1\n'],
    ['CRLF line endings', '[profile dev]\r\nregion = eu-west-1\r\n'],
  ])('recognizes an AWS CLI config with %s', (_label, input) => {
    expect(detectImportFormat(input)).toBe('aws-config');
  });

  it.each([
    ['list-accounts output', '{"Accounts":[{"Id":"123456789012","Name":"prod"}]}'],
    [
      'a paginated response',
      '{"Accounts":[{"Id":"123456789012","Name":"prod"}],"NextToken":"abc"}',
    ],
    ['a bare account array', '[{"Id":"123456789012","Name":"prod"}]'],
    ['pretty-printed output', '{\n  "Accounts": [\n    { "Id": "123456789012" }\n  ]\n}'],
    ['a CRLF pretty-printed array', '[\r\n  {"Id":"123456789012","State":"ACTIVE"}\r\n]'],
    ['an empty account array', '[]'],
  ])('recognizes Organizations %s', (_label, input) => {
    expect(detectImportFormat(input)).toBe('organizations');
  });

  it.each([
    ['empty input', ''],
    ['whitespace only', '   \n\t  '],
    ['prose', 'Please import my AWS accounts.'],
    ['JSON without accounts', '{"Roles":[{"RoleName":"Admin"}]}'],
    ['an array of non-accounts', '[{"RoleName":"Admin"}]'],
    ['broken JSON', '{"Accounts":[{"Id":'],
    ['a bare key without a section', 'role_arn = arn:aws:iam::123456789012:role/R'],
    ['CSV', 'id,name\n123456789012,prod'],
  ])('returns unknown for %s', (_label, input) => {
    expect(detectImportFormat(input)).toBe('unknown');
  });

  it('does not mistake an INI value containing braces for JSON', () => {
    expect(detectImportFormat('[profile dev]\nrole_name = Role{1}\n')).toBe('aws-config');
  });
});
