# Changelog

All notable changes to AWS Role Hop are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-08-16

### Removed

- The access-mode setting, along with the first-run question that asked for it and the switcher in the popup. Both ways into AWS are always available instead: **Import** brings in IAM roles, **Discover** reads accounts from an AWS access portal. Storage moved to version 6, which drops the stored setting; nothing else in a saved profile changes.

### Changed

- The list on screen now decides what the popup offers. Selecting the SSO list shows the portal scan and points an empty list at discovery; any other list points at adding or importing a role.
- The popup lists the active list as it is. Filtering by access path is gone, and with it the notice that explained what the filter had hidden.
- Identity Center profiles found in a pasted AWS config are written to the SSO list whatever destination is chosen, so a mixed config no longer mixes the lists. The SSO list is recreated if it was deleted.
- **Import** no longer offers the SSO list as a destination, and **Discover** writes only to it.

### Fixed

- Focused fields drew a second ring inside the wrapper that already had one, which showed up as two vertical lines at the edges of the search box and the list pickers.
- An import that failed because a role ARN carried a stray space reported the whole expected format instead of the actual problem. Lists carried between tools pick this up, and the message now names the space.

## [0.2.0] - 2026-08-13

### Added

- A first-run question asking whether you reach AWS through IAM roles or SSO, with a separate mark for each path and an upfront note that SSO needs access to your AWS access portal. The choice is changeable in Preferences and from a switcher in the popup.
- Discovery of Identity Center accounts and permission sets from an AWS access portal, so they no longer have to be typed by hand. The lookup runs inside a portal tab, which makes it same-origin and lets the browser attach the session that is already there; no cookie or token is read or stored.
- Access to an AWS access portal origin as an **optional** permission. The browser asks for it only when discovery starts, so the default permission surface is unchanged and it can be withdrawn at any time.
- Scanning the portal from the popup while a portal tab is open, including choosing which discovered roles to keep.
- Separate built-in lists for the two access paths, **Default IAM** and **Default SSO**. Switching access path also switches the list on screen.
- A short line in the popup describing what to do in the active access path.

### Changed

- Opening a profile takes a single click. The production confirmation is off by default and stays available in Preferences.
- The popup lists only the profiles of the active access path, and says when the same list also holds profiles for the other one instead of hiding them silently.
- Storage moved to version 5. Existing installs keep everything: the shared list is renamed **Default IAM**, Identity Center profiles in it move to **Default SSO**, and the access path is derived from the profiles already stored so nobody is sent back through the first-run question.

### Fixed

- Identity Center profiles could not be created on the current AWS access portal format, which is served from the host root rather than from `/start`.
- The storage migration chain returned early for a stored version 3, so a later migration step would never have run.
- A failed portal lookup reported one generic message. Failures now carry the endpoint and the reason, and a request that is refused inside the portal tab is reported instead of being swallowed.

## [0.1.3] - 2026-08-13

### Added

- Duplicate warnings before an import runs, covering both profiles whose sign-in target already exists and profiles that reuse a name already in the destination list.
- A **Load list into editor** action that rebuilds an editable AWS config from a stored profile list. Raw import text is still never stored; the text is generated from the saved profiles.

### Changed

- A multi-session switch now opens its destination in a new tab and leaves the session it was made from untouched, so that session can still authorize later switches.

### Fixed

- AWS multi-session switches that AWS refused reported only a raw HTTP status. Failures are now classified and explained, including the role-chaining case where the session had already assumed a role.
- A multi-session switch attempted from a session that already assumed a role now retries from a Console tab still on the signed-in session instead of failing outright.
- The multi-session sign-in host is resolved from the separately published Console endpoint and the infrastructure region when the session metadata omits it, instead of falling back to a host that cannot authorize the switch.
- An AWS error code returned alongside a successful HTTP status is now honored instead of being reported as a missing destination.
- Chrome no longer records a cross-world resource warning for the generated extension pages.
- Importing with no valid profiles reported nothing; it now explains why.

## [0.1.2] - 2026-08-09

### Added

- An accessible profile color picker with automatic assignment and all eight supported pastel colors.

### Fixed

- The palette control in the Add/Edit Profile dialog now opens a real keyboard-operable picker instead of appearing interactive while doing nothing.
- Manually selected colors now persist when profiles are added or edited; choosing **Automatic** safely recalculates the assignment.
- Imports continue to assign colors automatically unless a valid supported color is explicitly provided.

## [0.1.1] - 2026-08-09

### Added

- A permanent **What's new** item in the options sidebar for direct access to bundled release notes.
- A visible **Faruk AK** creator credit directly below the **Local by design** card, linked safely to the developer's GitHub profile.

### Changed

- The release-notes sidebar item now exposes the active-page state to assistive technology and remains available in both English and Turkish.

## [0.1.0] - 2026-08-09

### Added

