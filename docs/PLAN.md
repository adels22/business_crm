# Danışman CRM: ekran, veri modeli ve saklama planı

Tek kullanıcılı bir arama masası. Bir BES, hayat ve sağlık sigortası danışmanının
günlük olarak kimi arayacağını, görüşmede ne konuşulduğunu ve bir sonraki
takibin ne zaman olacağını yönetmesi için tasarlandı.

## Ekranlar

| Ekran | Ne işe yarar |
| --- | --- |
| **Bugün** (açılış) | Üç kuyruk: geciken takipler, bugün aranacaklar, önümüzdeki 7 gün. Her satırda müşteri, telefon (mobilde dokununca arar), bölge, son görüşme özeti, takip tarihi. Satırdan **Görüşme kaydet** ve **Ertele**. Büyük istatistik kartı yok; sayılar grup başlıklarında. |
| **Müşteriler** | Masaüstünde yoğun, sıralanabilir tablo; mobilde liste. İsim/telefon araması, bölge / sektör / durum / ürün / takip filtreleri, yeni müşteri ekleme. |
| **Müşteri detayı** | İletişim bilgileri, durum, ilgilenilen ürünler, açık takip (tamamla / ertele) ve tarih sırasıyla görüşme geçmişi. |
| **Görüşme kaydet** (her yerden açılan pencere) | Tarih ve saat (varsayılan: şimdi), sonuç, not, isteğe bağlı yeni takip (Yarın / 3 gün / 1 hafta / 1 ay kısayolları). Kaydedince müşterinin durumu sonuca göre güncellenir ve açık takip tamamlanır (her ikisi de kapatılabilir). |
| **Excel aktarımı** | 1) Dosya seç, 2) Sütunları eşleştir, 3) Önizle ve kontrol et, 4) Sonuç. |
| **Veri ve yedek** | Çalışma alanı seçimi (Demo / Kendi verilerim), Excel ve CSV dışa aktarma, JSON yedek alma ve geri yükleme, saklama uyarıları. |

## Veri modeli

Excel'deki yedi sütun korunur; "Son arama", "Görüşme notu" ve "Takip arama"
tek hücre olmaktan çıkıp geçmişi olan kayıtlara dönüşür.

```
Customer                        CallLog (görüşme)                 FollowUp (takip)
- id                            - id                              - id
- fullName      İsim soyisim    - customerId                      - customerId
- phone         Telefon (metin) - date   'YYYY-MM-DD' | null      - dueDate 'YYYY-MM-DD'
- phoneNorm     karşılaştırma   - time   'HH:mm' | null           - dueTime 'HH:mm' | null
- region        Bölge           - result Sonuç | null             - status open | done
- sector        Sektör          - note   Görüşme notu             - completedAt
- status        Durum           - source manual | import          - postponements[]
- products      BES/Hayat/Sağlık- rawDate Excel'deki orijinal     - source manual | import
- source        demo|import|manual  tarih ifadesi (tarih okunamadıysa)
- importBatchId
- createdAt / updatedAt
```

- **Son arama** saklanmaz; tarihi bilinen en yeni görüşmeden hesaplanır.
- **Görüşme notu** yeni görüşmeyle silinmez; her görüşme ayrı kayıttır.
- Tarihi bilinmeyen eski notlar `date: null` ile saklanır ve geçmişte
  "Tarihi bilinmiyor" olarak görünür. Uydurma tarih atanmaz.
- **Takip arama** açık bir `FollowUp` kaydıdır. Ertelenirse eski tarih
  `postponements` içinde kalır. Tamamlanmayan takip gecikmiş listesinde durur.
- Durumlar: Yeni, Ulaşılamadı, Görüşüldü, Randevu planlandı, Teklif iletildi,
  Müşteri oldu, İlgilenmiyor.
- Telefon iki biçimde tutulur: `phone` dosyada yazdığı gibi metin,
  `phoneNorm` ise karşılaştırma için 10 haneli biçim (`+90 532…`, `0532…`,
  `532…` hepsi `532…` olur).

## Aktarım kuralları

