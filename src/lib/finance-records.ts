export const INCOME_STORAGE_KEY = "a3-income-records";
export const EXPENSE_STORAGE_KEY = "a3-expense-records";
export const DRIVER_STORAGE_KEY = "a3-driver-records";
export const INVOICE_STORAGE_KEY = "a3-invoice-records-v2";
export const QUOTATION_STORAGE_KEY = "a3-quotation-records-v2";

export const DEFAULT_LIMOUSINE_TERMS_EN = `• ALL BOOKINGS SUBJECT TO AVAILABILITY
• PRICES ARE IN SGD AND EXCLUDE ERP, PARKING, AND SURCHARGES
• MIDNIGHT SURCHARGE APPLIES FROM 23:00 TO 06:30
• CANCELLATION MUST BE MADE AT LEAST 24 HOURS IN ADVANCE
• NO SHOW WILL BE CHARGED FULL AMOUNT
• PAYMENT VIA CREDIT CARD (PAYMENT GATEWAY FEES APPLY)
• DRIVER WAITING TIME MAY INCUR ADDITIONAL CHARGES
• FREE COMPLIMENTARY WAITING FOR ARRIVAL IS 90 MINUTES (FLIGHT LAND + 90)
• FREE COMPLIMENTARY WAITING FOR DEPARTURE/TRANSFER IS 15 MINUTES (BOOKING TIME + 15)`;

export const DEFAULT_LIMOUSINE_TERMS_ZH = `• 所有预订均视供应情况而定
• 价格均以新加坡元（SGD）计价，不包括ERP电子道路收费、停车费及附加费
• 午夜附加费适用于23:00至06:30
• 取消预订须至少提前24小时通知
• 未出现（NO SHOW）将收取全额费用
• 通过信用卡付款（需支付付款网关手续费）
• 司机等候时间可能产生额外费用
• 接机免费等候时间为90分钟（航班落地时间 + 90分钟）
• 送机／接送服务免费等候时间为15分钟（预订时间 + 15分钟）`;

// Backward-compatible alias used by existing records and imports.
export const DEFAULT_TERMS_AND_CONDITIONS = DEFAULT_LIMOUSINE_TERMS_EN;

export function limousineTerms(language: DocumentLanguage): string {
  return language === "ZH" ? DEFAULT_LIMOUSINE_TERMS_ZH : DEFAULT_LIMOUSINE_TERMS_EN;
}

export type DocumentKind = "invoice" | "quotation";
export type DocumentLanguage = "EN" | "ZH";
export type DocumentStatus = "Draft" | "Sent" | "Paid" | "Cancelled" | "Accepted" | "Rejected" | "Expired";

export type DocumentLineItem = {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  jobTitle?: string;
  tripTime?: string;
  route?: string;
  flight?: string;
  passenger?: string;
  driverId?: string;
  driverName?: string;
  claimRate?: number;
  claimId?: string;
  rateService?: string;
  vehicleType?: string;
};

export type FinancialDocumentRecord = {
  id: string;
  documentNo: string;
  date: string;
  dueDate: string;
  validUntil: string;
  companyId: string;
  language: DocumentLanguage;
  clientName: string;
  clientContact: string;
  clientPhone: string;
  clientAddress: string;
  clientUen: string;
  items: DocumentLineItem[];
  discount: number;
  gstEnabled: boolean;
  gstRate: number;
  status: DocumentStatus;
  terms: string;
  notes: string;
  sentAt?: string;
  paidAt?: string;
  acceptedAt?: string;
};

export type StoredIncomeRecord = {
  id: string;
  date: string;
  amount: number;
  status: "Pending" | "Received";
};

export type StoredExpenseRecord = {
  id: string;
  date: string;
  amount: number;
};

export type StoredDriverRecord = {
  id: string;
  status: "Active" | "Inactive" | "Suspended";
};

export const defaultIncomeOverviewRecords: StoredIncomeRecord[] = [
  { id: "INC-001", date: "2026-07-25", amount: 150, status: "Received" },
  { id: "INC-002", date: "2026-07-25", amount: 55, status: "Received" },
  { id: "INC-003", date: "2026-07-26", amount: 880, status: "Pending" },
];

export const defaultExpenseOverviewRecords: StoredExpenseRecord[] = [
  { id: "EXP-001", date: "2026-07-25", amount: 186.4 },
];

export const defaultDriverOverviewRecords: StoredDriverRecord[] = [
  { id: "DRV-001", status: "Active" },
];

const invoiceDefaults: FinancialDocumentRecord[] = [
  {
    id: "DOC-INV-001",
    documentNo: "INV-2026-001",
    date: "2026-07-25",
    dueDate: "2026-08-01",
    validUntil: "",
    companyId: "CMP-001",
    language: "EN",
    clientName: "Horizon Events",
    clientContact: "Accounts Department",
    clientPhone: "",
    clientAddress: "Singapore",
    clientUen: "",
    items: [{ id: "ITEM-001", description: "Hourly disposal service", quantity: 8, rate: 110 }],
    discount: 0,
    gstEnabled: false,
    gstRate: 9,
    status: "Sent",
    terms: DEFAULT_TERMS_AND_CONDITIONS,
    notes: "",
  },
];

