# Chrome Web Store submission

This document contains the canonical Chrome Web Store listing and reviewer disclosures for AWS Role Hop. Keep it consistent with `PRIVACY.md`, `SECURITY.md`, the generated manifest, and the extension's actual behavior.

## Release status

Before each submission:

1. Run `npm ci` with Node.js 24.
2. Run `npm run check`, `npm run lint:firefox`, and `npm audit --omit=dev --audit-level=high`.
3. Run a full `npm audit --audit-level=high` and review any documented development-tool exceptions before release.
4. Test the unpacked Chrome build from `.output/chrome-mv3` in a clean browser profile.
5. Verify both standard and AWS multi-session role switching, including two consecutive profile switches.
6. Tag the release so the workflow builds the packages, then verify them against the published `SHA256SUMS`.
7. Confirm the manifest inside the downloaded ZIP reports the intended version and the expected permissions.
8. Upload that exact release ZIP without repacking it; generated packages are not committed.

## Known upstream development-tool advisory

As of August 8, 2026, a full `npm audit --audit-level=high` reports the unpatched `image-size@2.0.2` development-tool advisories `GHSA-w3rx-r6r6-pgpr` and `GHSA-5p2g-fcmc-qvqq` through `addons-linter`, `web-ext`, and WXT. The affected packages are used only during development and package validation; they are not runtime dependencies and are not included in submitted browser ZIPs.

The enforced release gate is `npm audit --omit=dev --audit-level=high`, which must remain clean. Before each release, also run the full audit, review the exception, and check `image-size`, `addons-linter`, `web-ext`, and WXT for a patched compatible version. Do not apply the breaking `web-ext@5.5.0` downgrade suggested by `npm audit fix --force`.

## Store listing — English

### Name

AWS Role Hop

### Summary

Switch IAM roles and open AWS SSO accounts in one click. Private, local-only profile lists with no credentials and no telemetry.

### Detailed description

AWS Role Hop is a private profile launcher and role switcher for the AWS Management Console. It keeps IAM roles and AWS IAM Identity Center (AWS SSO) permission sets searchable in local browser storage and opens them in one click, without ever storing AWS credentials.

Pick your access path once, and change it whenever you want:

- IAM roles: switch roles straight from the AWS Console tab you are signed in to, using AWS's own switch-role request. No intermediate page.
- SSO: open account and permission-set shortcuts through your AWS access portal.

Key features:

- One click opens any profile, with an optional extra confirmation for production accounts.
- Discovery reads the accounts and permission sets your AWS access portal offers and turns them into profiles, so nothing has to be typed by hand. Your browser asks for access to the portal only when you start discovery, and you can withdraw it at any time.
- Scan the portal straight from the popup while you are on it.
- Separate default lists for IAM and SSO, so the two access paths never mix.
- Keyboard-first fuzzy search across profile names, account IDs, roles, environments, and tags.
- Named profile lists with favorites, tags, environments, landing regions, account-ID masking, and automatic or manually chosen pastel colors.
- Import AWS config and Organizations JSON with live validation and syntax highlighting.
- Access keys, secret keys, session tokens, credential processes, and Organizations email addresses are ignored during import.
- Export and restore local backups.
- English and Turkish interfaces with light, dark, and system themes.
- Standard AWS, AWS GovCloud (US), and AWS China partitions.

AWS Role Hop has no analytics, telemetry, advertising, account service, backend, or remotely hosted code, and nothing leaves your browser. AWS authenticates and authorizes every transition; AWS Role Hop cannot grant access that AWS has not already given you.

AWS Role Hop is independent and is not affiliated with, endorsed by, or sponsored by Amazon Web Services.

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

IAM rollerini değiştir, AWS SSO hesaplarını tek tıkla aç. Özel, yalnızca yerel profil listeleri; kimlik bilgisi saklanmaz.

### Ayrıntılı açıklama

AWS Role Hop, AWS Management Console için özel bir profil başlatıcısı ve rol değiştiricisidir. IAM rollerini ve AWS IAM Identity Center (AWS SSO) izin setlerini tarayıcının yerel depolamasında aranabilir tutar ve AWS kimlik bilgilerini hiç saklamadan tek tıkla açar.

Erişim yolunu bir kez seç, istediğin zaman değiştir:

- IAM rolleri: oturum açtığın AWS Console sekmesinden, AWS'nin kendi rol değiştirme isteğiyle doğrudan geçiş. Araya giren bir sayfa yok.
- SSO: hesap ve izin seti kısayollarını AWS erişim portalın üzerinden açma.

Başlıca özellikler:

