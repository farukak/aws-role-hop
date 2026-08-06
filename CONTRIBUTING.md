# Contributing

Thank you for improving RoleHop. Changes should keep the extension focused, private, and easy to audit.

## Before opening a change

- Discuss substantial features in an issue before implementation.
- Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Never include AWS credentials, session tokens, account data from a real organization, or personal information.
- Do not add telemetry, remote code, or browser permissions without an explicit design discussion.
- Keep dependencies minimal and pin new versions exactly.

## Local workflow

Use Node.js 24 and install from the lockfile:

```sh
npm ci
npm run check
```

Pull requests should be small enough to review, explain user-visible behavior, and include any browser-specific limitations. Generated `.output/` and `.wxt/` files must not be committed.

## Code and interface standards

- Keep domain logic independent from React and browser entrypoints.
- Validate all persisted and imported data at runtime.
- Preserve keyboard navigation, visible focus states, reduced-motion behavior, and light/dark contrast.
- Use concise comments only when the reason cannot be expressed clearly in code.
- Do not include placeholder documentation, generated screenshots, or unrelated editor settings.

By contributing, you agree that your work is licensed under the Apache License 2.0.
