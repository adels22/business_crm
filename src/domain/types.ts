export const STATUSES = [
  'Yeni',
  'Ulaşılamadı',
  'Görüşüldü',
  'Randevu planlandı',
  'Teklif iletildi',
  'Müşteri oldu',
  'İlgilenmiyor',
] as const;
export type Status = (typeof STATUSES)[number];

/** Görüşme sonucu: "Yeni" dışındaki durumlar. */
export const RESULTS = STATUSES.filter((s) => s !== 'Yeni') as Exclude<Status, 'Yeni'>[];
export type CallResult = Exclude<Status, 'Yeni'>;

export const PRODUCTS = ['BES', 'Hayat', 'Sağlık'] as const;
export type Product = (typeof PRODUCTS)[number];

export type RecordSource = 'demo' | 'import' | 'manual';

/** Yerel takvim tarihi, 'YYYY-MM-DD'. Saat dilimi kaymasını önlemek için metin. */
export type LocalDate = string;
/** 'HH:mm' */
export type LocalTime = string;

export interface Customer {
  id: string;
  fullName: string;
  /** Kullanıcının yazdığı / dosyadaki biçim, her zaman metin. */
  phone: string;
  /** Karşılaştırma için 10 hane (ör. 5321234567). Okunamazsa ''. */
  phoneNorm: string;
  region: string;
  sector: string;
  status: Status;
  products: Product[];
  source: RecordSource;
  importBatchId?: string;
  /** Excel'deki "Takip arama" tarih olarak okunamadıysa orijinal ifade. */
  legacyFollowUpText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CallLog {
  id: string;
  customerId: string;
  /** null: tarihi bilinmiyor (ör. Excel'den gelen tarihsiz not). */
  date: LocalDate | null;
  time: LocalTime | null;
  result: CallResult | null;
  note: string;
  source: RecordSource;
  /** Tarih okunamadıysa Excel'deki orijinal ifade. */
  rawDate?: string;
  createdAt: string;
}

export interface Postponement {
  fromDate: LocalDate;
  fromTime: LocalTime | null;
  at: string;
}

export interface FollowUp {
  id: string;
  customerId: string;
  dueDate: LocalDate;
  dueTime: LocalTime | null;
  status: 'open' | 'done';
  completedAt?: string;
  postponements: Postponement[];
  source: RecordSource;
  createdAt: string;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  importedAt: string;
  added: number;
  skipped: number;
}

export interface Dataset {
  customers: Customer[];
  calls: CallLog[];
  followUps: FollowUp[];
  imports: ImportBatch[];
}

export type Workspace = 'demo' | 'main';
