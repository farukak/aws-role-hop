# Privacy Policy

_Last updated: August 8, 2026_

AWS Role Hop processes user-provided AWS profile metadata locally to provide its features. It does not transmit that data to the project maintainers or any developer-controlled service, and it does not sell or share personal data. It has no analytics, telemetry, advertising, account service, or backend.

## Data stored locally

AWS Role Hop stores the following in the browser's local extension storage:

- profile names and profile-list names;
- the active list, default list, and automatic or manually selected profile color assignments;
- AWS account IDs or aliases;
- IAM role names or Identity Center permission-set names;
- AWS access portal URLs and optional landing regions;
- profile environments, tags, favorites, and last-used timestamps;
- interface and navigation preferences.

This data remains on the device and is not sent to the project maintainers. Browser-managed device backups or enterprise policies are controlled by the browser vendor or device administrator, not AWS Role Hop.

## AWS navigation

When a user opens an IAM profile, AWS Role Hop sends a message to its content script in the authenticated AWS Console tab. For the **New tab** preference, it first duplicates that Console tab and performs the switch there. A bundled page-context bridge reads AWS's own sign-in endpoint, standard-versus-multi-session metadata, and ephemeral CSRF value. It submits AWS's native switch-role request directly with the selected account, role name, display name, AWS Role Hop color, and destination URL. No intermediate Switch Role page is opened. Identity Center profiles continue to use AWS access-portal shortcut links.

The content script runs only on supported AWS Console origins. It does not read browser cookies, access keys, secret keys, session tokens, or page content unrelated to switching roles. The current Console URL is used only to preserve the destination and optional landing region. AWS Console metadata and the CSRF value remain in memory for the requested switch; AWS Role Hop does not store, log, analyze, or send them anywhere except the validated AWS sign-in endpoint. AWS verifies the current session and role access, persists role-history appearance, and controls the response and redirect.

## Imports and backups

AWS config and Organizations JSON imports are processed locally. Access keys, secret keys, session tokens, credential processes, credential sources, and token-file fields are explicitly ignored. Account email fields in Organizations output are not added to the profile model or shown in import details. Raw imported text is discarded after processing; only normalized profile fields selected for import are stored.

Backup files are created only after a user requests an export. They contain local profile metadata, profile lists, color assignments, and preferences but no AWS credentials. Users control where those files are stored and shared.

## Browser permission

AWS Role Hop requests `storage` for profiles, profile lists, and preferences; `activeTab` to address the Console tab from which the user opened the popup; and host access limited to supported AWS Console origins so its role-switch bridge can run there. It does not request broad `tabs`, browsing history, cookies, identity, or credential permissions and does not run on arbitrary websites.

## Data deletion

Users can remove individual profiles or profile lists, reset all AWS Role Hop data from Preferences, or uninstall the extension. Uninstall behavior is controlled by the browser.

## Changes and questions

Material changes to this policy will be included with the relevant release. General privacy questions may be opened as GitHub issues, but sensitive information must not be posted publicly.
