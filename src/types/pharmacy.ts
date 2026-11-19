export interface DrugCategory {
  id: number;
  name: string;
  description: string;
}

export interface Medicine {
  id: number;
  sku: string;
  barcode: string;
  name: string;
  genericName: string;
  categoryId: number | null;
  categoryName: string;
  classification: 'Bebas' | 'Bebas Terbatas' | 'Keras' | 'Psikotropika' | 'Narkotika' | string;
  indication: string;
  contraindication: string;
  sideEffects: string;
  dosageInstructions: string;
  icd10Tags: string[];
  seasonalTags: string[];
  hppMode: 'manual' | 'hna_ppn' | string;
  hna: number;
  ppnPercent: string;
  hpp: number;
  marginReguler: string;
  priceReguler: number;
  marginKlinik: string;
  priceKlinik: number;
  marginMitra: string;
  priceMitra: number;
  unitBase: string;
  unitStrip: string;
  pcsPerStrip: number;
  unitBox: string;
  stripsPerBox: number;
  stockBase: number;
  minStockBase: number;
  expiryDate: string;
  isSlowMoving: boolean;
}

export interface Patient {
  id: number;
  mrn: string;
  name: string;
  phone: string;
  birthDate: string;
  gender: string;
  address: string;
  memberTier: 'Reguler' | 'Gold' | 'Klinik/Dokter' | 'Mitra/Instansi' | string;
  allergies: string;
  chronicConditions: string;
  points: number;
  receivableLimit: number;
  receivableBalance: number;
}

export interface RxBundleItem {
  medicineId: number;
  sku: string;
  medicineName: string;
  qty: number;
  unitType: 'Box' | 'Strip' | 'Pcs';
  role: 'primary' | 'cross_sell';
}

export interface RxBundle {
  id: number;
  name: string;
  diagnosisIcd10: string;
  description: string;
  bundleDiscountPercent: string;
  items: RxBundleItem[];
  isActive: boolean;
}

export interface TransactionLineItem {
  medicineId: number;
  sku: string;
  name: string;
  categoryName: string;
  unitType: 'Box' | 'Strip' | 'Pcs';
  qty: number;
  baseQtyDeducted: number;
  unitPrice: number;
  hppUnit: number;
  discount: number;
  lineTotal: number;
  isCrossSell: boolean;
  batchId?: number | null;
  batchNumber?: string;
  batchExpiryDate?: string;
}

export interface TransactionRecord {
  id: number;
  invoiceNo: string;
  patientId: number | null;
  patientName: string;
  priceTier: 'reguler' | 'klinik' | 'mitra' | string;
  paymentMethod: string;
  paymentStatus: 'Lunas' | 'Belum Lunas' | 'Cicilan' | string;
  dueDate: string | null;
  paidAmount: number;
  remainingBalance: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  totalHpp: number;
  grossProfit: number;
  diagnosisIcd10: string;
  prescriptionType: string;
  doctorName: string;
  items: TransactionLineItem[];
  cashierName: string;
  notes: string;
  transactionDate: string;
}

export interface EPrescriptionItem {
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  adherenceStatus: 'Patuh' | 'Perlu Pantauan' | 'Putus Obat';
}

export interface ClinicalCareRecord {
  id: number;
  patientId: number | null;
  patientName: string;
  pharmacistName: string;
  visitDate: string;
  subjective: string;
  objective: string;
  assessment: string;
  drpDetails: string;
  plan: string;
  interventionTarget: string;
  ePrescriptionItems: EPrescriptionItem[];
  adherenceScore: number;
  followUpDate: string;
  status: string;
}

export interface SwamedikasiRecommendation {
  medicineId?: number;
  name: string;
  dosage: string;
  role: 'primary' | 'cross_sell';
  reason: string;
  priceReguler: number;
}

export interface SwamedikasiLog {
  id: number;
  patientName: string;
  symptomCategory: string;
  triageAnswers: Record<string, string>;
  redFlagsDetected: boolean;
  recommendationSummary: string;
  recommendedMedicines: SwamedikasiRecommendation[];
  convertedToPos: boolean;
}

export interface DrugInteractionRule {
  id: number;
  drugAKeyword: string;
  drugBKeyword: string;
  severity: 'Major' | 'Moderate' | 'Minor' | string;
  mechanism: string;
  clinicalEffect: string;
  managementAdvice: string;
  evidenceLevel: string;
  literature?: string;
}

