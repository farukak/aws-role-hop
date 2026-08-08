# Security Policy

AWS Role Hop handles AWS profile metadata, so security and minimal browser access are core design requirements.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting from the repository **Security** tab. Do not open a public issue for suspected vulnerabilities and do not include live credentials, tokens, private account IDs, or organization data in a report.

Include the affected version, browser, reproduction steps, impact, and a minimal proof of concept when possible. Reports will be assessed before details are disclosed publicly.

## Supported versions

Until the first stable store release, security fixes are applied to the latest code on `main`. After stable publication, this section will identify supported release lines.

## Security boundaries

AWS Role Hop is designed to:

- request local-storage and `activeTab` access plus only the supported AWS Console origins;
- limit its only content script to those supported Console pages;
- inspect only AWS's switch-related session metadata, ephemeral CSRF value, and current destination URL;
- never read or use the browser cookie API;
- never store AWS access keys, secret keys, session tokens, cookies, or passwords;
- reject unsupported fields when restoring backups;
- ignore credential-bearing fields during AWS config import;
- bundle all executable code with the extension;
- rely on AWS to authenticate and authorize every role transition.

For IAM roles, AWS Role Hop must be opened from an authenticated AWS Console tab. Its isolated content script accepts only a validated, typed message from the extension and forwards it through a hidden DOM bridge to bundled code running in the page context. That bridge reads AWS's sign-in endpoint and ephemeral CSRF value, validates the endpoint against the profile's AWS partition, and submits AWS's native switch-role POST with the account, role, display name, AWS Role Hop color, and destination. AWS multi-session uses AWS's JSON switch endpoint and returned destination. No intermediate GET form or AWS Role Hop token is used.

AWS Role Hop does not read cookies, credentials, or unrelated Console content and does not use the browser cookie API. The switch metadata and CSRF value are never persisted. AWS controls whether the switch succeeds, how the role appears in Role history, and where the browser is redirected. AWS Role Hop does not alter AWS's separate account-level **Account color** setting. Users should treat exported backups as internal account metadata even though they contain no credentials.