- `.xlsx` ve `.csv` (UTF-8 veya Windows-1254, `;` `,` ya da sekme ayraçlı).
- Başlıklar Türkçe adlarına göre otomatik eşleşir, elle değiştirilebilir.
- Tarihler: `gg.aa.yyyy`, `gg/aa/yyyy`, `gg-aa-yyyy`, isteğe bağlı `SS:dd`,
  `yyyy-aa-gg` ve Excel tarih hücreleri. İki haneli yıl, imkânsız tarih ya da
  "geçen hafta" gibi ifadeler tarih olarak okunmaz; satır uyarı alır ve
  orijinal metin korunur.
- Aynı telefon (dosya içinde ya da kayıtlı müşterilerde) **Tekrar** olarak
  işaretlenir ve varsayılan olarak atlanır. Hiçbir kayıt otomatik silinmez ya da
  birleştirilmez; isterseniz satır bazında "Yine de ekle" seçilir. Böylece aynı
  dosyayı tekrar aktarmak kayıtları sessizce çoğaltmaz.
- Telefonu olmayan satırlar aynı isimli kayıt varsa yine Tekrar sayılır.
- İsmi olmayan satır aktarılmaz ve nedeni yazılır.

## Saklama, giriş ve yedekleme

### Bu sürüm (aşama 1): yalnızca tarayıcıda saklanan prototip

- Veriler bu cihazdaki tarayıcının IndexedDB deposunda durur. Sunucu yok,
  giriş yok, eşitleme yok.
- **Güvenli ve tamamlanmış bir CRM değildir.** Bilgisayara ya da tarayıcı
  profiline erişen herkes verileri görebilir. Tarayıcı verilerini temizlemek
  kayıtları siler. Başka cihazda görünmez.
- Önlemler: tarayıcıdan kalıcı depolama izni istenir, **Yedek al** ile JSON
  yedek indirilir, son yedek tarihi gösterilir ve 7 günü geçince hatırlatılır,
  Excel'e dışa aktarma her zaman açıktır.
- Demo ve gerçek veriler ayrı veritabanlarındadır (`danisman-crm-demo`,
  `danisman-crm`). İçe aktarma yalnızca "Kendi verilerim" alanına yapılır.
- Gerçek müşteri verisi kaynak koda ya da GitHub'a girmez. `.gitignore`
  tüm `.xlsx`, `.xls`, `.csv` ve yedek `.json` dosyalarını dışarıda tutar.

### Önerilen sonraki aşama (onayınızdan sonra)

Gerçek müşteri listesi kişisel veri olduğundan (KVKK) kalıcı kullanım için:

1. **Sunucu tarafı veritabanı:** Yönetilen PostgreSQL (ör. Supabase, AB
   bölgesi ya da Türkiye'de barındırma). Veri bölgesi KVKK'daki yurt dışı
   aktarım şartları açısından sizin kararınız.
2. **Giriş:** E-posta + parola ve iki adımlı doğrulama; satır düzeyinde
   erişim kuralı ile verilere yalnızca sizin hesabınız erişir.
3. **Yedekleme:** Günlük otomatik veritabanı yedeği, belirli bir zamana geri
   dönme, ayrıca haftalık şifreli Excel/JSON dışa aktarım.
4. Uygulamadaki depolama katmanı (`src/data/db.ts`) tek yerde toplandığından
   arayüz değişmeden sunucuya taşınabilir.

## Tasarım kararları

- **Renk:** Lacivert `#0E2240` (metin, menü), beyaz `#FFFFFF` (yüzeyler),
  serin zemin `#F2F5F9`, kontrollü mavi `#1D5BD6` (yalnızca birincil eylem,
  odak ve seçili durum), çizgi `#D5DDE8`. Gecikme için tek bir koyu kırmızı
  `#A3262A`; başka yerde kullanılmaz.
- **Yazı:** Atkinson Hyperlegible Next. Okunabilirlik için tasarlanmış bir
  aile; 0/O, 1/l/I gibi karakterleri ayırır. Gün boyu telefon numarası okuyan
  biri için seçildi. Rakamlar tablo hizalı.
- **Yerleşim:** Masaüstünde dar lacivert menü + geniş çalışma alanı. Bugün
  ekranı bir ajanda: solda takip saati/gecikme sütunu, sağda müşteri satırı.
  Mobilde alt menü ve tam ekran görüşme penceresi.
- **Tek cesur öğe:** Bugün ekranındaki tarih sütunu ("3 gün gecikti",
  "14:30"). Geri kalan her şey sade.
