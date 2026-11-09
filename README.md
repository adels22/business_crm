# Danışman CRM

BES, hayat ve sağlık sigortası danışmanı için tek kullanıcılı arama ve takip ekranı.
Ekranlar, veri modeli ve saklama yaklaşımı: [docs/PLAN.md](docs/PLAN.md).

> **Durum: prototip (aşama 1).** Veriler yalnızca kullanılan tarayıcıda (IndexedDB)
> saklanır. Giriş, sunucu ve otomatik yedek yoktur. Gerçek müşteri listesiyle
> kalıcı kullanım için önce [aşama 2](docs/PLAN.md#önerilen-sonraki-aşama-onayınızdan-sonra)
> tamamlanmalıdır.

## Çalıştırma

```bash
npm install
```

```bash
npm run dev
```

Tarayıcıda `http://localhost:5173` açılır. Aynı ağdaki telefondan denemek için
terminalde görünen `Network` adresini kullanın.

```bash
npm test
```

```bash
npm run build
```

`dist/` klasörü herhangi bir statik sunucuda çalışır.

## Neler çalışıyor

- **Bugün:** geciken, bugünkü ve 7 gün içindeki takipler; satırdan görüşme kaydı ve erteleme.
- **Müşteriler:** isim/telefon arama, bölge, sektör, durum, ürün ve takip filtreleri, sütun sıralama, ekleme ve düzenleme.
- **Müşteri detayı:** iletişim, durum, takip (tamamla, ertele, geri al) ve tarihli görüşme geçmişi.
- **Excel aktarımı:** .xlsx ve .csv, sütun eşleştirme, önizleme, hata açıklamaları, tekrar eden telefon işaretleme.
- **Dışa aktarma ve yedek:** Excel (müşteriler, görüşmeler, takipler), CSV, JSON yedek ve geri yükleme.
- **Demo ayrımı:** demo kayıtlar ayrı bir veritabanındadır, her ekranda "Demo" olarak işaretlenir. Aktarım yalnızca "Kendi verilerim" alanına yapılır.

## Gerçek veri ve depo

`.gitignore` tüm `.xlsx`, `.xls`, `.csv` ve `.json` dosyalarını (paket dosyaları hariç)
dışarıda tutar. Müşteri listesini depo klasörüne koysanız bile commit edilmez.