const quotationDefaults: FinancialDocumentRecord[] = [
  {
    id: "DOC-QUO-001",
    documentNo: "QUO-2026-001",
    date: "2026-07-25",
    dueDate: "",
    validUntil: "2026-08-08",
    companyId: "CMP-001",
    language: "EN",
    clientName: "JSV LIMOUSINE SERVICES",
    clientContact: "NICHOLE ZHENG",
    clientPhone: "+65 9321 6669",
    clientAddress: "322 UBI AVENUE 1 #07-593, SINGAPORE 400322",
    clientUen: "53466069W",
    items: [
      { id: "ITEM-001", description: "Airport Arrival · 7 Seater Premium", quantity: 1, rate: 95 },
      { id: "ITEM-002", description: "Midnight surcharge", quantity: 1, rate: 20 },
    ],
    discount: 0,
    gstEnabled: false,
    gstRate: 9,
    status: "Draft",
    terms: DEFAULT_TERMS_AND_CONDITIONS,
    notes: "",
  },
];

export function documentStorageKey(kind: DocumentKind): string {
  return kind === "invoice" ? INVOICE_STORAGE_KEY : QUOTATION_STORAGE_KEY;
}

export function defaultDocumentRecords(kind: DocumentKind): FinancialDocumentRecord[] {
  const records = kind === "invoice" ? invoiceDefaults : quotationDefaults;
  return records.map(record => ({ ...record, items: record.items.map(item => ({ ...item })) }));
}

export function calculateDocumentTotals(record: Pick<FinancialDocumentRecord, "items" | "discount" | "gstEnabled" | "gstRate">) {
  const lineSubtotal = record.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.rate) || 0), 0);
  const discount = Math.min(lineSubtotal, Math.max(0, Number(record.discount) || 0));
  const subtotal = Math.max(0, lineSubtotal - discount);
  const gst = record.gstEnabled ? subtotal * (Math.max(0, Number(record.gstRate) || 0) / 100) : 0;
  return { lineSubtotal, discount, subtotal, gst, total: subtotal + gst };
}

export function nextDocumentNumber(kind: DocumentKind, records: FinancialDocumentRecord[], date = new Date()): string {
  const prefix = kind === "invoice" ? "INV" : "QUO";
  const year = date.getFullYear();
  const expression = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const highest = records.reduce((max, record) => {
    const match = record.documentNo.match(expression);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${year}-${String(highest + 1).padStart(3, "0")}`;
}

export function normalizeDocumentRecords(value: unknown, kind: DocumentKind): FinancialDocumentRecord[] {
  if (!Array.isArray(value)) return defaultDocumentRecords(kind);
  const fallback = defaultDocumentRecords(kind)[0];
  const records = value.filter(record => record && typeof record === "object").map((record, index) => {
    const raw = record as Partial<FinancialDocumentRecord>;
    const items = Array.isArray(raw.items) && raw.items.length
      ? raw.items.map((item, itemIndex) => ({
          id: String(item?.id || `ITEM-${String(itemIndex + 1).padStart(3, "0")}`),
          description: String(item?.description || ""),
          quantity: Math.max(0, Number(item?.quantity) || 0),
          rate: Math.max(0, Number(item?.rate) || 0),
          jobTitle: String(item?.jobTitle || ""),
          tripTime: String(item?.tripTime || ""),
          route: String(item?.route || ""),
          flight: String(item?.flight || ""),
          passenger: String(item?.passenger || ""),
          driverId: String(item?.driverId || ""),
          driverName: String(item?.driverName || ""),
          claimRate: Math.max(0, Number(item?.claimRate) || 0),
          claimId: String(item?.claimId || ""),
        }))
      : fallback.items.map(item => ({ ...item }));
    return {
      ...fallback,
      ...raw,
      id: String(raw.id || `DOC-${kind === "invoice" ? "INV" : "QUO"}-${String(index + 1).padStart(3, "0")}`),
      documentNo: String(raw.documentNo || nextDocumentNumber(kind, [], new Date(`${raw.date || fallback.date}T00:00:00`))),
      items,
      discount: Math.max(0, Number(raw.discount) || 0),
      gstRate: Math.max(0, Number(raw.gstRate) || 0),
      gstEnabled: Boolean(raw.gstEnabled),
      terms: typeof raw.terms === "string" ? raw.terms : DEFAULT_TERMS_AND_CONDITIONS,
      sentAt: raw.sentAt ? String(raw.sentAt) : undefined,
      paidAt: raw.paidAt ? String(raw.paidAt) : undefined,
      acceptedAt: raw.acceptedAt ? String(raw.acceptedAt) : undefined,
    } as FinancialDocumentRecord;
  });
  return records;
}
