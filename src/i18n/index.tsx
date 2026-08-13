import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import type { AppSettings } from '../domain/profile';
import { useAppState } from '../hooks/useAppState';

const TURKISH_MESSAGES = {
  'AWS console profiles': 'AWS konsol profilleri',
  'AWS Role Hop profiles': 'AWS Role Hop profilleri',
  'Profiles unavailable': 'Profillere ulaşılamıyor',
  'AWS Role Hop could not load its local data.': 'AWS Role Hop yerel verilerini yükleyemedi.',
  'Open settings': 'Ayarları aç',
  'AWS profiles': 'AWS profilleri',
  'The browser could not open this profile.': 'Tarayıcı bu profili açamadı.',
  'Could not update the favorite.': 'Favori güncellenemedi.',
  'Search profiles, accounts, or roles': 'Profil, hesap veya rol ara',
  'Search profiles': 'Profillerde ara',
  'Clear search': 'Aramayı temizle',
  '{matches} of {total} profiles match "{query}".':
    '{total} profilden {matches} tanesi “{query}” ile eşleşiyor.',
  '{count} profiles available.': '{count} profil kullanılabilir.',
  'Add your first profile': 'İlk profilini ekle',
  'Create an IAM role or Identity Center shortcut. Everything stays in this browser.':
    'Bir IAM rolü veya Identity Center kısayolu oluştur. Her şey bu tarayıcıda kalır.',
  'Add profile': 'Profil ekle',
  'No matching profiles': 'Eşleşen profil yok',
  'Try a profile name, account ID, role, environment, or tag.':
    'Profil adı, hesap kimliği, rol, ortam veya etiket dene.',
  '1 profile': '1 profil',
  '{count} profiles': '{count} profil',
  'Stored locally': 'Yerel olarak saklanır',
  'Remove {name} from favorites': '{name} profilini favorilerden çıkar',
  'Favorite {name}': '{name} profilini favorile',
  'Open production?': 'Production profili açılsın mı?',
  'You are about to open {name} with the {role} role.':
    '{name} profilini {role} rolüyle açmak üzeresin.',
  Cancel: 'İptal',
  Continue: 'Devam et',
  'Loading profiles': 'Profiller yükleniyor',
  Profiles: 'Profiller',
  Import: 'İçe aktar',
  Preferences: 'Tercihler',
  Settings: 'Ayarlar',
  'Unable to load AWS Role Hop': 'AWS Role Hop yüklenemedi',
  'The local profile store could not be opened.': 'Yerel profil deposu açılamadı.',
  Reload: 'Yeniden yükle',
  'Local by design': 'Tasarım gereği yerel',
  'No telemetry or cloud service': 'Telemetri veya bulut hizmeti yok',
  'Dismiss notification': 'Bildirimi kapat',
  'Loading settings': 'Ayarlar yükleniyor',
  'Your experience': 'Deneyimin',
  'Control appearance, navigation, and local data.': 'Görünümü, gezinmeyi ve yerel verileri yönet.',
  'Access mode': 'Erişim modu',
  'How do you use AWS?': 'AWS’i nasıl kullanıyorsun?',
  'Choose the access path AWS Role Hop should open with. You can change it later in settings.':
    'AWS Role Hop’un hangi erişim yoluyla açılacağını seç. Bunu daha sonra ayarlardan değiştirebilirsin.',
  'Switch roles from an authenticated AWS Console tab.':
    'Kimliği doğrulanmış bir AWS Console sekmesinden rol değiştir.',
  'Open permission sets through your AWS access portal.':
    'İzin setlerini AWS erişim portalın üzerinden aç.',
  'AWS Role Hop asks for portal access only when you choose Identity Center.':
    'AWS Role Hop portal erişimini yalnızca Identity Center’ı seçtiğinde ister.',
  'Could not save the access mode.': 'Erişim modu kaydedilemedi.',
  IAM: 'IAM',
  SSO: 'SSO',
  'This list also has SSO profiles.': 'Bu listede SSO profilleri de var.',
  'This list also has IAM profiles.': 'Bu listede IAM profilleri de var.',
  'Switch to SSO': 'SSO’ya geç',
  'Switch to IAM': 'IAM’e geç',
  'You are on an AWS access portal.': 'Bir AWS erişim portalındasın.',
  'Scan this portal': 'Bu portalı tara',
  'Bring in your SSO accounts': 'SSO hesaplarını içeri al',
  'AWS Role Hop can ask your AWS access portal which accounts and roles you may use, then keep them here.':
    'AWS Role Hop, AWS erişim portalına hangi hesap ve rolleri kullanabildiğini sorup bunları burada tutabilir.',
  'SSO profiles open through your AWS access portal. AWS still verifies your session and access.':
    'SSO profilleri AWS erişim portalın üzerinden açılır. Oturumunu ve erişimini yine AWS doğrular.',
  Discover: 'Keşfet',
  'Find accounts from your AWS access portal': 'AWS erişim portalından hesapları bul',
  'AWS Role Hop asks the portal which accounts and permission sets you can use, then turns them into profiles.':
    'AWS Role Hop portala hangi hesapları ve izin setlerini kullanabildiğini sorar, sonra bunları profile dönüştürür.',
  'Portal access stays optional': 'Portal erişimi isteğe bağlı kalır',
  'Your browser asks before AWS Role Hop may reach the portal. The lookup runs in a portal tab with your existing session, and no token is ever read or stored.':
    'AWS Role Hop portala erişmeden önce tarayıcın izin ister. Sorgu mevcut oturumunla bir portal sekmesinde çalışır; hiçbir jeton okunmaz veya saklanmaz.',
  'Access portal URL': 'Erişim portalı adresi',
  'Find accounts and roles': 'Hesapları ve rolleri bul',
  'Searching the access portal…': 'Erişim portalı taranıyor…',
  'Found {roles} roles across {accounts} accounts.': '{accounts} hesapta {roles} rol bulundu.',
  'Nothing was found in this portal.': 'Bu portalda bir şey bulunamadı.',
  'Select all': 'Tümünü seç',
  'Clear selection': 'Seçimi temizle',
  'Add discovered profiles to': 'Bulunan profilleri şuraya ekle',
  'Add selected profiles': 'Seçili profilleri ekle',
  '{added} added, {skipped} already existed.': '{added} eklendi, {skipped} zaten vardı.',
  'The discovered profiles could not be added.': 'Bulunan profiller eklenemedi.',
  'Portal access is needed before AWS Role Hop can read your accounts.':
    'AWS Role Hop hesaplarını okuyabilmek için portal erişimi gerekir.',
  'The access portal tab could not be opened.': 'Erişim portalı sekmesi açılamadı.',
  'Sign in to the access portal in a tab, then try again.':
    'Portalı bir sekmede aç ve giriş yap, sonra tekrar dene.',
  'The access portal could not be read.': 'Erişim portalı okunamadı.',
  'Choose which AWS access path AWS Role Hop is set up for.':
    'AWS Role Hop’un hangi AWS erişim yolu için kurulduğunu seç.',
  'IAM roles': 'IAM rolleri',
  'Switch inside the AWS Console': 'AWS Console içinde geçiş yap',
  'IAM Identity Center': 'IAM Identity Center',
  'Needs access to your AWS access portal': 'AWS erişim portalına erişim gerektirir',
  Appearance: 'Görünüm',
  'Use your browser preference or choose a fixed theme.':
    'Tarayıcı tercihini kullan veya sabit bir tema seç.',
  Theme: 'Tema',
  System: 'Sistem',
  'Follow the browser': 'Tarayıcıyı izle',
  Light: 'Açık',
  'Always light': 'Her zaman açık',
  Dark: 'Koyu',
  'Always dark': 'Her zaman koyu',
  'Interface language': 'Arayüz dili',
  'Use your browser language or choose English or Turkish.':
    'Tarayıcı dilini kullan veya İngilizce ya da Türkçe seç.',
  Language: 'Dil',
  'Browser language': 'Tarayıcı dili',
  English: 'İngilizce',
  Turkish: 'Türkçe',
  'Role navigation': 'Rol gezinmesi',
  'Choose how AWS Role Hop opens AWS and handles sensitive environments.':
    'AWS Role Hop’un AWS’i nasıl açacağını ve hassas ortamları nasıl işleyeceğini seç.',
  'Open behavior': 'Açma davranışı',
  'Current tab': 'Geçerli sekme',
  'Replace the active page': 'Etkin sayfanın yerine aç',
  'New tab': 'Yeni sekme',
  'Keep your current page open': 'Geçerli sayfayı açık tut',
  'Confirm production profiles': 'Production profillerini onayla',
  'Require one extra confirmation before opening a production role.':
    'Production rolünü açmadan önce ek onay iste.',
  'Hide account IDs': 'Hesap kimliklerini gizle',
  'Show only the final four characters in AWS Role Hop interfaces.':
    'AWS Role Hop arayüzlerinde yalnızca son dört karakteri göster.',
  'Data and privacy': 'Veri ve gizlilik',
  '{count} profiles stored in this browser.': 'Bu tarayıcıda {count} profil saklanıyor.',
  'Local storage + AWS handoff': 'Yerel depolama + AWS aktarımı',
  'Limited AWS Console access; no broad tabs, cookie, or history permission':
    'Sınırlı AWS Console erişimi; geniş sekme, çerez veya geçmiş izni yok',
  'No data collection': 'Veri toplama yok',
  'No analytics, telemetry, account, or remote service':
    'Analitik, telemetri, hesap veya uzak hizmet yok',
  'Export backup': 'Yedeği dışa aktar',
  'Restore backup': 'Yedeği geri yükle',
  'Backup file': 'Yedek dosyası',
  'Reset all data': 'Tüm verileri sıfırla',
  'Open source · Apache-2.0': 'Açık kaynak · Apache-2.0',
  'Not affiliated with Amazon Web Services': 'Amazon Web Services ile bağlantılı değildir',
  'Reset all local data?': 'Tüm yerel veriler sıfırlansın mı?',
  'Profiles and preferences will be permanently removed from this browser.':
    'Profiller ve tercihler bu tarayıcıdan kalıcı olarak kaldırılır.',
  'Reset data': 'Verileri sıfırla',
  Production: 'Production',
  Staging: 'Staging',
  Development: 'Geliştirme',
  Sandbox: 'Sandbox',
  'Shared services': 'Paylaşılan hizmetler',
  Other: 'Diğer',
  Workspace: 'Çalışma alanı',
  'Profile lists': 'Profil listeleri',
  'Profile list': 'Profil listesi',
  'Default list': 'Varsayılan liste',
  'The active list appears in the popup. The default list is preselected for imports.':
    'Aktif liste popup’ta gösterilir. Varsayılan liste içe aktarmalarda önceden seçilir.',
  'Active list': 'Aktif liste',
  'Active profile list': 'Aktif profil listesi',
  Default: 'Varsayılan',
  'New list': 'Yeni liste',
  Rename: 'Yeniden adlandır',
  'Make default': 'Varsayılan yap',
  'Create profile list': 'Profil listesi oluştur',
  'Rename {name}': '{name} listesini yeniden adlandır',
  'Make {name} the default list': '{name} listesini varsayılan yap',
  'Delete {name} list': '{name} listesini sil',
  'Could not select the profile list.': 'Profil listesi seçilemedi.',
  '{name} is now the default list.': '{name} artık varsayılan liste.',
  'Could not update the default list.': 'Varsayılan liste güncellenemedi.',
  '{name} list created.': '{name} listesi oluşturuldu.',
  'Profile list renamed.': 'Profil listesi yeniden adlandırıldı.',
  '{name} list deleted.': '{name} listesi silindi.',
  'Could not update profile lists.': 'Profil listeleri güncellenemedi.',
  'Rename profile list': 'Profil listesini yeniden adlandır',
  'Delete {name} list?': '{name} listesi silinsin mi?',
  'This also removes 1 local profile. Nothing changes in AWS.':
    'Bu işlem 1 yerel profili de kaldırır. AWS üzerinde hiçbir şey değişmez.',
  'This also removes {count} local profiles. Nothing changes in AWS.':
    'Bu işlem {count} yerel profili de kaldırır. AWS üzerinde hiçbir şey değişmez.',
  'List name': 'Liste adı',
  'Create list': 'Liste oluştur',
  'Delete list': 'Listeyi sil',
  'Keep every AWS account and role one search away.':
    'Tüm AWS hesaplarını ve rollerini tek arama uzağında tut.',
  'Manage the profiles and lists that appear in the AWS Role Hop popup.':
    'AWS Role Hop popup’ında görünen profilleri ve listeleri yönet.',
  'This list has no profiles yet': 'Bu listede henüz profil yok',
  'Add one profile manually or import several profiles into this list.':
    'Tek bir profili elle ekle veya birden fazla profili bu listeye içe aktar.',
  'Add one profile': 'Tek profil ekle',
  'Import profiles': 'Profilleri içe aktar',
  'Profile added.': 'Profil eklendi.',
  'Profile updated.': 'Profil güncellendi.',
  '{name} deleted.': '{name} silindi.',
  'Could not delete the profile.': 'Profil silinemedi.',
  'Search by name, account, role, or tag': 'Ada, hesaba, role veya etikete göre ara',
  '{matches} of {total} match': '{total} profilden {matches} tanesi eşleşiyor',
  'No profiles yet': 'Henüz profil yok',
  'Add profiles individually or import an existing AWS config. Credentials are never needed.':
    'Profilleri tek tek ekle veya mevcut AWS yapılandırmasını içe aktar. Kimlik bilgileri gerekmez.',
  'Create profile': 'Profil oluştur',
  'Try a different name, account ID, role, environment, or tag.':
    'Farklı bir ad, hesap kimliği, rol, ortam veya etiket dene.',
  'Identity Center': 'Identity Center',
  'IAM role': 'IAM rolü',
  Account: 'Hesap',
  'Permission set': 'İzin kümesi',
  Role: 'Rol',
  Portal: 'Portal',
  Edit: 'Düzenle',
  Delete: 'Sil',
  'Delete {name}?': '{name} silinsin mi?',
  'This removes the local profile only. It does not change anything in AWS.':
    'Bu işlem yalnızca yerel profili kaldırır; AWS üzerinde hiçbir şeyi değiştirmez.',
  'Delete profile': 'Profili sil',
  'Edit profile': 'Profili düzenle',
  'New profile': 'Yeni profil',
  'Add an AWS profile': 'AWS profili ekle',
  'Close dialog': 'İletişim kutusunu kapat',
  'Connection type': 'Bağlantı türü',
  'Profile name': 'Profil adı',
  'AWS account ID': 'AWS hesap kimliği',
  'Account ID or alias': 'Hesap kimliği veya takma ad',
  'Enter exactly 12 digits.': 'Tam olarak 12 rakam gir.',
  'Enter exactly 12 digits, or a 3–63 character lowercase account alias.':
    'Tam olarak 12 rakam veya 3–63 karakterlik küçük harfli bir hesap takma adı gir.',
  'Role name or path': 'Rol adı veya yolu',
  Environment: 'Ortam',
  'AWS partition': 'AWS partition',
  'AWS access portal URL': 'AWS erişim portalı URL’si',
  'Landing region': 'Açılış region’ı',
  'Optional. Opens the console in this region, for example eu-west-1.':
    'İsteğe bağlı. Konsolu örneğin eu-west-1 region’ında açar.',
  Tags: 'Etiketler',
  'Separate up to eight tags with commas.': 'En fazla sekiz etiketi virgülle ayır.',
  'assigned automatically': 'otomatik atandı',
  'selected manually': 'elle seçildi',
  'Choose profile color': 'Profil rengi seç',
  'Profile color': 'Profil rengi',
  Automatic: 'Otomatik',
  'Soft rose': 'Yumuşak gül',
  'Soft peach': 'Yumuşak şeftali',
  'Soft amber': 'Yumuşak kehribar',
  'Soft mint': 'Yumuşak nane',
  'Soft teal': 'Yumuşak turkuaz',
  'Soft sky': 'Yumuşak gök mavisi',
  'Soft indigo': 'Yumuşak çivit mavisi',
  'Soft lilac': 'Yumuşak leylak',
  'Favorite profile': 'Favori profil',
  'Keep this profile near the top of search results.':
    'Bu profili arama sonuçlarının üst sıralarında tut.',
  'Save changes': 'Değişiklikleri kaydet',
  'Could not save the profile.': 'Profil kaydedilemedi.',
  'AWS did not authorize this switch. Check that this session may assume the role, then sign in again if needed.':
    'AWS bu geçişi yetkilendirmedi. Bu oturumun role geçme yetkisi olduğunu doğrula, gerekirse yeniden giriş yap.',
  'This AWS Console session already assumed a role. Multi-session switches have to start from the session you signed in with.':
    'Bu AWS Console oturumunda zaten bir rol üstlenildi. Multi-session geçişleri, giriş yaptığın oturumdan başlamak zorunda.',
  'This AWS Console session is no longer available. Reload the tab and try again.':
    'Bu AWS Console oturumu artık kullanılamıyor. Sekmeyi yenileyip tekrar dene.',
  'AWS is limiting switch requests right now. Wait a moment and try again.':
    'AWS şu anda geçiş isteklerini sınırlıyor. Biraz bekleyip tekrar dene.',
  'AWS could not complete the switch. Try again in a moment.':
    'AWS geçişi tamamlayamadı. Biraz sonra tekrar dene.',
  'AWS rejected the switch request.': 'AWS geçiş isteğini reddetti.',
  'Bring your profiles': 'Profillerini getir',
  'Import AWS config': 'AWS yapılandırmasını içe aktar',
  'Add many profiles': 'Birden fazla profil ekle',
  'Paste profile metadata, choose a destination, and import when it is ready.':
    'Profil metadatasını yapıştır, hedefi seç ve hazır olduğunda içe aktar.',
  'Paste or drop a file': 'Yapıştır veya dosya bırak',
  'Supports AWS CLI profiles, Identity Center sessions, and Organizations JSON.':
    'AWS CLI profillerini, Identity Center oturumlarını ve Organizations JSON çıktısını destekler.',
  'Review every profile before it reaches local storage.':
    'Yerel depolamaya ulaşmadan önce her profili incele.',
  'Choose file': 'Dosya seç',
  Configuration: 'Yapılandırma',
  'AWS CLI profiles, Identity Center sessions, and Organizations list-accounts output are supported.':
    'AWS CLI profilleri, Identity Center oturumları ve Organizations list-accounts çıktısı desteklenir.',
  'Clear configuration': 'Yapılandırmayı temizle',
  'AWS configuration': 'AWS yapılandırması',
  'Import into': 'Şuraya içe aktar',
  'Import into profile list': 'İçe aktarılacak profil listesi',
  'Drop a .config, .ini, or .json file here': 'Bir .config, .ini veya .json dosyasını buraya bırak',
  'Profile list destination': 'Profil listesi hedefi',
  'Existing list': 'Mevcut liste',
  'New profile list name': 'Yeni profil listesi adı',
  'For example, Platform accounts': 'Örneğin Platform hesapları',
  'Checking configuration…': 'Yapılandırma kontrol ediliyor…',
  'Format not recognized': 'Biçim tanınmadı',
  'Import details': 'İçe aktarma ayrıntıları',
  'Enter a name for the new profile list.': 'Yeni profil listesi için bir ad gir.',
  'Drop a supported file anywhere in this editor':
    'Desteklenen bir dosyayı bu editörün herhangi bir yerine bırak',
  'Paste AWS config or Organizations JSON here…':
    'AWS yapılandırmasını veya Organizations JSON çıktısını buraya yapıştır…',
  'Show an import example': 'İçe aktarma örneğini göster',
  '{count} lines': '{count} satır',
  '{count} characters': '{count} karakter',
  'Nothing leaves this device': 'Bu cihazdan hiçbir veri çıkmaz',
  'Credential-safe import': 'Kimlik bilgisi güvenli içe aktarma',
  'Access keys, secret keys, session tokens, credential processes, and token files are explicitly ignored. Account email addresses in Organizations output are never read.':
    'Erişim anahtarları, gizli anahtarlar, oturum token’ları, credential process’leri ve token dosyaları açıkça yok sayılır. Organizations çıktısındaki hesap e-postaları hiçbir zaman okunmaz.',
  'Unrecognized format': 'Tanınmayan biçim',
  'This does not look like an AWS CLI config or aws organizations list-accounts output. Expected INI sections such as [profile name], or JSON containing an "Accounts" array.':
    'Bu içerik AWS CLI yapılandırmasına veya aws organizations list-accounts çıktısına benzemiyor. [profile name] gibi INI bölümleri ya da “Accounts” dizisi içeren JSON beklenir.',
  'Line {line}': 'Satır {line}',

  '1 valid profile is ready.': '1 geçerli profil hazır.',
  '{count} valid profiles are ready.': '{count} geçerli profil hazır.',
  'Import 1 profile': '1 profili içe aktar',
  'Import {count} profiles': '{count} profili içe aktar',
  '1 active account found.': '1 etkin hesap bulundu.',
  '{count} active accounts found.': '{count} etkin hesap bulundu.',
  'Organizations output does not include a role, so choose the role every account should be reached through.':
    'Organizations çıktısı rol içermez; tüm hesaplara erişmek için kullanılacak rolü seç.',
  '1 inactive account skipped.': '1 etkin olmayan hesap atlandı.',
  '{count} inactive accounts skipped.': '{count} etkin olmayan hesap atlandı.',
  'Credential fields were removed': 'Kimlik bilgisi alanları kaldırıldı',
  'Only profile metadata shown below can be imported.':
    'Yalnızca aşağıda gösterilen profil metadatası içe aktarılabilir.',
  '{count} entries need attention': '{count} kayıt ilgilenmeni bekliyor',
  'No importable profiles': 'İçe aktarılabilir profil yok',
  'Enter the role name every account should use.': 'Tüm hesapların kullanacağı rol adını gir.',
  'Fix the issues above or provide sections with role or Identity Center fields.':
    'Yukarıdaki sorunları düzelt veya rol ya da Identity Center alanları içeren bölümler sağla.',
  '1 section not included': '1 bölüm dahil edilmedi',
  '{count} sections not included': '{count} bölüm dahil edilmedi',
  'Paste or choose an AWS config first.': 'Önce bir AWS yapılandırması yapıştır veya seç.',
  'Config files must be smaller than 1 MB.': 'Yapılandırma dosyaları 1 MB’den küçük olmalıdır.',
  'Pasted configuration must be smaller than 1 MB.':
    'Yapıştırılan yapılandırma 1 MB’den küçük olmalıdır.',
  'The selected file could not be read.': 'Seçilen dosya okunamadı.',
  'Could not import profiles.': 'Profiller içe aktarılamadı.',
  'Could not open the imported profile list.': 'İçe aktarılan profil listesi açılamadı.',
  'Could not open the selected profile list.': 'Seçili profil listesi açılamadı.',
  'Manage selected list': 'Seçili listeyi yönet',
  'Load list into editor': 'Listeyi editöre yükle',
  'Existing profiles are managed in Profiles; raw import text is not stored.':
    'Mevcut profiller Profiller ekranından yönetilir; ham içe aktarma metni saklanmaz.',
  '{added} profiles imported.': '{added} profil içe aktarıldı.',
  '{count} duplicate profiles skipped.': '{count} yinelenen profil atlandı.',
  'Duplicates found': 'Yinelenenler bulundu',
  '1 profile already exists in this list and will be skipped.':
    '1 profil bu listede zaten var ve atlanacak.',
  '{count} profiles already exist in this list and will be skipped.':
    '{count} profil bu listede zaten var ve atlanacak.',
  '1 profile reuses a name already in this list: {names}':
    'Bu listede zaten kullanılan bir adı yeniden kullanan 1 profil var: {names}',
  '{count} profiles reuse a name already in this list: {names}':
    '{count} profil bu listede zaten kullanılan bir adı yeniden kullanıyor: {names}',
  'Add at least one valid profile before importing.':
    'İçe aktarmadan önce en az bir geçerli profil ekle.',
  'Could not open settings.': 'Ayarlar açılamadı.',
  "Open AWS Role Hop from an authenticated AWS Console tab. AWS Role Hop submits AWS's native switch request directly; AWS still verifies your session and access.":
    "AWS Role Hop'u kimliği doğrulanmış bir AWS Console sekmesinden açın. AWS Role Hop, AWS'nin yerel rol değiştirme isteğini doğrudan gönderir; oturumu ve erişimi yine AWS doğrular.",
  'Open {name} in AWS': '{name} profilini AWS’de aç',
  'Open production profile?': 'Production profili açılsın mı?',
  'Continue to AWS': 'AWS’ye devam et',
  'Secure AWS handoff': 'Güvenli AWS aktarımı',
  "IAM profiles switch directly from the authenticated AWS Console tab. AWS Role Hop sends the account, role, display name, region, and profile color to AWS's native endpoint. It does not read browser cookies or credentials.":
    "IAM profilleri kimliği doğrulanmış AWS Console sekmesinden doğrudan geçiş yapar. AWS Role Hop hesap, rol, görünen ad, region ve profil rengini AWS'nin yerel endpoint'ine gönderir. Tarayıcı çerezlerini veya kimlik bilgilerini okumaz.",
  'Show an AWS Role Hop warning before handing a production profile to AWS.':
    'Production profilini AWS’ye aktarmadan önce AWS Role Hop uyarısı göster.',
  'Backup exported.': 'Yedek dışa aktarıldı.',
  'The backup could not be exported.': 'Yedek dışa aktarılamadı.',
  'Backup files must be smaller than 2 MB.': 'Yedek dosyaları 2 MB’den küçük olmalıdır.',
  'The selected backup file could not be read.': 'Seçilen yedek dosyası okunamadı.',
  'Backup file is not valid JSON.': 'Yedek dosyası geçerli JSON değil.',
  'Backup restored.': 'Yedek geri yüklendi.',
  'The backup could not be restored.': 'Yedek geri yüklenemedi.',
  'All local AWS Role Hop data was reset.': 'Tüm yerel AWS Role Hop verileri sıfırlandı.',
  'Could not reset local data.': 'Yerel veriler sıfırlanamadı.',
  'Could not save the preference.': 'Tercih kaydedilemedi.',
  'Release notes': 'Sürüm notları',
  "What's new": 'Yenilikler',
  'Recent improvements included in this local build.':
    'Bu yerel sürüme dahil edilen son iyileştirmeler.',
  'Version {version}': 'Sürüm {version}',
  'Released {date}': '{date} tarihinde yayınlandı',
  'Back to preferences': 'Tercihlere dön',
  'View full changelog on GitHub': 'Tüm değişiklik günlüğünü GitHub’da görüntüle',
  'Built by Faruk AK on GitHub': 'GitHub’da Faruk AK tarafından geliştirildi',
  'Switch roles in AWS multi-session windows without losing the session you signed in with.':
    'AWS multi-session pencerelerinde, giriş yaptığın oturumu kaybetmeden rol değiştir.',
  'See which profiles already exist or reuse a name before an import runs.':
    'İçe aktarma başlamadan önce hangi profillerin zaten var olduğunu veya bir adı yeniden kullandığını gör.',
  'Load a saved profile list back into the import editor to review or extend it.':
    'Kayıtlı bir profil listesini incelemek veya genişletmek için içe aktarma editörüne geri yükle.',
  'Read a clear explanation when AWS refuses a role switch.':
    'AWS bir rol geçişini reddettiğinde net bir açıklama oku.',
  'Choose and persist one of eight pastel colors when adding or editing a profile.':
    'Profil eklerken veya düzenlerken sekiz pastel renkten birini seç ve kalıcı olarak sakla.',
  'Return a profile to automatic color assignment from the accessible color picker.':
    'Erişilebilir renk seçiciden bir profili otomatik renk atamasına döndür.',
  'Open release notes directly from the options sidebar.':
    'Sürüm notlarını doğrudan seçenekler kenar çubuğundan aç.',
  "Open Faruk AK's GitHub profile from below the Local by design card.":
    'Faruk AK’nin GitHub profilini Local by design kartının altından aç.',
  'Organize AWS roles and Identity Center profiles in named local lists.':
    'AWS rollerini ve Identity Center profillerini adlandırılmış yerel listelerde düzenle.',
  "Switch IAM roles through AWS's native flow without an intermediate page.":
    'IAM rollerine ara sayfa olmadan AWS’nin yerel akışı üzerinden geçiş yap.',
  'Import AWS config and Organizations JSON without retaining raw configuration.':
    'Ham yapılandırmayı saklamadan AWS config ve Organizations JSON verilerini içe aktar.',
  'Open the import screen directly from the empty popup.':
    'Boş popup üzerinden içe aktarma ekranını doğrudan aç.',
  'Use English or Turkish with light, dark, or system themes.':
    'Açık, koyu veya sistem temasıyla İngilizce ya da Türkçe kullan.',
  'Benefit from safer consecutive switching, bounded imports, and clearer errors.':
    'Daha güvenli ardışık geçişlerden, sınırlı içe aktarmalardan ve daha açık hatalardan yararlan.',
  'Something went wrong': 'Bir şeyler ters gitti',
  'AWS Role Hop could not render this view. Reload the extension to try again.':
    'AWS Role Hop bu görünümü oluşturamadı. Yeniden denemek için uzantıyı yükle.',
} as const;

