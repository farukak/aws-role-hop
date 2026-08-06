# Privacy Policy

_Last updated: August 6, 2026_

RoleHop does not collect, transmit, sell, or share personal data. It has no analytics, telemetry, advertising, account service, or backend.

## Data stored locally

RoleHop stores the following in the browser's local extension storage:

- profile names;
- AWS account IDs or aliases;
- IAM role names or Identity Center permission-set names;
- AWS access portal URLs and optional landing regions;
- profile environments, tags, favorites, and last-used timestamps;
- interface and navigation preferences.

This data remains on the device and is not sent to the project maintainers. Browser-managed device backups or enterprise policies are controlled by the browser vendor or device administrator, not RoleHop.

## AWS navigation

When a user opens a profile, RoleHop navigates the browser to an AWS-owned sign-in or access-portal URL containing the metadata AWS needs to identify the requested account and role. AWS processes that request under its own terms and privacy policies. RoleHop cannot read the resulting AWS session or Console page.

## Imports and backups

AWS config imports are processed locally. Access keys, secret keys, session tokens, credential processes, credential sources, and token-file fields are explicitly ignored.

Backup files are created only after a user requests an export. They contain local profile metadata and preferences but no AWS credentials. Users control where those files are stored and shared.

## Browser permission

RoleHop requests the `storage` permission to save profiles and preferences. It does not request host access, browsing history, cookie, identity, or credential permissions.

## Data deletion

Users can remove individual profiles, reset all RoleHop data from Preferences, or uninstall the extension. Uninstall behavior is controlled by the browser.

## Changes and questions

Material changes to this policy will be included with the relevant release. General privacy questions may be opened as GitHub issues, but sensitive information must not be posted publicly.