- Her profil tek tıkla açılır; üretim hesapları için ek onay isteğe bağlıdır.
- Keşif, AWS erişim portalının sunduğu hesapları ve izin setlerini okuyup profile dönüştürür; elle yazmak gerekmez. Tarayıcın portala erişimi yalnızca keşfi başlattığında ister, izni istediğin zaman geri alabilirsin.
- Portaldayken taramayı doğrudan açılır pencereden yap.
- IAM ve SSO için ayrı varsayılan listeler; iki erişim yolu hiç karışmaz.
- Profil adları, hesap kimlikleri, roller, ortamlar ve etiketler arasında klavye öncelikli esnek arama.
- Adlandırılmış profil listeleri; favoriler, etiketler, ortamlar, açılış bölgeleri, hesap kimliği maskeleme ve otomatik veya elle seçilen pastel renkler.
- AWS config ve Organizations JSON verilerini canlı doğrulama ve sözdizimi renklendirmeyle içe aktarma.
- İçe aktarmada erişim anahtarları, gizli anahtarlar, oturum token'ları, credential process alanları ve Organizations e-posta adresleri yok sayılır.
- Yerel yedekleri dışa ve içe aktarma.
- Açık, koyu ve sistem temalarıyla İngilizce ve Türkçe arayüz.
- Standart AWS, AWS GovCloud (US) ve AWS China bölmeleri.

AWS Role Hop analiz, telemetri, reklam, hesap hizmeti, backend veya uzaktan barındırılan kod içermez; hiçbir veri tarayıcından çıkmaz. Her geçişin kimlik doğrulamasını ve yetkilendirmesini AWS yapar; AWS Role Hop, AWS'nin sana zaten vermediği bir erişimi veremez.

AWS Role Hop bağımsız bir projedir; Amazon Web Services ile bağlantılı değildir ve AWS tarafından desteklenmez veya onaylanmaz.

## Privacy practices

### Single purpose

AWS Role Hop lets users store and search AWS role and Identity Center profile metadata locally, then launch the selected profile through AWS's authenticated Console or access portal. Reading the accounts and permission sets a user's own access portal offers serves the same purpose: it fills those local profiles without manual entry.

### Permission justifications

#### `storage`

Stores user-created profile metadata, named lists, preferences, favorites, recent-use timestamps, and deterministic display-color assignments locally in extension storage. It never stores AWS credentials, cookies, session tokens, or raw import text.

#### `activeTab`

Identifies the AWS Console tab from which the user explicitly opened AWS Role Hop so the selected IAM switch can be requested in that tab. It is not used for browsing-history collection or access to unrelated tabs.

#### Supported AWS Console host access

Runs the narrowly scoped switch bridge only on supported AWS Console, Health, and Lightsail origins. The bridge reads only the current destination URL, AWS switch-session metadata, and the ephemeral CSRF value needed for the user-requested native AWS switch. It does not read arbitrary website content, browser history, cookies, or credentials.

#### Optional `scripting` and AWS access portal host access

Requested only when the user starts Identity Center discovery, never at install time. With it, AWS Role Hop runs a single bundled function inside an AWS access portal tab that asks the portal which accounts and permission sets the signed-in user may use, so those profiles do not have to be typed by hand. The lookup is same-origin, reads no cookie or token, and stores only the profiles the user selects. Users can withdraw the permission at any time.

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
- AWS access portal account names, account IDs, and permission-set names, read only during a user-started discovery and stored only for the profiles the user adds;
- preferences, favorites, tags, colors, and recent-use timestamps, stored locally.

No data is sent to the developer or any developer-controlled service. The selected switch fields and ephemeral AWS values are sent only to the validated AWS endpoint over HTTPS. Disclose local handling in the Dashboard even though the data is not transmitted to AWS Role Hop's developer. The Dashboard selections, listing, and privacy policy must remain mutually consistent.

Certify all applicable Limited Use statements. Do not select advertising, sale, creditworthiness, or unrelated analytics uses.

## Reviewer test instructions

AWS Role Hop does not include or require an AWS Role Hop account. IAM switching requires the reviewer to use an AWS account and Console session they are authorized to access; do not provide production AWS credentials in the submission.

Tests that require no AWS credentials:

1. Open the popup on a fresh profile. It asks whether you reach AWS through IAM roles or SSO; either choice can be changed later in Preferences or from the switcher in the popup.
2. Open AWS Role Hop's options page.
3. Create IAM-role and Identity Center profiles with non-sensitive test metadata.
4. Create, rename, activate, and delete profile lists. IAM and SSO each start with their own default list.
5. Paste sample AWS config data and verify live syntax highlighting, credential-field warnings, direct import, and inline list creation.
6. Choose SSO and open **Discover**. The screen states that the browser will ask for access to your own AWS access portal before anything is read. Reaching a real portal needs a reviewer-owned Identity Center instance; without one, the screen, its disclosure, and the refusal path remain fully reviewable.
7. Export a local backup, reset local data, and restore the backup.
8. Change language and theme preferences.

IAM switching test with a reviewer-owned AWS test account:

1. Sign in to AWS Console and keep the Console tab active.
2. Open AWS Role Hop and select an IAM profile authorized for that account.
3. Verify AWS performs the role switch without an intermediate GET page. Opening a profile takes a single click; the extra confirmation for production accounts is off by default and can be enabled in Preferences.
4. Reopen AWS Role Hop and select a second profile to verify consecutive switching.

## Listing assets

Required before submission:

- 128×128 store icon: generated as `icons/128.png` in the package.
- Five current 1280×800 screenshots using only fictional account data are tracked in `docs/assets/`: `01-profiles.png`, `02-import.png`, `03-preferences.png`, `04-whats-new.png`, and `05-discover.png`. `06-popup.png` shows the popup itself and is used in the README.
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