export type Message = keyof typeof TURKISH_MESSAGES;
export type Language = 'en' | 'tr';
export type Variables = Record<string, string | number>;
export type Translate = (message: Message, variables?: Variables) => string;

interface I18nValue {
  language: Language;
  t: Translate;
}

const englishTranslate: Translate = (message, variables) => interpolate(message, variables);
const I18nContext = createContext<I18nValue>({ language: 'en', t: englishTranslate });

export function resolveLanguage(
  preference: AppSettings['language'],
  browserLanguage?: string,
): Language {
  if (preference !== 'system') return preference;
  const detectedLanguage = browserLanguage ?? browser.i18n.getUILanguage();
  return detectedLanguage.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export function I18nProvider({
  preference,
  children,
}: {
  preference: AppSettings['language'];
  children: ReactNode;
}) {
  const language = resolveLanguage(preference);
  const value = useMemo<I18nValue>(
    () => ({
      language,
      t: (message, variables) =>
        interpolate(language === 'tr' ? TURKISH_MESSAGES[message] : message, variables),
    }),
    [language],
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function AppI18nProvider({ children }: { children: ReactNode }) {
  const { state } = useAppState();
  return <I18nProvider preference={state?.settings.language ?? 'system'}>{children}</I18nProvider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

function interpolate(message: string, variables?: Variables): string {
  if (!variables) return message;
  return message.replace(/\{(\w+)}/g, (placeholder, key: string) =>
    Object.hasOwn(variables, key) ? String(variables[key]) : placeholder,
  );
}