- Unlimited named profile lists with active-list switching, a configurable default import destination, list-scoped duplicate detection, and persistent automatic pastel colors.
- A direct **Import profiles** action in the empty popup that opens the import screen immediately.
- Bundled English and Turkish release notes, opened once after a genuine extension upgrade and always available from Preferences.
- Explicit creator credit and GitHub links for Faruk AK in the application and project documentation.
- AWS Organizations JSON import, drag-and-drop file input, accessible INI/JSON syntax highlighting, debounced live validation, existing-or-new destination selection, and direct credential-safe import.
- English and Turkish interfaces with system-language detection and an explicit language preference.
- Full-tab options UI, loaded-extension Playwright journeys, and component coverage for profile-list lifecycle and import navigation.
- Unit test suite (Vitest) covering profile validation, the deterministic color system, AWS sign-in URL construction, AWS config import, the storage layer, and WCAG contrast of the design tokens in both themes.
- `npm test`, `npm run test:watch`, `npm run test:coverage`, and `npm run lint:firefox` scripts. `npm run check` now runs the tests.
- CI validates the Firefox add-on with `web-ext lint` and verifies that the Chrome, Edge, and Firefox store packages can be produced. A tag-triggered release workflow builds, validates, and attaches those packages to a draft GitHub release.
- Issue and pull request templates, a code of conduct, and Dependabot updates for npm and GitHub Actions.

### Changed

- Successful imports now make their destination list active and return to Profiles. The import screen follows default-list changes and preselects the current default reliably.
- GitHub presentation now includes current fictional-data screenshots, privacy and build badges, safe unpacked-install guidance, and a social preview asset.
- Tagged release automation now extracts version-specific changelog notes and publishes SHA-256 checksums alongside browser packages.
- IAM role launches now begin in the authenticated AWS Console tab. A content script limited to supported Console origins sends a typed profile request to a bundled page-context bridge, which uses AWS's own sign-in metadata and ephemeral CSRF value to submit the native switch-role POST directly. The intermediate Switch Role page is never opened.
- Popup and Preferences copy discloses the limited AWS Console access, direct AWS request, and absence of broad tabs, cookie, history, identity, or credential permissions.
- Loaded-extension E2E now proves that an IAM launch issues exactly a POST to AWS's partition-correct switch-role endpoint with the account, role, display name, landing destination, CSRF value, and six-digit AWS Role Hop color; no account data appears in an intermediate GET URL.
- Profile-list actions use visible text labels, and active/default-list meanings are explained in the interface.
- Import guidance uses a syntax-highlighted editor, debounced live readiness, inline destination-list creation, a single direct import action, and a **Manage selected list** action. Raw import text is never retained; existing normalized profiles remain editable in Profiles.
- An IAM role profile's AWS partition is now part of its identity, so the same account alias and role can exist in more than one partition.
- Landing regions are normalized to lowercase during validation instead of being rejected when entered in uppercase.
- Type-aware ESLint rules and the `noUnusedLocals` / `noUnusedParameters` compiler checks are enabled. The engine floor now matches the documented and CI-enforced Node version.

### Fixed

- Real AWS Console CSRF values returned asynchronously or as boxed strings no longer cause `trim is not a function`; unsupported values fail with an actionable refresh message instead.
- Storage initialization and migrations are serialized with state mutations, preventing first-run and upgrade writes from overwriting newer user changes.
- IAM switching now validates the active AWS Console tab before side effects, validates AWS-returned destinations, cleans bridge metadata, and times out stalled multi-session requests.
- Import previews stop at the 500-profile storage limit, oversized pasted input receives accessible feedback, and reset actions remain disabled while deletion is in progress.
- Locale-sensitive profile, list, tag, search, source-profile, and browser-language normalization is now deterministic.
- GET-prefill navigation caused a visible intermediate page and could not reliably persist a display color. AWS Role Hop now submits the same AWS-native POST contract used by the Console: standard sessions use the page's ephemeral CSRF value and hidden form, while AWS multi-session uses its JSON endpoint. The profile's stable six-digit RGB color is stored by AWS for the active-role badge and new Role history entry; AWS's separate account-level **Account color** setting remains untouched.
- Consecutive IAM switches no longer race AWS Console reloads. AWS Role Hop now waits for a non-mutating bridge-readiness response before sending each switch request exactly once, so rapidly opening a second profile does not stall or duplicate the AWS POST.
- Parallel import component tests no longer share clipboard state, eliminating input corruption and timeout flakes.
- Loaded-extension E2E uses two persistent Chromium workers in every environment, preventing local setup timeouts while preserving parallel coverage.
- The main `npm run check` gate now enforces coverage thresholds and reuses the completed Chrome build for E2E instead of rebuilding it.
- Firefox store-review source archives exclude generated coverage reports.
- Import destination state no longer remains on a stale list when the configured default changes as the view opens.
- Profile and backup validation now reject malformed account IDs, aliases, role paths, regions, portal URLs, control characters, duplicate IDs, duplicate list names, and dangling references.
- Storage, backup, restore, stale-action, and malformed-draft failures now produce user-facing errors instead of unhandled rejections.
- A malformed `role_arn` during AWS config import is now reported in live import details instead of being dropped silently.
- Light-theme secondary copy failed WCAG AA: `--color-text-tertiary` measured 2.96:1 against the canvas and is now 4.61:1 or better on every surface.
- Theme and open-behavior choices expose `role="radio"` but ignored the arrow keys. They are now a single tab stop with arrow-key selection.
- Form validation errors in the profile dialog are announced by assistive technology and linked to their input with `aria-describedby`.
- All four modal dialogs expose an accessible name and description, the popup has a top-level heading, and both the popup and the options list announce how many profiles match the current search.
- Removed a keyboard shortcut hint in the popup search field that no handler implemented and that showed a macOS-only key on every platform.

[Unreleased]: https://github.com/farukak/aws-role-hop/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/farukak/aws-role-hop/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/farukak/aws-role-hop/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/farukak/aws-role-hop/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/farukak/aws-role-hop/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/farukak/aws-role-hop/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/farukak/aws-role-hop/releases/tag/v0.1.0