export interface Supplier {
  id: number;
  code: string;
  name: string;
  category: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  paymentTerms: string;
  npwp: string;
  status: string;
}

export interface Employee {
  id: number;
  nip: string;
  name: string;
  role: string;
  sipaStrNumber: string;
  phone: string;
  email: string;
  shift: string;
  status: string;
  joinDate: string;
}

export type MasterSubMenu = 'produk' | 'pelanggan' | 'supplier' | 'karyawan';

export interface ObatBatch {
  id: number;
  medicineId: number;
  medicineSku: string;
  medicineName: string;
  supplierId: number | null;
  supplierName: string;
  batchNumber: string;
  expiryDate: string;
  qtyReceived: number;
  qtyRemaining: number;
  rackLocation: string;
  hppUnit: number;
  receivedDate: string;
  notes: string;
}

export interface StockAuditLog {
  id: number;
  medicineId: number;
  batchId: number | null;
  medicineName: string;
  batchNumber: string;
  systemQty: number;
  physicalQty: number;
  variance: number;
  reason: string;
  auditorName: string;
  notes: string;
  auditDate: string;
}

export interface PurchaseOrderItem {
  medicineId: number;
  sku: string;
  medicineName: string;
  currentStock: number;
  minStock: number;
  orderQtyBase: number;
  estimatedHpp: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  supplierId: number | null;
  supplierName: string;
  status: 'Draft' | 'Dikirim ke PBF' | 'Diterima' | string;
  items: PurchaseOrderItem[];
  estimatedTotal: number;
  createdBy: string;
  orderDate: string;
  notes: string;
}

export interface PrescriptionHeaderInfo {
  pharmacyName: string;
  tagline: string;
  address: string;
  phone: string;
  apaName: string;
  sipaNumber: string;
  siaNumber: string;
}

export interface PrescriptionRxItem {
  medicineId: number | null;
  rawInput: string;
  medicineName: string;
  quantity: number;
  quantityRoman: string;
  dosageForm: string;
  signaIndonesian: string;
  latinFormatted: string;
  deturStatus: 'det orig' | 'det 1x' | 'ne det' | string;
}

export interface PrescriptionRecord {
  id: number;
  rxNumber: string;
  rxDate: string;
  patientId: number | null;
  patientName: string;
  weightKg: string;
  birthDate: string;
  ageYears: number;
  ageLabel: string;
  patientPhone: string;
  patientAddress: string;
  allergies: string;
  doctorName: string;
  doctorSip: string;
  clinicName: string;
  iterFlag: string;
  pharmacyHeader: PrescriptionHeaderInfo;
  items: PrescriptionRxItem[];
  notes: string;
  pharmacistName: string;
  status: 'Menunggu' | 'Diserahkan' | 'Iter/Sebagian' | string;
}

export interface ExternalLicenseState {
  configured: boolean;
  reachable: boolean;
  allowed: boolean;
  accessLevel: 'full' | 'grace_warning' | 'blocked';
  status: string;
  reasonCode: string;
  message: string;
  appCode: string;
  portalUrl: string | null;
  clientEmail: string | null;
  client: {
    faskesName: string;
    planTier: string;
    billingCycle: string;
    status: string;
    dueDate: string | null;
    daysRemaining: number | null;
  } | null;
  checkedAt: string;
}

export interface BootstrapPayload {
  user: {
    uid: string;
    email: string;
    name: string;
    role: 'super_admin' | 'apoteker' | string;
    nip?: string;
    jobTitle?: string;
  };
  license?: ExternalLicenseState;
  categories: DrugCategory[];
  medicines: Medicine[];
  patients: Patient[];
  suppliers: Supplier[];
  employees: Employee[];
  batches: ObatBatch[];
  stockAuditLogs: StockAuditLog[];
  purchaseOrders: PurchaseOrder[];
  prescriptions: PrescriptionRecord[];
  rxBundles: RxBundle[];
  transactions: TransactionRecord[];
  clinicalRecords: ClinicalCareRecord[];
  swamedikasiLogs: SwamedikasiLog[];
  drugInteractions: DrugInteractionRule[];
}

export type TransactionSubMenu = 'penjualan' | 'pembelian';

export type ActiveModule =
  | 'dashboard'
  | 'pos'
  | 'transactions'
  | 'clinical'
  | 'master'
  | 'inventory'
  | 'analytics'
  | 'supabase';
