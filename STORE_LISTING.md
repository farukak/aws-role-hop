# Chrome Web Store submission

This document contains the canonical Chrome Web Store listing and reviewer disclosures for AWS Role Hop. Keep it consistent with `PRIVACY.md`, `SECURITY.md`, the generated manifest, and the extension's actual behavior.

## Release status

Before each submission:

1. Run `npm ci` with Node.js 24.
2. Run `npm run check`, `npm run lint:firefox`, and `npm audit --omit=dev --audit-level=high`.
3. Run a full `npm audit --audit-level=high` and review any documented development-tool exceptions before release.
4. Test the unpacked Chrome build from `.output/chrome-mv3` in a clean browser profile.
5. Verify both standard and AWS multi-session role switching, including two consecutive profile switches.
6. Run `npm run zip:chrome` only after all source changes and checks are complete.
7. Confirm the ZIP manifest version matches `package.json` and the intended release tag.
8. Upload the Chrome ZIP from `.output/`; generated packages are not committed.

## Known upstream development-tool advisory

As of August 8, 2026, a full `npm audit --audit-level=high` reports the unpatched `image-size@2.0.2` development-tool advisories `GHSA-w3rx-r6r6-pgpr` and `GHSA-5p2g-fcmc-qvqq` through `addons-linter`, `web-ext`, and WXT. The affected packages are used only during development and package validation; they are not runtime dependencies and are not included in submitted browser ZIPs.

The enforced release gate is `npm audit --omit=dev --audit-level=high`, which must remain clean. Before each release, also run the full audit, review the exception, and check `image-size`, `addons-linter`, `web-ext`, and WXT for a patched compatible version. Do not apply the breaking `web-ext@5.5.0` downgrade suggested by `npm audit fix --force`.

## Store listing — English

### Name

AWS Role Hop

### Summary

Launch AWS Console roles and Identity Center profiles from private, local-only lists.

### Detailed description

AWS Role Hop is a private profile launcher for the AWS Management Console. It keeps IAM roles and IAM Identity Center permission sets searchable in local browser storage and opens them without storing AWS credentials.

Key features:

- Switch IAM roles directly from an authenticated AWS Console tab.
- Open IAM Identity Center account and permission-set shortcuts.
- Organize profiles into named lists with favorites, tags, environments, landing regions, and automatic or manually selected pastel colors.
- Import AWS config and Organizations JSON with live validation and syntax highlighting.
- Ignore access keys, secret keys, session tokens, credential processes, and Organizations email addresses during import.
- Export and restore local profile backups.
- Use English or Turkish interfaces with light, dark, and system themes.

AWS Role Hop has no analytics, telemetry, advertising, account service, backend, or remotely hosted code. AWS authenticates and authorizes every transition. AWS Role Hop is independent and is not affiliated with, endorsed by, or sponsored by Amazon Web Services.

### Category

Productivity

### Support URL

https://github.com/farukak/aws-role-hop/issues

### Homepage URL

https://github.com/farukak/aws-role-hop

### Privacy policy URL

https://github.com/farukak/aws-role-hop/blob/main/PRIVACY.md

The repository and privacy-policy URL must be publicly accessible before submission.

## Store listing — Turkish

### Ad

AWS Role Hop

### Kısa açıklama

AWS Console rollerini ve Identity Center profillerini özel, yalnızca yerel listelerden açın.

### Ayrıntılı açıklama

AWS Role Hop, AWS Management Console için özel bir profil başlatıcısıdır. IAM rollerini ve IAM Identity Center izin setlerini tarayıcının yerel depolamasında aranabilir tutar ve AWS kimlik bilgilerini saklamadan açar.

Başlıca özellikler:

- Kimliği doğrulanmış AWS Console sekmesinden IAM rollerine doğrudan geçiş.
- IAM Identity Center hesap ve izin seti kısayollarını açma.
- Profilleri adlandırılmış listeler, favoriler, etiketler, ortamlar, açılış bölgeleri ve otomatik veya elle seçilen pastel renklerle düzenleme.
- AWS config ve Organizations JSON verilerini canlı doğrulama ve sözdizimi renklendirmeyle içe aktarma.
- İçe aktarma sırasında erişim anahtarlarını, gizli anahtarları, oturum token'larını, credential process alanlarını ve Organizations e-posta adreslerini yok sayma.
- Yerel profil yedeklerini dışa ve içe aktarma.
- Açık, koyu ve sistem temalarıyla İngilizce veya Türkçe arayüz.

AWS Role Hop analiz, telemetri, reklam, hesap hizmeti, backend veya uzaktan barındırılan kod içermez. Her geçişin kimlik doğrulamasını ve yetkilendirmesini AWS yapar. AWS Role Hop bağımsız bir projedir; Amazon Web Services ile bağlantılı değildir ve AWS tarafından desteklenmez veya onaylanmaz.

