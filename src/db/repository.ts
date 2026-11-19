import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  clinicalCareRecords,
  drugCategories,
  drugInteractions,
  employees,
  medicines,
  obatBatches,
  patients,
  prescriptions,
  purchaseOrders,
  rxBundles,
  stockAuditLogs,
  suppliers,
  swamedikasiLogs,
  transactions,
  type EPrescriptionItem,
  type PrescriptionHeaderInfo,
  type PrescriptionRxItem,
  type PurchaseOrderItem,
  type RxBundleItem,
  type SwamedikasiRecommendation,
  type TransactionLineItem,
} from './schema.ts';
import { ensureInitialSeed } from './seed.ts';
import { detectDrugInteractions, type CandidateDrugInput } from '../lib/drugInteractions.ts';

export async function getBootstrapData() {
  try {
    await ensureInitialSeed();

    const [
      categoriesList,
      medicinesList,
      patientsList,
      suppliersList,
      employeesList,
      batchesList,
      auditLogsList,
      purchaseOrdersList,
      prescriptionsList,
      bundlesList,
      txList,
      clinicalList,
      swamedikasiList,
      interactionsList,
    ] = await Promise.all([
      db.select().from(drugCategories).orderBy(drugCategories.name),
      db.select().from(medicines).orderBy(medicines.name),
      db.select().from(patients).orderBy(patients.name),
      db.select().from(suppliers).orderBy(suppliers.name),
      db.select().from(employees).orderBy(employees.name),
      db.select().from(obatBatches).orderBy(asc(obatBatches.expiryDate), asc(obatBatches.id)),
      db.select().from(stockAuditLogs).orderBy(desc(stockAuditLogs.id)),
      db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.id)),
      db.select().from(prescriptions).orderBy(desc(prescriptions.id)),
      db.select().from(rxBundles).orderBy(desc(rxBundles.id)),
      db.select().from(transactions).orderBy(desc(transactions.id)),
      db.select().from(clinicalCareRecords).orderBy(desc(clinicalCareRecords.id)),
      db.select().from(swamedikasiLogs).orderBy(desc(swamedikasiLogs.id)),
      db.select().from(drugInteractions).orderBy(drugInteractions.severity, drugInteractions.drugAKeyword),
    ]);

    return {
      categories: categoriesList,
      medicines: medicinesList,
      patients: patientsList,
      suppliers: suppliersList,
      employees: employeesList,
      batches: batchesList,
      stockAuditLogs: auditLogsList,
      purchaseOrders: purchaseOrdersList,
      prescriptions: prescriptionsList,
      rxBundles: bundlesList,
      transactions: txList,
      clinicalRecords: clinicalList,
      swamedikasiLogs: swamedikasiList,
      drugInteractions: interactionsList,
    };
  } catch (error) {
    console.error('Database query failed in getBootstrapData:', error);
    throw new Error('Gagal memuat data operasional apotek dari database.', { cause: error });
  }
}

export async function createCategory(name: string, description: string) {
  try {
    const [created] = await db
      .insert(drugCategories)
      .values({ name: name.trim(), description: description.trim() })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed in createCategory:', error);
    throw new Error('Gagal menambahkan kategori obat baru.', { cause: error });
  }
}

export async function removeCategory(id: number) {
  try {
    await db.delete(drugCategories).where(eq(drugCategories.id, id));
    return { deletedId: id };
  } catch (error) {
    console.error('Database query failed in removeCategory:', error);
    throw new Error('Gagal menghapus kategori obat.', { cause: error });
  }
}

