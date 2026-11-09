/**
 * DEMO kayıtları. Kişiler ve numaralar uydurmadır; gerçek bir kişiye ait değildir.
 * Tarihler bugüne göre üretilir, böylece Bugün ekranında her zaman örnek bulunur.
 */
import { addDays, today } from '../domain/dates';
import { normalizePhone } from '../domain/phone';
import type { CallLog, CallResult, Customer, Dataset, FollowUp, Product, Status } from '../domain/types';

interface Seed {
  name: string;
  phone: string;
  region: string;
  sector: string;
  status: Status;
  products: Product[];
  calls: [dayOffset: number | null, time: string | null, result: CallResult | null, note: string][];
  follow?: [dayOffset: number, time: string | null];
}

const SEEDS: Seed[] = [
  { name: 'Ayla Demirtaş', phone: '0555 010 11 01', region: 'Kadıköy', sector: 'Eğitim', status: 'Teklif iletildi', products: ['BES'],
    calls: [[-12, '10:20', 'Görüşüldü', 'Öğretmen, eşinin BES hesabı var. Kendisi için aylık 1.500 TL düşünüyor.'], [-5, '16:05', 'Teklif iletildi', 'BES teklifi e-postayla gitti. Devlet katkısını tekrar sordu.']],
    follow: [-3, '11:00'] },
  { name: 'Mert Karaca', phone: '+90 555 010 11 02', region: 'Ataşehir', sector: 'Bilişim', status: 'Randevu planlandı', products: ['Hayat', 'Sağlık'],
    calls: [[-9, '13:40', 'Görüşüldü', 'Yeni baba oldu, hayat sigortasıyla ilgileniyor. Tamamlayıcı sağlığı da sordu.']],
    follow: [-1, '14:30'] },
  { name: 'Seda Yıldırım', phone: '05550101103', region: 'Üsküdar', sector: 'Sağlık', status: 'Ulaşılamadı', products: ['Sağlık'],
    calls: [[-6, '09:15', 'Ulaşılamadı', 'Nöbetteydi, mesaj bıraktım.'], [-2, '18:10', 'Ulaşılamadı', 'Telefon kapalı.']],
    follow: [-2, null] },
  { name: 'Hakan Öztürk', phone: '0555 010 11 04', region: 'Bakırköy', sector: 'İnşaat', status: 'Görüşüldü', products: ['BES', 'Hayat'],
    calls: [[-20, '11:00', 'Görüşüldü', 'Şirket sahibi. Çalışanları için grup BES istiyor, önce kendi poliçesini konuşalım dedi.']],
    follow: [0, '10:00'] },
  { name: 'Zeynep Arslan', phone: '0555 010 11 05', region: 'Beşiktaş', sector: 'Perakende', status: 'Yeni', products: ['BES'],
    calls: [],
    follow: [0, '11:30'] },
  { name: 'Emre Çelik', phone: '0555 010 11 06', region: 'Maltepe', sector: 'Lojistik', status: 'Görüşüldü', products: ['Sağlık'],
    calls: [[-4, '15:20', 'Görüşüldü', 'Annesi için sağlık sigortası araştırıyor, yaş sınırını sordu.']],
    follow: [0, '15:00'] },
  { name: 'Gizem Koç', phone: '0555 010 11 07', region: 'Kadıköy', sector: 'Serbest meslek', status: 'Teklif iletildi', products: ['BES', 'Sağlık'],
    calls: [[-15, '10:00', 'Görüşüldü', 'Mimar, kendi bürosu var.'], [-3, '12:45', 'Teklif iletildi', 'İki seçenekli BES teklifi gönderildi. Eşiyle konuşacak.']],
    follow: [0, null] },
  { name: 'Burak Şahin', phone: '0555 010 11 08', region: 'Ataşehir', sector: 'Finans', status: 'Randevu planlandı', products: ['Hayat'],
    calls: [[-1, '17:30', 'Randevu planlandı', 'Perşembe ofiste yüz yüze görüşme. Kredi bağlantılı hayat poliçesini karşılaştıracak.']],
    follow: [2, '10:30'] },
  { name: 'Elif Aydın', phone: '0555 010 11 09', region: 'Üsküdar', sector: 'Kamu', status: 'Görüşüldü', products: ['BES'],
    calls: [[-8, '12:10', 'Görüşüldü', 'Mevcut BES fonunun getirisinden memnun değil, fon dağılımını konuşmak istiyor.']],
    follow: [1, '12:00'] },
  { name: 'Can Yılmaz', phone: '0555 010 11 10', region: 'Beşiktaş', sector: 'Bilişim', status: 'Ulaşılamadı', products: [],
    calls: [[-3, '10:40', 'Ulaşılamadı', 'Meşgule attı.']],
    follow: [3, null] },
  { name: 'Derya Polat', phone: '0555 010 11 11', region: 'Bakırköy', sector: 'Eğitim', status: 'Teklif iletildi', products: ['Sağlık'],
    calls: [[-10, '14:00', 'Görüşüldü', 'Çocukları için tamamlayıcı sağlık.'], [-4, '11:20', 'Teklif iletildi', 'Aile paketi teklifi iletildi.']],
    follow: [5, '16:00'] },
  { name: 'Onur Kılıç', phone: '0555 010 11 12', region: 'Maltepe', sector: 'İnşaat', status: 'Yeni', products: [],
    calls: [],
    follow: [6, null] },
  { name: 'Selin Erdem', phone: '0555 010 11 13', region: 'Kadıköy', sector: 'Sağlık', status: 'Müşteri oldu', products: ['BES', 'Hayat'],
    calls: [[-40, '10:00', 'Teklif iletildi', 'BES ve hayat birlikte teklif edildi.'], [-30, '15:00', 'Müşteri oldu', 'Sözleşmeler imzalandı. 6 ay sonra fon dağılımı için arayalım.']],
    follow: [14, null] },
  { name: 'Tolga Aksoy', phone: '0555 010 11 14', region: 'Ataşehir', sector: 'Perakende', status: 'İlgilenmiyor', products: [],
    calls: [[-18, '13:00', 'İlgilenmiyor', 'Şu an ek ödeme yapamayacağını söyledi. Bir yıl sonra tekrar denenebilir.']] },
  { name: 'Nur Güneş', phone: '0555 010 11 15', region: 'Üsküdar', sector: 'Serbest meslek', status: 'Görüşüldü', products: ['Hayat'],
    // Excel'den gelmiş gibi, tarihi bilinmeyen eski not
    calls: [[null, null, null, 'Eski listeden: eşi vefat sonrası hayat sigortasının önemini anlattı, tekrar aranmak istedi.'], [-7, '11:45', 'Görüşüldü', 'Teminat tutarlarını konuştuk.']],
    follow: [-6, '10:00'] },
  { name: 'Kerem Doğan', phone: '0555 010 11 16', region: 'Beşiktaş', sector: 'Finans', status: 'Yeni', products: ['BES'],
    calls: [] },
  { name: 'İrem Uçar', phone: '0555 010 11 17', region: 'Bakırköy', sector: 'Kamu', status: 'Randevu planlandı', products: ['BES'],
    calls: [[-2, '09:50', 'Randevu planlandı', 'Cumartesi kafede görüşme ayarlandı.']],
    follow: [4, '11:00'] },
  { name: 'Ozan Tekin', phone: '0555 010 11 18', region: 'Maltepe', sector: 'Lojistik', status: 'Ulaşılamadı', products: [],
    calls: [[-1, '16:00', 'Ulaşılamadı', 'Açmadı.']],
    follow: [0, '17:30'] },
];

export function buildDemoDataset(): Dataset {
  const t = today();
  const now = new Date().toISOString();
  const customers: Customer[] = [];
  const calls: CallLog[] = [];
  const followUps: FollowUp[] = [];
  SEEDS.forEach((s, i) => {
    const id = `demo-c-${i + 1}`;
    customers.push({
      id, fullName: s.name, phone: s.phone, phoneNorm: normalizePhone(s.phone),
      region: s.region, sector: s.sector, status: s.status, products: s.products,
      source: 'demo', createdAt: now, updatedAt: now,
    });
    s.calls.forEach(([off, time, result, note], j) => {
      calls.push({
        id: `demo-g-${i + 1}-${j + 1}`, customerId: id,
        date: off === null ? null : addDays(t, off), time, result, note,
        source: off === null ? 'import' : 'demo', createdAt: now,
      });
    });
    if (s.follow) {
      followUps.push({
        id: `demo-t-${i + 1}`, customerId: id, dueDate: addDays(t, s.follow[0]), dueTime: s.follow[1],
        status: 'open', postponements: [], source: 'demo', createdAt: now,
      });
    }
  });
  return { customers, calls, followUps, imports: [] };
}