## Privacy practices

### Single purpose

AWS Role Hop lets users store and search AWS role and Identity Center profile metadata locally, then launch the selected profile through AWS's authenticated Console or access portal.

### Permission justifications

#### `storage`

Stores user-created profile metadata, named lists, preferences, favorites, recent-use timestamps, and deterministic display-color assignments locally in extension storage. It never stores AWS credentials, cookies, session tokens, or raw import text.

#### `activeTab`

Identifies the AWS Console tab from which the user explicitly opened AWS Role Hop so the selected IAM switch can be requested in that tab. It is not used for browsing-history collection or access to unrelated tabs.

#### Supported AWS Console host access

Runs the narrowly scoped switch bridge only on supported AWS Console, Health, and Lightsail origins. The bridge reads only the current destination URL, AWS switch-session metadata, and the ephemeral CSRF value needed for the user-requested native AWS switch. It does not read arbitrary website content, browser history, cookies, or credentials.

#### Web-accessible resource

`aws-console-bridge.js` is bundled with the extension and exposed only to the supported AWS Console origins so it can call AWS's page-context switch API. It is not remotely hosted code.

### Remote code

Select: **No, this extension does not use remote code.**

All executable JavaScript is bundled in the submitted package. AWS network responses are data and are not executed as extension code.

### Data handling disclosure

AWS Role Hop handles the following data only to provide its user-facing purpose:

- user-entered AWS profile and profile-list metadata, stored locally;
- the current supported AWS Console URL, processed in memory to preserve the destination;
- AWS switch-session metadata and an ephemeral CSRF value, processed in memory for the requested switch;
- preferences, favorites, tags, colors, and recent-use timestamps, stored locally.

No data is sent to the developer or any developer-controlled service. The selected switch fields and ephemeral AWS values are sent only to the validated AWS endpoint over HTTPS. Disclose local handling in the Dashboard even though the data is not transmitted to AWS Role Hop's developer. The Dashboard selections, listing, and privacy policy must remain mutually consistent.

Certify all applicable Limited Use statements. Do not select advertising, sale, creditworthiness, or unrelated analytics uses.

## Reviewer test instructions

AWS Role Hop does not include or require an AWS Role Hop account. IAM switching requires the reviewer to use an AWS account and Console session they are authorized to access; do not provide production AWS credentials in the submission.

Tests that require no AWS credentials:

1. Open AWS Role Hop's options page.
2. Create IAM-role and Identity Center profiles with non-sensitive test metadata.
3. Create, rename, activate, and delete profile lists.
4. Paste sample AWS config data and verify live syntax highlighting, credential-field warnings, direct import, and inline list creation.
5. Export a local backup, reset local data, and restore the backup.
6. Change language and theme preferences.

IAM switching test with a reviewer-owned AWS test account:

1. Sign in to AWS Console and keep the Console tab active.
2. Open AWS Role Hop and select an IAM profile authorized for that account.
3. Confirm production profiles when prompted.
4. Verify AWS performs the role switch without an intermediate GET page.
5. Reopen AWS Role Hop and select a second profile to verify consecutive switching.

## Listing assets

Required before submission:

- 128×128 store icon: generated as `icons/128.png` in the package.
- Four current 1280×800 screenshots using only fictional account data are tracked in `docs/assets/`.
- Small promotional tile: `docs/assets/store-promo-440x280.png` (440×280).
- Marquee image: `docs/assets/store-marquee-1400x560.png` (1400×560).
- GitHub social preview: `docs/assets/social-preview.png` (1280×640).

Do not upload screenshots containing real AWS account IDs, browser bookmarks, costs, usernames, credentials, or production Console data. Store assets should use fictional twelve-digit account IDs and must match the submitted UI version.

## GitHub repository presentation

Keep the public repository settings aligned with the product:

- About description: `Private, local-only AWS Console profile launcher for IAM roles and IAM Identity Center — no credentials stored.`
- Website: `https://github.com/farukak/aws-role-hop#readme`
- Topics: `aws`, `aws-console`, `iam`, `aws-identity-center`, `browser-extension`, `chrome-extension`, `firefox-addon`, `manifest-v3`, `privacy`, `react`, `typescript`, and `wxt`.
- Social preview: upload `docs/assets/social-preview.png` from **Settings → General → Social preview**.
- Keep Releases enabled, use `main` as the default branch, and disable unused repository features.

These settings are stored by GitHub rather than in the repository, so verify them again before each public launch.

## External dashboard tasks

These cannot be completed from the repository:

- Register and verify the Chrome Web Store developer account.
- Confirm the publisher name and support email.
- Upload listing images and localized listing text.
- Complete Privacy practices, Distribution, and Test instructions.
- Choose deferred publishing for the first review.
- Submit the item and respond to reviewer questions.