export interface MedicinePayload {
  sku: string;
  barcode: string;
  name: string;
  genericName: string;
  categoryId: number | null;
  categoryName: string;
  classification: string;
  indication: string;
  contraindication: string;
  sideEffects: string;
  dosageInstructions: string;
  icd10Tags: string[];
  seasonalTags: string[];
  hppMode: 'manual' | 'hna_ppn';
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

export async function upsertMedicine(id: number | null, payload: MedicinePayload) {
  try {
    if (id) {
      const [updated] = await db
        .update(medicines)
        .set({ ...payload, updatedAt: new Date() })
        .where(eq(medicines.id, id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(medicines).values(payload).returning();
    return created;
  } catch (error) {
    console.error('Database query failed in upsertMedicine:', error);
    throw new Error('Gagal menyimpan data master obat.', { cause: error });
  }
}

export async function removeMedicine(id: number) {
  try {
    await db.delete(medicines).where(eq(medicines.id, id));
    return { deletedId: id };
  } catch (error) {
    console.error('Database query failed in removeMedicine:', error);
    throw new Error('Gagal menghapus data obat.', { cause: error });
  }
}

export interface PatientPayload {
  mrn: string;
  name: string;
  phone: string;
  birthDate: string;
  gender: string;
  address: string;
  memberTier: string;
  allergies: string;
  chronicConditions: string;
  receivableLimit: number;
}

export async function createPatient(payload: PatientPayload) {
  try {
    const [created] = await db
      .insert(patients)
      .values({ ...payload, points: 0, receivableBalance: 0 })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed in createPatient:', error);
    throw new Error('Gagal mendaftarkan profil pasien/member.', { cause: error });
  }
}

export async function updatePatient(id: number, payload: PatientPayload) {
  try {
    const [updated] = await db
      .update(patients)
      .set(payload)
      .where(eq(patients.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error('Database query failed in updatePatient:', error);
    throw new Error('Gagal memperbarui data pasien/pelanggan.', { cause: error });
  }
}

export async function removePatient(id: number) {
  try {
    await db.delete(patients).where(eq(patients.id, id));
    return { deletedId: id };
  } catch (error) {
    console.error('Database query failed in removePatient:', error);
    throw new Error('Gagal menghapus data pasien/pelanggan.', { cause: error });
  }
}

export interface SupplierPayload {
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

export async function upsertSupplier(id: number | null, payload: SupplierPayload) {
  try {
    if (id) {
      const [updated] = await db
        .update(suppliers)
        .set(payload)
        .where(eq(suppliers.id, id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(suppliers).values(payload).returning();
    return created;
  } catch (error) {
    console.error('Database query failed in upsertSupplier:', error);
    throw new Error('Gagal menyimpan data supplier.', { cause: error });
  }
}

export async function removeSupplier(id: number) {
  try {
    await db.delete(suppliers).where(eq(suppliers.id, id));
    return { deletedId: id };
  } catch (error) {
    console.error('Database query failed in removeSupplier:', error);
    throw new Error('Gagal menghapus data supplier.', { cause: error });
  }
}

export interface EmployeePayload {
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

export async function upsertEmployee(id: number | null, payload: EmployeePayload) {
  try {
    if (id) {
      const [updated] = await db
        .update(employees)
        .set(payload)
        .where(eq(employees.id, id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(employees).values(payload).returning();
    return created;
  } catch (error) {
    console.error('Database query failed in upsertEmployee:', error);
    throw new Error('Gagal menyimpan data karyawan.', { cause: error });
  }
}

export async function removeEmployee(id: number) {
  try {
    await db.delete(employees).where(eq(employees.id, id));
    return { deletedId: id };
  } catch (error) {
    console.error('Database query failed in removeEmployee:', error);
    throw new Error('Gagal menghapus data karyawan.', { cause: error });
  }
}

export function resolveEmployeeAppRole(employee: {
  email: string;
  role: string;
}): 'super_admin' | 'apoteker' {
  const emailLower = (employee.email || '').trim().toLowerCase();
  const roleLower = (employee.role || '').trim().toLowerCase();
  if (
    emailLower === 'latisha.farma19@gmail.com' ||
    roleLower.includes('penanggung jawab') ||
    roleLower.includes('owner') ||
    roleLower.includes('super admin')
  ) {
    return 'super_admin';
  }
  return 'apoteker';
}

export async function getEmployeeById(id: number) {
  const [row] = await db.select().from(employees).where(eq(employees.id, id));
  return row ?? null;
}

function tokenizeEmployeeName(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length > 0);
}

function matchesEmployeeNameKeyword(registeredFullName: string, inputName: string): boolean {
  const normalizedFull = registeredFullName.trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedInput = inputName.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!normalizedInput) return false;
  if (normalizedFull === normalizedInput) return true;

  const registeredTokens = tokenizeEmployeeName(registeredFullName);
  const inputTokens = tokenizeEmployeeName(inputName);
  if (inputTokens.length === 0) return false;

  const hasMeaningfulToken = inputTokens.some((t) => t.length >= 2);
  if (!hasMeaningfulToken) return false;

  return inputTokens.every((inTok) =>
    registeredTokens.some(
      (regTok) => regTok === inTok || (inTok.length >= 3 && regTok.startsWith(inTok))
    )
  );
}

export async function lookupEmployeesByNameKeyword(query: string) {
  try {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    let allEmployees = await db.select().from(employees).orderBy(employees.name);
    if (allEmployees.length === 0) {
      await ensureInitialSeed();
      allEmployees = await db.select().from(employees).orderBy(employees.name);
    }

    return allEmployees
      .filter(
        (emp) =>
          !(emp.status || '').trim().toLowerCase().includes('nonaktif') &&
          matchesEmployeeNameKeyword(emp.name, trimmed)
      )
      .slice(0, 5)
      .map((emp) => ({
        id: emp.id,
        name: emp.name,
        role: emp.role,
      }));
  } catch (error) {
    console.error('Database query failed in lookupEmployeesByNameKeyword:', error);
    return [];
  }
}

export async function authenticateEmployeeLogin(name: string, nip: string) {
  try {
    const normalizedNip = nip.trim().toLowerCase();
    const normalizedName = name.trim().replace(/\s+/g, ' ');

    if (!normalizedName || !normalizedNip) {
      return {
        ok: false as const,
        statusCode: 400,
        error: 'Nama karyawan dan No. NIP wajib diisi.',
      };
    }

    let [employee] = await db
      .select()
      .from(employees)
      .where(sql`LOWER(TRIM(${employees.nip})) = ${normalizedNip}`);

    if (!employee) {
      const [{ value: empCount }] = await db
        .select({ value: sql<number>`count(*)` })
        .from(employees);
      if (Number(empCount) === 0) {
        await ensureInitialSeed();
        [employee] = await db
          .select()
          .from(employees)
          .where(sql`LOWER(TRIM(${employees.nip})) = ${normalizedNip}`);
      }
    }

    if (!employee) {
      return {
        ok: false as const,
        statusCode: 401,
        error: 'Nama karyawan atau No. NIP tidak terdaftar di sistem aplikasi.',
      };
    }

    if (!matchesEmployeeNameKeyword(employee.name, normalizedName)) {
      return {
        ok: false as const,
        statusCode: 401,
        error: 'Nama karyawan tidak sesuai dengan No. NIP yang terdaftar di sistem.',
      };
    }

    if ((employee.status || '').trim().toLowerCase().includes('nonaktif')) {
      return {
        ok: false as const,
        statusCode: 403,
        error: `Akun karyawan "${employee.name}" sedang berstatus ${employee.status}. Hubungi Apoteker Penanggung Jawab.`,
      };
    }

    const appRole = resolveEmployeeAppRole(employee);
    return {
      ok: true as const,
      employee,
      appRole,
    };
  } catch (error) {
    console.error('Database query failed in authenticateEmployeeLogin:', error);
    throw new Error('Gagal memverifikasi data karyawan ke database. Silakan coba lagi.', {
      cause: error,
    });
  }
}

export interface TransactionPayload {
  patientId: number | null;
  patientName: string;
  priceTier: string;
  paymentMethod: string;
  dueDate: string | null;
  paidAmount: number;
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
  allowNegativeStock?: boolean;
}

export async function createPosTransaction(payload: TransactionPayload) {
  try {
    const { allowNegativeStock = false, ...txValues } = payload;
    const invoiceNo = `INV-${txValues.transactionDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
    const isTempo = txValues.paymentMethod === 'Piutang/Tempo';
    const remainingBalance = isTempo ? Math.max(0, txValues.totalAmount - txValues.paidAmount) : 0;
    const paymentStatus =
      remainingBalance === 0
        ? 'Lunas'
        : txValues.paidAmount > 0
          ? 'Cicilan'
          : 'Belum Lunas';

    const [createdTx] = await db
      .insert(transactions)
      .values({
        ...txValues,
        invoiceNo,
        paymentStatus,
        remainingBalance,
      })
      .returning();

    // Deduct stock per item: pinned batch first if selected, otherwise strict FEFO order
    for (const item of txValues.items) {
      if (item.medicineId && item.baseQtyDeducted > 0) {
        let toDeduct = item.baseQtyDeducted;

        if (item.batchId) {
          const [targetBatch] = await db
            .select()
            .from(obatBatches)
            .where(
              and(eq(obatBatches.id, item.batchId), eq(obatBatches.medicineId, item.medicineId))
            );
          if (targetBatch) {
            if (allowNegativeStock) {
              await db
                .update(obatBatches)
                .set({ qtyRemaining: targetBatch.qtyRemaining - toDeduct })
                .where(eq(obatBatches.id, targetBatch.id));
              toDeduct = 0;
            } else {
              const take = Math.min(Math.max(0, targetBatch.qtyRemaining), toDeduct);
              if (take > 0) {
                await db
                  .update(obatBatches)
                  .set({ qtyRemaining: targetBatch.qtyRemaining - take })
                  .where(eq(obatBatches.id, targetBatch.id));
                toDeduct -= take;
              }
            }
          }
        }

        if (toDeduct > 0) {
          const activeBatches = await db
            .select()
            .from(obatBatches)
            .where(and(eq(obatBatches.medicineId, item.medicineId), gt(obatBatches.qtyRemaining, 0)))
            .orderBy(asc(obatBatches.expiryDate), asc(obatBatches.id));

          for (const batch of activeBatches) {
            if (toDeduct <= 0) break;
            if (item.batchId && batch.id === item.batchId) continue;
            const take = Math.min(batch.qtyRemaining, toDeduct);
            await db
              .update(obatBatches)
              .set({ qtyRemaining: batch.qtyRemaining - take })
              .where(eq(obatBatches.id, batch.id));
            toDeduct -= take;
          }
        }

        await db
          .update(medicines)
          .set({
            stockBase: allowNegativeStock
              ? sql`${medicines.stockBase} - ${item.baseQtyDeducted}`
              : sql`GREATEST(0, ${medicines.stockBase} - ${item.baseQtyDeducted})`,
            updatedAt: new Date(),
          })
          .where(eq(medicines.id, item.medicineId));
      }
    }

    // Update patient loyalty points and receivable balance if applicable
    if (payload.patientId) {
      const earnedPoints = Math.floor(payload.totalAmount / 10000);
      await db
        .update(patients)
        .set({
          points: sql`${patients.points} + ${earnedPoints}`,
          receivableBalance: sql`${patients.receivableBalance} + ${remainingBalance}`,
        })
        .where(eq(patients.id, payload.patientId));
    }

    return createdTx;
  } catch (error) {
    console.error('Database query failed in createPosTransaction:', error);
    throw new Error('Gagal memproses transaksi POS kasir.', { cause: error });
  }
}

export async function recordReceivablePayment(txId: number, paymentAmount: number) {
  try {
    const [existing] = await db.select().from(transactions).where(eq(transactions.id, txId));
    if (!existing) {
      throw new Error('Transaksi piutang tidak ditemukan.');
    }

    const applied = Math.min(existing.remainingBalance, Math.max(0, paymentAmount));
    const newRemaining = Math.max(0, existing.remainingBalance - applied);
    const newPaid = existing.paidAmount + applied;
    const newStatus = newRemaining === 0 ? 'Lunas' : 'Cicilan';

    const [updatedTx] = await db
      .update(transactions)
      .set({
        paidAmount: newPaid,
        remainingBalance: newRemaining,
        paymentStatus: newStatus,
      })
      .where(eq(transactions.id, txId))
      .returning();

    if (existing.patientId && applied > 0) {
      await db
        .update(patients)
        .set({
          receivableBalance: sql`GREATEST(0, ${patients.receivableBalance} - ${applied})`,
        })
        .where(eq(patients.id, existing.patientId));
    }

    return updatedTx;
  } catch (error) {
    console.error('Database query failed in recordReceivablePayment:', error);
    throw new Error('Gagal mencatat pembayaran cicilan/pelunasan piutang.', { cause: error });
  }
}

export async function updatePosTransaction(id: number, payload: TransactionPayload) {
  try {
    const [existing] = await db.select().from(transactions).where(eq(transactions.id, id));
    if (!existing) {
      throw new Error('Transaksi penjualan tidak ditemukan.');
    }

    const { allowNegativeStock = false, ...txValues } = payload;

    // 1. Restore previous stock deductions
    for (const oldItem of existing.items || []) {
      if (oldItem.medicineId && oldItem.baseQtyDeducted > 0) {
        if (oldItem.batchId) {
          await db
            .update(obatBatches)
            .set({ qtyRemaining: sql`${obatBatches.qtyRemaining} + ${oldItem.baseQtyDeducted}` })
            .where(eq(obatBatches.id, oldItem.batchId));
        } else {
          const [latestBatch] = await db
            .select()
            .from(obatBatches)
            .where(eq(obatBatches.medicineId, oldItem.medicineId))
            .orderBy(desc(obatBatches.expiryDate), desc(obatBatches.id))
            .limit(1);
          if (latestBatch) {
            await db
              .update(obatBatches)
              .set({ qtyRemaining: latestBatch.qtyRemaining + oldItem.baseQtyDeducted })
              .where(eq(obatBatches.id, latestBatch.id));
          }
        }
        await db
          .update(medicines)
          .set({
            stockBase: sql`${medicines.stockBase} + ${oldItem.baseQtyDeducted}`,
            updatedAt: new Date(),
          })
          .where(eq(medicines.id, oldItem.medicineId));
      }
    }

    // Reverse old patient points & receivable balance
    if (existing.patientId) {
      const oldPoints = Math.floor((existing.totalAmount || 0) / 10000);
      await db
        .update(patients)
        .set({
          points: sql`GREATEST(0, ${patients.points} - ${oldPoints})`,
          receivableBalance: sql`GREATEST(0, ${patients.receivableBalance} - ${existing.remainingBalance || 0})`,
        })
        .where(eq(patients.id, existing.patientId));
    }

    // 2. Apply new deductions & payment calculations
    const isTempo = txValues.paymentMethod === 'Piutang/Tempo';
    const remainingBalance = isTempo ? Math.max(0, txValues.totalAmount - txValues.paidAmount) : 0;
    const paymentStatus =
      remainingBalance === 0
        ? 'Lunas'
        : txValues.paidAmount > 0
          ? 'Cicilan'
          : 'Belum Lunas';

    const [updatedTx] = await db
      .update(transactions)
      .set({
        ...txValues,
        paymentStatus,
        remainingBalance,
      })
      .where(eq(transactions.id, id))
      .returning();

    for (const item of txValues.items || []) {
      if (item.medicineId && item.baseQtyDeducted > 0) {
        let toDeduct = item.baseQtyDeducted;
        const activeBatches = await db
          .select()
          .from(obatBatches)
          .where(and(eq(obatBatches.medicineId, item.medicineId), gt(obatBatches.qtyRemaining, 0)))
          .orderBy(asc(obatBatches.expiryDate), asc(obatBatches.id));

        for (const batch of activeBatches) {
          if (toDeduct <= 0) break;
          const take = Math.min(batch.qtyRemaining, toDeduct);
          await db
            .update(obatBatches)
            .set({ qtyRemaining: batch.qtyRemaining - take })
            .where(eq(obatBatches.id, batch.id));
          toDeduct -= take;
        }

        await db
          .update(medicines)
          .set({
            stockBase: allowNegativeStock
              ? sql`${medicines.stockBase} - ${item.baseQtyDeducted}`
              : sql`GREATEST(0, ${medicines.stockBase} - ${item.baseQtyDeducted})`,
            updatedAt: new Date(),
          })
          .where(eq(medicines.id, item.medicineId));
      }
    }

    if (txValues.patientId) {
      const earnedPoints = Math.floor(txValues.totalAmount / 10000);
      await db
        .update(patients)
        .set({
          points: sql`${patients.points} + ${earnedPoints}`,
          receivableBalance: sql`${patients.receivableBalance} + ${remainingBalance}`,
        })
        .where(eq(patients.id, txValues.patientId));
    }

    return updatedTx;
  } catch (error) {
    console.error('Database query failed in updatePosTransaction:', error);
    throw new Error('Gagal memperbarui transaksi penjualan.', { cause: error });
  }
}

export async function removePosTransaction(id: number) {
  try {
    const [existing] = await db.select().from(transactions).where(eq(transactions.id, id));
    if (!existing) {
      throw new Error('Transaksi penjualan tidak ditemukan.');
    }

    // Restore stock for deleted sale
    for (const oldItem of existing.items || []) {
      if (oldItem.medicineId && oldItem.baseQtyDeducted > 0) {
        if (oldItem.batchId) {
          await db
            .update(obatBatches)
            .set({ qtyRemaining: sql`${obatBatches.qtyRemaining} + ${oldItem.baseQtyDeducted}` })
            .where(eq(obatBatches.id, oldItem.batchId));
        } else {
          const [latestBatch] = await db
            .select()
            .from(obatBatches)
            .where(eq(obatBatches.medicineId, oldItem.medicineId))
            .orderBy(desc(obatBatches.expiryDate), desc(obatBatches.id))
            .limit(1);
          if (latestBatch) {
            await db
              .update(obatBatches)
              .set({ qtyRemaining: latestBatch.qtyRemaining + oldItem.baseQtyDeducted })
              .where(eq(obatBatches.id, latestBatch.id));
          }
        }
        await db
          .update(medicines)
          .set({
            stockBase: sql`${medicines.stockBase} + ${oldItem.baseQtyDeducted}`,
            updatedAt: new Date(),
          })
          .where(eq(medicines.id, oldItem.medicineId));
      }
    }

    if (existing.patientId) {
      const oldPoints = Math.floor((existing.totalAmount || 0) / 10000);
      await db
        .update(patients)
        .set({
          points: sql`GREATEST(0, ${patients.points} - ${oldPoints})`,
          receivableBalance: sql`GREATEST(0, ${patients.receivableBalance} - ${existing.remainingBalance || 0})`,
        })
        .where(eq(patients.id, existing.patientId));
    }

    await db.delete(transactions).where(eq(transactions.id, id));
    return { deletedId: id };
  } catch (error) {
    console.error('Database query failed in removePosTransaction:', error);
    throw new Error('Gagal menghapus transaksi penjualan.', { cause: error });
  }
}

export interface ClinicalCarePayload {
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

export async function createClinicalRecord(payload: ClinicalCarePayload) {
  try {
    const [created] = await db.insert(clinicalCareRecords).values(payload).returning();
    return created;
  } catch (error) {
    console.error('Database query failed in createClinicalRecord:', error);
    throw new Error('Gagal menyimpan catatan asuhan kefarmasian SOAP/DRP.', { cause: error });
  }
}

export async function updateClinicalRecordStatus(
  id: number,
  status: string,
  adherenceScore: number,
  ePrescriptionItems?: EPrescriptionItem[]
) {
  try {
    const updateValues: Partial<typeof clinicalCareRecords.$inferInsert> = {
      status,
      adherenceScore,
    };
    if (ePrescriptionItems) {
      updateValues.ePrescriptionItems = ePrescriptionItems;
    }
    const [updated] = await db
      .update(clinicalCareRecords)
      .set(updateValues)
      .where(eq(clinicalCareRecords.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error('Database query failed in updateClinicalRecordStatus:', error);
    throw new Error('Gagal memperbarui status kepatuhan terapi pasien.', { cause: error });
  }
}

export async function createSwamedikasiLog(payload: {
  patientName: string;
  symptomCategory: string;
  triageAnswers: Record<string, string>;
  redFlagsDetected: boolean;
  recommendationSummary: string;
  recommendedMedicines: SwamedikasiRecommendation[];
  convertedToPos: boolean;
}) {
  try {
    const [created] = await db.insert(swamedikasiLogs).values(payload).returning();
    return created;
  } catch (error) {
    console.error('Database query failed in createSwamedikasiLog:', error);
    throw new Error('Gagal menyimpan log konsultasi swamedikasi.', { cause: error });
  }
}

export async function createRxBundle(payload: {
  name: string;
  diagnosisIcd10: string;
  description: string;
  bundleDiscountPercent: string;
  items: RxBundleItem[];
}) {
  try {
    const [created] = await db
      .insert(rxBundles)
      .values({ ...payload, isActive: true })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed in createRxBundle:', error);
    throw new Error('Gagal membuat paket resep bundling baru.', { cause: error });
  }
}

export async function createDrugInteractionRule(payload: {
  drugAKeyword: string;
  drugBKeyword: string;
  severity: string;
  mechanism: string;
  clinicalEffect: string;
  managementAdvice: string;
  evidenceLevel: string;
  literature?: string;
}) {
  try {
    const [created] = await db
      .insert(drugInteractions)
      .values({
        ...payload,
        literature: (payload.literature || '').trim() || "Stockley's Drug Interactions Ed. 13; Lexicomp",
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed in createDrugInteractionRule:', error);
    throw new Error('Gagal menambahkan aturan interaksi obat baru.', { cause: error });
  }
}

export async function checkAutomatedInteractions(
  candidateDrugs: CandidateDrugInput[],
  patientId?: number | null
) {
  try {
    const rules = await db.select().from(drugInteractions);

    const historyDrugs: CandidateDrugInput[] = [];
    if (patientId) {
      const [patientClinical, patientTxs] = await Promise.all([
        db
          .select()
          .from(clinicalCareRecords)
          .where(eq(clinicalCareRecords.patientId, patientId))
          .orderBy(desc(clinicalCareRecords.id))
          .limit(5),
        db
          .select()
          .from(transactions)
          .where(eq(transactions.patientId, patientId))
          .orderBy(desc(transactions.id))
          .limit(5),
      ]);

      for (const rec of patientClinical) {
        for (const rx of rec.ePrescriptionItems || []) {
          historyDrugs.push({ name: rx.medicineName });
        }
      }
      for (const tx of patientTxs) {
        for (const item of tx.items || []) {
          historyDrugs.push({ name: item.name });
        }
      }
    }

    const alerts = detectDrugInteractions(candidateDrugs, historyDrugs, rules);
    return {
      alerts,
      checkedAgainstHistoryCount: historyDrugs.length,
      rulesEvaluated: rules.length,
    };
  } catch (error) {
    console.error('Database query failed in checkAutomatedInteractions:', error);
    throw new Error('Gagal memeriksa basis data interaksi obat.', { cause: error });
  }
}

export async function createGoodsReceiptBatch(payload: {
  medicineId: number;
  supplierId: number | null;
  supplierName: string;
  batchNumber: string;
  expiryDate: string;
  qtyReceived: number;
  rackLocation: string;
  hppUnit: number;
  receivedDate: string;
  notes: string;
  auditorName: string;
}) {
  try {
    const [med] = await db.select().from(medicines).where(eq(medicines.id, payload.medicineId));
    if (!med) {
      throw new Error('Produk obat tidak ditemukan.');
    }

    const qty = Math.max(1, Math.round(payload.qtyReceived));
    const [createdBatch] = await db
      .insert(obatBatches)
      .values({
        medicineId: med.id,
        medicineSku: med.sku,
        medicineName: med.name,
        supplierId: payload.supplierId,
        supplierName: payload.supplierName.trim() || 'PBF Resmi',
        batchNumber: payload.batchNumber.trim(),
        expiryDate: payload.expiryDate,
        qtyReceived: qty,
        qtyRemaining: qty,
        rackLocation: payload.rackLocation.trim() || 'Rak A-1',
        hppUnit: Math.max(
          0,
          Math.round(
            payload.hppUnit ||
              med.hpp / Math.max(1, (med.pcsPerStrip || 1) * (med.stripsPerBox || 1))
          )
        ),
        receivedDate: payload.receivedDate,
        notes: payload.notes.trim(),
      })
      .returning();

    const activeBatches = await db
      .select()
      .from(obatBatches)
      .where(and(eq(obatBatches.medicineId, med.id), gt(obatBatches.qtyRemaining, 0)))
      .orderBy(asc(obatBatches.expiryDate));

    const earliestExpiry = activeBatches[0]?.expiryDate || payload.expiryDate;
    const [updatedMed] = await db
      .update(medicines)
      .set({
        stockBase: med.stockBase + qty,
        expiryDate: earliestExpiry,
        updatedAt: new Date(),
      })
      .where(eq(medicines.id, med.id))
      .returning();

    const [auditLog] = await db
      .insert(stockAuditLogs)
      .values({
        medicineId: med.id,
        batchId: createdBatch.id,
        medicineName: med.name,
        batchNumber: createdBatch.batchNumber,
        systemQty: med.stockBase,
        physicalQty: med.stockBase + qty,
        variance: qty,
        reason: 'Penerimaan PBF',
        auditorName: payload.auditorName || 'Apt. Latisha',
        notes: `Goods Receipt dari ${createdBatch.supplierName} (${createdBatch.rackLocation})`,
        auditDate: payload.receivedDate,
      })
      .returning();

    return { batch: createdBatch, medicine: updatedMed, auditLog };
  } catch (error) {
    console.error('Database query failed in createGoodsReceiptBatch:', error);
    throw new Error('Gagal mencatat penerimaan batch barang masuk.', { cause: error });
  }
}

export async function recordStockOpname(payload: {
  batchId: number;
  physicalQty: number;
  reason: string;
  notes: string;
  auditorName: string;
  auditDate: string;
}) {
  try {
    const [batch] = await db
      .select()
      .from(obatBatches)
      .where(eq(obatBatches.id, payload.batchId));
    if (!batch) {
      throw new Error('Batch obat tidak ditemukan.');
    }

    const physical = Math.max(0, Math.round(payload.physicalQty));
    const systemQty = batch.qtyRemaining;
    const variance = physical - systemQty;

    const [updatedBatch] = await db
      .update(obatBatches)
      .set({ qtyRemaining: physical })
      .where(eq(obatBatches.id, batch.id))
      .returning();

    const allMedBatches = await db
      .select()
      .from(obatBatches)
      .where(eq(obatBatches.medicineId, batch.medicineId))
      .orderBy(asc(obatBatches.expiryDate));

    const totalStock = allMedBatches.reduce((sum, b) => sum + b.qtyRemaining, 0);
    const earliestActive = allMedBatches.find((b) => b.qtyRemaining > 0);

    const [updatedMed] = await db
      .update(medicines)
      .set({
        stockBase: totalStock,
        ...(earliestActive ? { expiryDate: earliestActive.expiryDate } : {}),
        updatedAt: new Date(),
      })
      .where(eq(medicines.id, batch.medicineId))
      .returning();

    const [auditLog] = await db
      .insert(stockAuditLogs)
      .values({
        medicineId: batch.medicineId,
        batchId: batch.id,
        medicineName: batch.medicineName,
        batchNumber: batch.batchNumber,
        systemQty,
        physicalQty: physical,
        variance,
        reason: payload.reason || 'Koreksi Opname',
        auditorName: payload.auditorName || 'Apt. Latisha',
        notes: payload.notes.trim(),
        auditDate: payload.auditDate,
      })
      .returning();

    return { batch: updatedBatch, medicine: updatedMed, auditLog };
  } catch (error) {
    console.error('Database query failed in recordStockOpname:', error);
    throw new Error('Gagal menyimpan hasil stock opname.', { cause: error });
  }
}

export async function createPurchaseOrderDraft(payload: {
  supplierId: number | null;
  supplierName: string;
  items: PurchaseOrderItem[];
  createdBy: string;
  orderDate: string;
  notes: string;
}) {
  try {
    const poNumber = `PO-LF-${payload.orderDate.replace(/-/g, '').slice(0, 6)}-${Math.floor(100 + Math.random() * 899)}`;
    const estimatedTotal = payload.items.reduce((sum, i) => sum + i.lineTotal, 0);
    const [created] = await db
      .insert(purchaseOrders)
      .values({
        poNumber,
        supplierId: payload.supplierId,
        supplierName: payload.supplierName.trim() || 'PBF Resmi',
        status: 'Draft',
        items: payload.items,
        estimatedTotal,
        createdBy: payload.createdBy || 'Apt. Latisha',
        orderDate: payload.orderDate,
        notes: payload.notes.trim(),
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed in createPurchaseOrderDraft:', error);
    throw new Error('Gagal membuat draf Purchase Order (PO).', { cause: error });
  }
}

export async function updatePurchaseOrderStatus(id: number, status: string) {
  try {
    const [updated] = await db
      .update(purchaseOrders)
      .set({ status })
      .where(eq(purchaseOrders.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error('Database query failed in updatePurchaseOrderStatus:', error);
    throw new Error('Gagal memperbarui status Purchase Order.', { cause: error });
  }
}

export async function updatePurchaseOrder(
  id: number,
  payload: {
    supplierId: number | null;
    supplierName: string;
    items: PurchaseOrderItem[];
    orderDate: string;
    notes: string;
  }
) {
  try {
    const [existing] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id));
    if (!existing) {
      return { ok: false as const, statusCode: 404, error: 'Data pembelian tidak ditemukan.' };
    }
    if (existing.status === 'Diproses' || existing.status === 'Diterima') {
      return {
        ok: false as const,
        statusCode: 403,
        error: 'Pembelian yang sudah diproses terkunci dan tidak dapat diedit.',
      };
    }

    const estimatedTotal = payload.items.reduce((sum, i) => sum + i.lineTotal, 0);
    const [updated] = await db
      .update(purchaseOrders)
      .set({
        supplierId: payload.supplierId,
        supplierName: payload.supplierName.trim() || 'PBF Resmi',
        items: payload.items,
        estimatedTotal,
        orderDate: payload.orderDate,
        notes: payload.notes.trim(),
      })
      .where(eq(purchaseOrders.id, id))
      .returning();

    return { ok: true as const, data: updated };
  } catch (error) {
    console.error('Database query failed in updatePurchaseOrder:', error);
    throw new Error('Gagal memperbarui data transaksi pembelian.', { cause: error });
  }
}

export async function removePurchaseOrder(id: number) {
  try {
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
    return { deletedId: id };
  } catch (error) {
    console.error('Database query failed in removePurchaseOrder:', error);
    throw new Error('Gagal menghapus transaksi pembelian.', { cause: error });
  }
}

export async function processPurchaseOrder(id: number, auditorName: string) {
  try {
    const [existing] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id));
    if (!existing) {
      return { ok: false as const, statusCode: 404, error: 'Data pembelian tidak ditemukan.' };
    }
    if (existing.status === 'Diproses' || existing.status === 'Diterima') {
      return {
        ok: false as const,
        statusCode: 400,
        error: 'Transaksi pembelian ini sudah diproses sebelumnya.',
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    const defaultExpiryDate = new Date(Date.now() + 540 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const createdBatches: (typeof obatBatches.$inferSelect)[] = [];
    const updatedMedicines: (typeof medicines.$inferSelect)[] = [];
    const createdAuditLogs: (typeof stockAuditLogs.$inferSelect)[] = [];

    for (const item of existing.items || []) {
      const qty = Math.max(0, Math.round(Number(item.orderQtyBase) || 0));
      if (!item.medicineId || qty <= 0) continue;

      const [med] = await db
        .select()
        .from(medicines)
        .where(eq(medicines.id, item.medicineId));
      if (!med) continue;

      const batchNo = `PB-${existing.poNumber.slice(-5)}-${med.sku.slice(-3)}`;
      const [newBatch] = await db
        .insert(obatBatches)
        .values({
          medicineId: med.id,
          medicineSku: med.sku,
          medicineName: med.name,
          supplierId: existing.supplierId,
          supplierName: existing.supplierName,
          batchNumber: batchNo,
          expiryDate: defaultExpiryDate,
          qtyReceived: qty,
          qtyRemaining: qty,
          rackLocation: 'Rak Penerimaan PBF',
          hppUnit: Math.max(
            0,
            Math.round(
              item.estimatedHpp ||
                med.hpp / Math.max(1, (med.pcsPerStrip || 1) * (med.stripsPerBox || 1))
            )
          ),
          receivedDate: today,
          notes: `Otomatis dari proses pembelian ${existing.poNumber}`,
        })
        .returning();
      createdBatches.push(newBatch);

      const [updatedMed] = await db
        .update(medicines)
        .set({
          stockBase: med.stockBase + qty,
          updatedAt: new Date(),
        })
        .where(eq(medicines.id, med.id))
        .returning();
      updatedMedicines.push(updatedMed);

      const [auditLog] = await db
        .insert(stockAuditLogs)
        .values({
          medicineId: med.id,
          batchId: newBatch.id,
          medicineName: med.name,
          batchNumber: batchNo,
          systemQty: med.stockBase,
          physicalQty: med.stockBase + qty,
          variance: qty,
          reason: 'Penerimaan PBF',
          auditorName: auditorName || existing.createdBy || 'Apt. Latisha',
          notes: `Proses pembelian ${existing.poNumber} dari ${existing.supplierName}`,
          auditDate: today,
        })
        .returning();
      createdAuditLogs.push(auditLog);
    }

    const [updatedPo] = await db
      .update(purchaseOrders)
      .set({ status: 'Diproses' })
      .where(eq(purchaseOrders.id, id))
      .returning();

    return {
      ok: true as const,
      data: {
        purchaseOrder: updatedPo,
        createdBatches,
        updatedMedicines,
        createdAuditLogs,
      },
    };
  } catch (error) {
    console.error('Database query failed in processPurchaseOrder:', error);
    throw new Error('Gagal memproses transaksi pembelian.', { cause: error });
  }
}

export interface PrescriptionPayload {
  rxNumber?: string;
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
  status: string;
}

export async function upsertPrescription(id: number | null, payload: PrescriptionPayload) {
  try {
    const cleanValues = {
      rxNumber:
        payload.rxNumber?.trim() ||
        `RX-LF-${(payload.rxDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 899)}`,
      rxDate: payload.rxDate || new Date().toISOString().slice(0, 10),
      patientId: payload.patientId || null,
      patientName: payload.patientName.trim(),
      weightKg: String(payload.weightKg || '').trim(),
      birthDate: payload.birthDate || '',
      ageYears: Math.max(0, Math.round(Number(payload.ageYears) || 0)),
      ageLabel: payload.ageLabel?.trim() || `${Math.max(0, Math.round(Number(payload.ageYears) || 0))} Thn`,
      patientPhone: payload.patientPhone?.trim() || '',
      patientAddress: payload.patientAddress?.trim() || '',
      allergies: payload.allergies?.trim() || 'Tidak ada riwayat alergi',
      doctorName: payload.doctorName?.trim() || '-',
      doctorSip: payload.doctorSip?.trim() || '-',
      clinicName: payload.clinicName?.trim() || '-',
      iterFlag: payload.iterFlag || 'Non-Iter',
      pharmacyHeader: payload.pharmacyHeader,
      items: Array.isArray(payload.items) ? payload.items : [],
      notes: payload.notes?.trim() || '',
      pharmacistName: payload.pharmacistName?.trim() || 'Apt. Latisha Rahma, S.Farm',
      status: payload.status || 'Diserahkan',
    };

    if (id) {
      const [updated] = await db
        .update(prescriptions)
        .set({ ...cleanValues, updatedAt: new Date() })
        .where(eq(prescriptions.id, id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(prescriptions).values(cleanValues).returning();
    return created;
  } catch (error) {
    console.error('Database query failed in upsertPrescription:', error);
    throw new Error('Gagal menyimpan data resep.', { cause: error });
  }
}

export async function removePrescription(id: number) {
  try {
    await db.delete(prescriptions).where(eq(prescriptions.id, id));
    return { deletedId: id };
  } catch (error) {
    console.error('Database query failed in removePrescription:', error);
    throw new Error('Gagal menghapus riwayat resep.', { cause: error });
  }
}

export async function exportFullDatabaseSnapshot() {
  try {
    const data = await getBootstrapData();
    return {
      schemaVersion: '1.0.0',
      application: 'ApotekSu - Clinical & Retail Pharmacy (Enterprise Edition)',
      exportedAt: new Date().toISOString(),
      data,
    };
  } catch (error) {
    console.error('Database query failed in exportFullDatabaseSnapshot:', error);
    throw new Error('Gagal mengekspor snapshot database.', { cause: error });
  }
}
