import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export interface RxBundleItem {
  medicineId: number;
  sku: string;
  medicineName: string;
  qty: number;
  unitType: 'Box' | 'Strip' | 'Pcs';
  role: 'primary' | 'cross_sell';
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

export interface EPrescriptionItem {
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  adherenceStatus: 'Patuh' | 'Perlu Pantauan' | 'Putus Obat';
}

export interface SwamedikasiRecommendation {
  medicineId?: number;
  name: string;
  dosage: string;
  role: 'primary' | 'cross_sell';
  reason: string;
  priceReguler: number;
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

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull().default('Apoteker Latisha'),
  role: text('role').notNull().default('apoteker'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const drugCategories = pgTable('drug_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const medicines = pgTable('medicines', {
  id: serial('id').primaryKey(),
  sku: text('sku').notNull().unique(),
  barcode: text('barcode').notNull().unique(),
  name: text('name').notNull(),
  genericName: text('generic_name').notNull().default(''),
  categoryId: integer('category_id')
    .references(() => drugCategories.id, { onDelete: 'set null' }),
  categoryName: text('category_name').notNull().default('Umum'),
  classification: text('classification').notNull().default('Bebas'), // Bebas | Bebas Terbatas | Keras | Psikotropika | Narkotika
  indication: text('indication').notNull().default(''),
  contraindication: text('contraindication').notNull().default(''),
  sideEffects: text('side_effects').notNull().default(''),
  dosageInstructions: text('dosage_instructions').notNull().default(''),
  icd10Tags: jsonb('icd10_tags').$type<string[]>().notNull().default([]),
  seasonalTags: jsonb('seasonal_tags').$type<string[]>().notNull().default([]),
  hppMode: text('hpp_mode').notNull().default('hna_ppn'), // manual | hna_ppn
  hna: integer('hna').notNull().default(0),
  ppnPercent: numeric('ppn_percent', { precision: 5, scale: 2 }).notNull().default('11.00'),
  hpp: integer('hpp').notNull().default(0),
  marginReguler: numeric('margin_reguler', { precision: 6, scale: 2 }).notNull().default('25.00'),
  priceReguler: integer('price_reguler').notNull().default(0),
  marginKlinik: numeric('margin_klinik', { precision: 6, scale: 2 }).notNull().default('15.00'),
  priceKlinik: integer('price_klinik').notNull().default(0),
  marginMitra: numeric('margin_mitra', { precision: 6, scale: 2 }).notNull().default('10.00'),
  priceMitra: integer('price_mitra').notNull().default(0),
  unitBase: text('unit_base').notNull().default('Tablet'),
  unitStrip: text('unit_strip').notNull().default('Strip'),
  pcsPerStrip: integer('pcs_per_strip').notNull().default(10),
  unitBox: text('unit_box').notNull().default('Box'),
  stripsPerBox: integer('strips_per_box').notNull().default(10),
  stockBase: integer('stock_base').notNull().default(0),
  minStockBase: integer('min_stock_base').notNull().default(30),
  expiryDate: text('expiry_date').notNull().default('2027-12-31'),
  isSlowMoving: boolean('is_slow_moving').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const patients = pgTable('patients', {
  id: serial('id').primaryKey(),
  mrn: text('mrn').notNull().unique(),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  birthDate: text('birth_date').notNull().default('1990-01-01'),
  gender: text('gender').notNull().default('Laki-laki'),
  address: text('address').notNull().default(''),
  memberTier: text('member_tier').notNull().default('Reguler'), // Reguler | Gold | Klinik/Dokter | Mitra/Instansi
  allergies: text('allergies').notNull().default('Tidak ada riwayat alergi'),
  chronicConditions: text('chronic_conditions').notNull().default('-'),
  points: integer('points').notNull().default(0),
  receivableLimit: integer('receivable_limit').notNull().default(0),
  receivableBalance: integer('receivable_balance').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const rxBundles = pgTable('rx_bundles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  diagnosisIcd10: text('diagnosis_icd10').notNull(),
  description: text('description').notNull().default(''),
  bundleDiscountPercent: numeric('bundle_discount_percent', { precision: 5, scale: 2 }).notNull().default('5.00'),
  items: jsonb('items').$type<RxBundleItem[]>().notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  invoiceNo: text('invoice_no').notNull().unique(),
  patientId: integer('patient_id').references(() => patients.id, { onDelete: 'set null' }),
  patientName: text('patient_name').notNull().default('Pasien Umum'),
  priceTier: text('price_tier').notNull().default('reguler'), // reguler | klinik | mitra
  paymentMethod: text('payment_method').notNull().default('Tunai'), // Tunai | QRIS | Transfer Bank | Debit/Kartu | Piutang/Tempo
  paymentStatus: text('payment_status').notNull().default('Lunas'), // Lunas | Belum Lunas | Cicilan
  dueDate: text('due_date'),
  paidAmount: integer('paid_amount').notNull().default(0),
  remainingBalance: integer('remaining_balance').notNull().default(0),
  subtotal: integer('subtotal').notNull().default(0),
  discountAmount: integer('discount_amount').notNull().default(0),
  taxAmount: integer('tax_amount').notNull().default(0),
  totalAmount: integer('total_amount').notNull().default(0),
  totalHpp: integer('total_hpp').notNull().default(0),
  grossProfit: integer('gross_profit').notNull().default(0),
  diagnosisIcd10: text('diagnosis_icd10').notNull().default('Z00.0 - Umum'),
  prescriptionType: text('prescription_type').notNull().default('Non-Resep'), // Non-Resep | Resep Dokter | Swamedikasi
  doctorName: text('doctor_name').notNull().default('-'),
  items: jsonb('items').$type<TransactionLineItem[]>().notNull().default([]),
  cashierName: text('cashier_name').notNull().default('Apt. Latisha'),
  notes: text('notes').notNull().default(''),
  transactionDate: text('transaction_date').notNull().default('2026-11-18'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const clinicalCareRecords = pgTable('clinical_care_records', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id').references(() => patients.id, { onDelete: 'set null' }),
  patientName: text('patient_name').notNull(),
  pharmacistName: text('pharmacist_name').notNull().default('Apt. Latisha, S.Farm'),
  visitDate: text('visit_date').notNull(),
  subjective: text('subjective').notNull(),
  objective: text('objective').notNull().default(''),
  assessment: text('assessment').notNull(), // DRP category
  drpDetails: text('drp_details').notNull().default(''),
  plan: text('plan').notNull(),
  interventionTarget: text('intervention_target').notNull().default('Pasien'),
  ePrescriptionItems: jsonb('e_prescription_items').$type<EPrescriptionItem[]>().notNull().default([]),
  adherenceScore: integer('adherence_score').notNull().default(100),
  followUpDate: text('follow_up_date').notNull().default(''),
  status: text('status').notNull().default('Selesai'), // Selesai | Perlu Follow-Up
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const swamedikasiLogs = pgTable('swamedikasi_logs', {
  id: serial('id').primaryKey(),
  patientName: text('patient_name').notNull().default('Pasien Walk-in'),
  symptomCategory: text('symptom_category').notNull(),
  triageAnswers: jsonb('triage_answers').$type<Record<string, string>>().notNull().default({}),
  redFlagsDetected: boolean('red_flags_detected').notNull().default(false),
  recommendationSummary: text('recommendation_summary').notNull(),
  recommendedMedicines: jsonb('recommended_medicines').$type<SwamedikasiRecommendation[]>().notNull().default([]),
  convertedToPos: boolean('converted_to_pos').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const drugInteractions = pgTable('drug_interactions', {
  id: serial('id').primaryKey(),
  drugAKeyword: text('drug_a_keyword').notNull(),
  drugBKeyword: text('drug_b_keyword').notNull(),
  severity: text('severity').notNull().default('Moderate'), // Major | Moderate | Minor
  mechanism: text('mechanism').notNull(),
  clinicalEffect: text('clinical_effect').notNull(),
  managementAdvice: text('management_advice').notNull(),
  evidenceLevel: text('evidence_level').notNull().default('Established'),
  literature: text('literature').notNull().default("Stockley's Drug Interactions Ed. 13; Lexicomp"),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull().default('PBF Resmi'),
  contactPerson: text('contact_person').notNull().default(''),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  address: text('address').notNull().default(''),
  paymentTerms: text('payment_terms').notNull().default('Net 30'),
  npwp: text('npwp').notNull().default('-'),
  status: text('status').notNull().default('Aktif'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const employees = pgTable('employees', {
  id: serial('id').primaryKey(),
  nip: text('nip').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull().default('Tenaga Teknis Kefarmasian (TTK)'),
  sipaStrNumber: text('sipa_str_number').notNull().default('-'),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  shift: text('shift').notNull().default('Pagi (07:00-14:00)'),
  status: text('status').notNull().default('Aktif'),
  joinDate: text('join_date').notNull().default('2025-01-10'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

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

export const obatBatches = pgTable('obat_batches', {
  id: serial('id').primaryKey(),
  medicineId: integer('medicine_id')
    .notNull()
    .references(() => medicines.id, { onDelete: 'cascade' }),
  medicineSku: text('medicine_sku').notNull(),
  medicineName: text('medicine_name').notNull(),
  supplierId: integer('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  supplierName: text('supplier_name').notNull().default('PBF Resmi'),
  batchNumber: text('batch_number').notNull(),
  expiryDate: text('expiry_date').notNull(),
  qtyReceived: integer('qty_received').notNull().default(0),
  qtyRemaining: integer('qty_remaining').notNull().default(0),
  rackLocation: text('rack_location').notNull().default('Rak A-1'),
  hppUnit: integer('hpp_unit').notNull().default(0),
  receivedDate: text('received_date').notNull().default('2026-11-18'),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const stockAuditLogs = pgTable('stock_audit_logs', {
  id: serial('id').primaryKey(),
  medicineId: integer('medicine_id')
    .notNull()
    .references(() => medicines.id, { onDelete: 'cascade' }),
  batchId: integer('batch_id').references(() => obatBatches.id, { onDelete: 'set null' }),
  medicineName: text('medicine_name').notNull(),
  batchNumber: text('batch_number').notNull().default('-'),
  systemQty: integer('system_qty').notNull().default(0),
  physicalQty: integer('physical_qty').notNull().default(0),
  variance: integer('variance').notNull().default(0),
  reason: text('reason').notNull().default('Koreksi Opname'), // Koreksi Opname | Obat Rusak | Kedaluwarsa (ED) | Selisih Hilang | Retur PBF | Penerimaan PBF
  auditorName: text('auditor_name').notNull().default('Apt. Latisha'),
  notes: text('notes').notNull().default(''),
  auditDate: text('audit_date').notNull().default('2026-11-18'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const purchaseOrders = pgTable('purchase_orders', {
  id: serial('id').primaryKey(),
  poNumber: text('po_number').notNull().unique(),
  supplierId: integer('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  supplierName: text('supplier_name').notNull(),
  status: text('status').notNull().default('Draft'), // Draft | Dikirim ke PBF | Diterima
  items: jsonb('items').$type<PurchaseOrderItem[]>().notNull().default([]),
  estimatedTotal: integer('estimated_total').notNull().default(0),
  createdBy: text('created_by').notNull().default('Apt. Latisha'),
  orderDate: text('order_date').notNull().default('2026-11-18'),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const prescriptions = pgTable('prescriptions', {
  id: serial('id').primaryKey(),
  rxNumber: text('rx_number').notNull().unique(),
  rxDate: text('rx_date').notNull(),
  patientId: integer('patient_id').references(() => patients.id, { onDelete: 'set null' }),
  patientName: text('patient_name').notNull(),
  weightKg: text('weight_kg').notNull().default(''),
  birthDate: text('birth_date').notNull().default(''),
  ageYears: integer('age_years').notNull().default(0),
  ageLabel: text('age_label').notNull().default(''),
  patientPhone: text('patient_phone').notNull().default(''),
  patientAddress: text('patient_address').notNull().default(''),
  allergies: text('allergies').notNull().default('Tidak ada riwayat alergi'),
  doctorName: text('doctor_name').notNull().default(''),
  doctorSip: text('doctor_sip').notNull().default(''),
  clinicName: text('clinic_name').notNull().default(''),
  iterFlag: text('iter_flag').notNull().default('Non-Iter'),
  pharmacyHeader: jsonb('pharmacy_header').$type<PrescriptionHeaderInfo>().notNull(),
  items: jsonb('items').$type<PrescriptionRxItem[]>().notNull().default([]),
  notes: text('notes').notNull().default(''),
  pharmacistName: text('pharmacist_name').notNull().default('Apt. Latisha Rahma, S.Farm'),
  status: text('status').notNull().default('Diserahkan'), // Menunggu | Diserahkan | Iter/Sebagian
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});



export const medicinesRelations = relations(medicines, ({ one, many }) => ({
  category: one(drugCategories, {
    fields: [medicines.categoryId],
    references: [drugCategories.id],
  }),
  batches: many(obatBatches),
}));

export const obatBatchesRelations = relations(obatBatches, ({ one }) => ({
  medicine: one(medicines, {
    fields: [obatBatches.medicineId],
    references: [medicines.id],
  }),
  supplier: one(suppliers, {
    fields: [obatBatches.supplierId],
    references: [suppliers.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  patient: one(patients, {
    fields: [transactions.patientId],
    references: [patients.id],
  }),
}));

export const clinicalCareRecordsRelations = relations(clinicalCareRecords, ({ one }) => ({
  patient: one(patients, {
    fields: [clinicalCareRecords.patientId],
    references: [patients.id],
  }),
}));
