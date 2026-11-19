import initialSeedSnapshot from './initialSeedSnapshot.json';
import { detectDrugInteractions, type CandidateDrugInput } from './drugInteractions';
import { getStoredTenantSession } from './apiClient';
import type {
  BootstrapPayload,
  ClinicalCareRecord,
  DrugCategory,
  DrugInteractionRule,
  Employee,
  ExternalLicenseState,
  Medicine,
  ObatBatch,
  Patient,
  PrescriptionRecord,
  PurchaseOrder,
  RxBundle,
  StockAuditLog,
  Supplier,
  SwamedikasiLog,
  TransactionRecord,
} from '../types/pharmacy';

const LOCAL_DB_STORAGE_KEY = 'apoteksu_browser_db_v2';

type LocalDatabaseState = Omit<BootstrapPayload, 'user' | 'license'>;

function cloneInitialSeed(): LocalDatabaseState {
  const raw = JSON.parse(JSON.stringify(initialSeedSnapshot)) as LocalDatabaseState;
  return {
    categories: raw.categories || [],
    medicines: raw.medicines || [],
    patients: raw.patients || [],
    suppliers: raw.suppliers || [],
    employees: raw.employees || [],
    batches: raw.batches || [],
    stockAuditLogs: raw.stockAuditLogs || [],
    purchaseOrders: raw.purchaseOrders || [],
    prescriptions: raw.prescriptions || [],
    rxBundles: raw.rxBundles || [],
    transactions: raw.transactions || [],
    clinicalRecords: raw.clinicalRecords || [],
    swamedikasiLogs: raw.swamedikasiLogs || [],
    drugInteractions: raw.drugInteractions || [],
  };
}

function loadLocalDb(): LocalDatabaseState {
  try {
    const raw = localStorage.getItem(LOCAL_DB_STORAGE_KEY);
    if (!raw) {
      const seed = cloneInitialSeed();
      localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as Partial<LocalDatabaseState>;
    const seed = cloneInitialSeed();
    return {
      categories: Array.isArray(parsed.categories) && parsed.categories.length > 0 ? parsed.categories : seed.categories,
      medicines: Array.isArray(parsed.medicines) && parsed.medicines.length > 0 ? parsed.medicines : seed.medicines,
      patients: Array.isArray(parsed.patients) ? parsed.patients : seed.patients,
      suppliers: Array.isArray(parsed.suppliers) && parsed.suppliers.length > 0 ? parsed.suppliers : seed.suppliers,
      employees: Array.isArray(parsed.employees) && parsed.employees.length > 0 ? parsed.employees : seed.employees,
      batches: Array.isArray(parsed.batches) ? parsed.batches : seed.batches,
      stockAuditLogs: Array.isArray(parsed.stockAuditLogs) ? parsed.stockAuditLogs : seed.stockAuditLogs,
      purchaseOrders: Array.isArray(parsed.purchaseOrders) ? parsed.purchaseOrders : seed.purchaseOrders,
      prescriptions: Array.isArray(parsed.prescriptions) ? parsed.prescriptions : seed.prescriptions,
      rxBundles: Array.isArray(parsed.rxBundles) ? parsed.rxBundles : seed.rxBundles,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : seed.transactions,
      clinicalRecords: Array.isArray(parsed.clinicalRecords) ? parsed.clinicalRecords : seed.clinicalRecords,
      swamedikasiLogs: Array.isArray(parsed.swamedikasiLogs) ? parsed.swamedikasiLogs : seed.swamedikasiLogs,
      drugInteractions:
        Array.isArray(parsed.drugInteractions) && parsed.drugInteractions.length > 0
          ? parsed.drugInteractions
          : seed.drugInteractions,
    };
  } catch {
    return cloneInitialSeed();
  }
}

function saveLocalDb(state: LocalDatabaseState) {
  try {
    localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }
}

function nextId<T extends { id: number }>(items: T[]): number {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
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

function resolveEmployeeAppRole(employee: { email: string; role: string }): 'super_admin' | 'apoteker' {
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

function getDefaultLicenseStatus(): ExternalLicenseState {
  return {
    configured: false,
    reachable: false,
    allowed: true,
    accessLevel: 'full',
    status: 'standalone',
    reasonCode: 'STANDALONE_MODE',
    message: 'Mode Mandiri (Static/GitHub Pages) — Operasional Apotek Aktif.',
    appCode: 'APOTEKSU',
    portalUrl: null,
    clientEmail: 'latisha.farma19@gmail.com',
    client: {
      faskesName: 'Apotek Latisha Farma',
      planTier: 'Enterprise',
      billingCycle: 'Tahunan',
      status: 'Aktif',
      dueDate: null,
      daysRemaining: null,
    },
    checkedAt: new Date().toISOString(),
  };
}

export async function handleBrowserLocalApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const url = new URL(path, window.location.origin);
  const pathname = url.pathname.replace(/^.*\/api\//, '/api/');
  const body =
    typeof options.body === 'string' && options.body.trim()
      ? JSON.parse(options.body)
      : {};

  const dbState = loadLocalDb();
  const session = getStoredTenantSession();
  const currentUserName = session?.user?.name || 'Apt. Latisha Rahma, S.Farm';

  // 1. Health check
  if (pathname === '/api/health' && method === 'GET') {
    return { ok: true, service: 'ApotekSu - Browser Local Operational Engine' } as unknown as T;
  }

  // 2. License endpoints
  if (
    (pathname === '/api/license/status' ||
      pathname === '/api/license/external-status' ||
      pathname === '/api/license/verify-now') &&
    (method === 'GET' || method === 'POST')
  ) {
    return getDefaultLicenseStatus() as unknown as T;
  }

  // 3. Public employee lookup: GET /api/public/employee-lookup?q=...
  if (pathname === '/api/public/employee-lookup' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2) {
      return [] as unknown as T;
    }
    const matches = dbState.employees
      .filter(
        (emp) =>
          !(emp.status || '').trim().toLowerCase().includes('nonaktif') &&
          matchesEmployeeNameKeyword(emp.name, q)
      )
      .slice(0, 5)
      .map((emp) => ({
        id: emp.id,
        name: emp.name,
        role: emp.role,
      }));
    return matches as unknown as T;
  }

  // 4. Public employee login: POST /api/public/employee-login
  if (pathname === '/api/public/employee-login' && method === 'POST') {
    const name = String(body.name || '').trim().replace(/\s+/g, ' ');
    const nip = String(body.nip || '').trim().toLowerCase();

    if (!name || !nip) {
      throw new Error('Nama karyawan dan ID Karyawan wajib diisi.');
    }

    const employee = dbState.employees.find(
      (emp) => (emp.nip || '').trim().toLowerCase() === nip
    );

    if (!employee) {
      throw new Error('Nama karyawan atau ID Karyawan tidak terdaftar di sistem aplikasi.');
    }

    if (!matchesEmployeeNameKeyword(employee.name, name)) {
      throw new Error('Nama karyawan tidak sesuai dengan ID Karyawan yang terdaftar di sistem.');
    }

    if ((employee.status || '').trim().toLowerCase().includes('nonaktif')) {
      throw new Error(
        `Akun karyawan "${employee.name}" sedang berstatus ${employee.status}. Hubungi Apoteker Penanggung Jawab.`
      );
    }

    const appRole = resolveEmployeeAppRole(employee);
    const email = employee.email || `${employee.nip.toLowerCase()}@latishafarma.id`;
    const token = `local-emp-token-${employee.id}-${Date.now()}`;

    return {
      token,
      user: {
        uid: `emp-${employee.id}`,
        email,
        name: employee.name,
        role: appRole,
        nip: employee.nip,
        jobTitle: employee.role,
      },
      employee,
      license: getDefaultLicenseStatus(),
    } as unknown as T;
  }

  // 5. Bootstrap: GET /api/bootstrap
  if (pathname === '/api/bootstrap' && method === 'GET') {
    return {
      user: session?.user || {
        uid: 'emp-1',
        email: 'latisha.farma19@gmail.com',
        name: 'Apt. Latisha Rahma, S.Farm',
        role: 'super_admin',
        nip: 'LF-STF-001',
        jobTitle: 'Apoteker Penanggung Jawab (APA)',
      },
      license: getDefaultLicenseStatus(),
      ...dbState,
    } as unknown as T;
  }

  // 6. Categories: POST /api/categories & DELETE /api/categories/:id
  if (pathname === '/api/categories' && method === 'POST') {
    const created: DrugCategory = {
      id: nextId(dbState.categories),
      name: String(body.name || '').trim(),
      description: String(body.description || '').trim(),
    };
    dbState.categories.push(created);
    saveLocalDb(dbState);
    return created as unknown as T;
  }
  const catDelMatch = pathname.match(/^\/api\/categories\/(\d+)$/);
  if (catDelMatch && method === 'DELETE') {
    const id = Number(catDelMatch[1]);
    dbState.categories = dbState.categories.filter((c) => c.id !== id);
    saveLocalDb(dbState);
    return { deletedId: id } as unknown as T;
  }

  // 7. Medicines: POST /api/medicines, PUT /api/medicines/:id, DELETE /api/medicines/:id
  if (pathname === '/api/medicines' && method === 'POST') {
    const created: Medicine = {
      ...body,
      id: nextId(dbState.medicines),
    };
    dbState.medicines.push(created);
    saveLocalDb(dbState);
    return created as unknown as T;
  }
  const medMatch = pathname.match(/^\/api\/medicines\/(\d+)$/);
  if (medMatch && method === 'PUT') {
    const id = Number(medMatch[1]);
    let updatedItem: Medicine = { ...body, id } as Medicine;
    dbState.medicines = dbState.medicines.map((m) => {
      if (m.id === id) {
        updatedItem = { ...m, ...body, id };
        return updatedItem;
      }
      return m;
    });
    saveLocalDb(dbState);
    return updatedItem as unknown as T;
  }
  if (medMatch && method === 'DELETE') {
    const id = Number(medMatch[1]);
    dbState.medicines = dbState.medicines.filter((m) => m.id !== id);
    saveLocalDb(dbState);
    return { deletedId: id } as unknown as T;
  }

  // 8. Patients: POST /api/patients, PUT /api/patients/:id, DELETE /api/patients/:id
  if (pathname === '/api/patients' && method === 'POST') {
    const created: Patient = {
      ...body,
      id: nextId(dbState.patients),
      points: 0,
      receivableBalance: 0,
    };
    dbState.patients.push(created);
    saveLocalDb(dbState);
    return created as unknown as T;
  }
  const patMatch = pathname.match(/^\/api\/patients\/(\d+)$/);
  if (patMatch && method === 'PUT') {
    const id = Number(patMatch[1]);
    let updatedPat: Patient = { ...body, id } as Patient;
    dbState.patients = dbState.patients.map((p) => {
      if (p.id === id) {
        updatedPat = { ...p, ...body, id };
        return updatedPat;
      }
      return p;
    });
    saveLocalDb(dbState);
    return updatedPat as unknown as T;
  }
  if (patMatch && method === 'DELETE') {
    const id = Number(patMatch[1]);
    dbState.patients = dbState.patients.filter((p) => p.id !== id);
    saveLocalDb(dbState);
    return { deletedId: id } as unknown as T;
  }

  // 9. Suppliers: POST /api/suppliers, PUT /api/suppliers/:id, DELETE /api/suppliers/:id
  if (pathname === '/api/suppliers' && method === 'POST') {
    const created: Supplier = {
      ...body,
      id: nextId(dbState.suppliers),
    };
    dbState.suppliers.push(created);
    saveLocalDb(dbState);
    return created as unknown as T;
  }
  const supMatch = pathname.match(/^\/api\/suppliers\/(\d+)$/);
  if (supMatch && method === 'PUT') {
    const id = Number(supMatch[1]);
    let updatedSup: Supplier = { ...body, id } as Supplier;
    dbState.suppliers = dbState.suppliers.map((s) => {
      if (s.id === id) {
        updatedSup = { ...s, ...body, id };
        return updatedSup;
      }
      return s;
    });
    saveLocalDb(dbState);
    return updatedSup as unknown as T;
  }
  if (supMatch && method === 'DELETE') {
    const id = Number(supMatch[1]);
    dbState.suppliers = dbState.suppliers.filter((s) => s.id !== id);
    saveLocalDb(dbState);
    return { deletedId: id } as unknown as T;
  }

  // 10. Employees: POST /api/employees, PUT /api/employees/:id, DELETE /api/employees/:id
  if (pathname === '/api/employees' && method === 'POST') {
    const created: Employee = {
      ...body,
      id: nextId(dbState.employees),
    };
    dbState.employees.push(created);
    saveLocalDb(dbState);
    return created as unknown as T;
  }
  const empMatch = pathname.match(/^\/api\/employees\/(\d+)$/);
  if (empMatch && method === 'PUT') {
    const id = Number(empMatch[1]);
    let updatedEmp: Employee = { ...body, id } as Employee;
    dbState.employees = dbState.employees.map((e) => {
      if (e.id === id) {
        updatedEmp = { ...e, ...body, id };
        return updatedEmp;
      }
      return e;
    });
    saveLocalDb(dbState);
    return updatedEmp as unknown as T;
  }
  if (empMatch && method === 'DELETE') {
    const id = Number(empMatch[1]);
    dbState.employees = dbState.employees.filter((e) => e.id !== id);
    saveLocalDb(dbState);
    return { deletedId: id } as unknown as T;
  }

  // 11. Inventory Batches: POST /api/inventory/batches
  if (pathname === '/api/inventory/batches' && method === 'POST') {
    const med = dbState.medicines.find((m) => m.id === Number(body.medicineId));
    if (!med) {
      throw new Error('Data obat tidak ditemukan untuk penerimaan batch.');
    }
    const qty = Math.max(1, Number(body.qtyReceived) || 0);
    const createdBatch: ObatBatch = {
      id: nextId(dbState.batches),
      medicineId: med.id,
      medicineSku: med.sku,
      medicineName: med.name,
      supplierId: body.supplierId ?? null,
      supplierName: String(body.supplierName || 'PBF Resmi').trim(),
      batchNumber: String(body.batchNumber || '').trim().toUpperCase(),
      expiryDate: body.expiryDate,
      qtyReceived: qty,
      qtyRemaining: qty,
      rackLocation: String(body.rackLocation || 'Rak A-1').trim(),
      hppUnit: Number(body.hppUnit) || med.hpp,
      receivedDate: body.receivedDate || new Date().toISOString().slice(0, 10),
      notes: String(body.notes || '').trim(),
    };
    dbState.batches.push(createdBatch);

    const updatedMed: Medicine = {
      ...med,
      stockBase: med.stockBase + qty,
      expiryDate: body.expiryDate < med.expiryDate ? body.expiryDate : med.expiryDate,
    };
    dbState.medicines = dbState.medicines.map((m) => (m.id === med.id ? updatedMed : m));

    const auditLog: StockAuditLog = {
      id: nextId(dbState.stockAuditLogs),
      medicineId: med.id,
      batchId: createdBatch.id,
      medicineName: med.name,
      batchNumber: createdBatch.batchNumber,
      systemQty: med.stockBase,
      physicalQty: med.stockBase + qty,
      variance: qty,
      reason: 'Penerimaan PBF',
      auditorName: body.auditorName || currentUserName,
      notes: `Barang masuk PBF (${createdBatch.supplierName})`,
      auditDate: createdBatch.receivedDate,
    };
    dbState.stockAuditLogs.unshift(auditLog);
    saveLocalDb(dbState);
    return { batch: createdBatch, medicine: updatedMed, auditLog } as unknown as T;
  }

  // 12. Stock Opname: POST /api/inventory/opname
  if (pathname === '/api/inventory/opname' && method === 'POST') {
    const batch = dbState.batches.find((b) => b.id === Number(body.batchId));
    if (!batch) {
      throw new Error('Batch obat tidak ditemukan.');
    }
    const med = dbState.medicines.find((m) => m.id === batch.medicineId);
    if (!med) {
      throw new Error('Master obat tidak ditemukan.');
    }
    const systemQty = batch.qtyRemaining;
    const physical = Math.max(0, Number(body.physicalQty) || 0);
    const variance = physical - systemQty;

    const updatedBatch: ObatBatch = { ...batch, qtyRemaining: physical };
    dbState.batches = dbState.batches.map((b) => (b.id === batch.id ? updatedBatch : b));

    const updatedMed: Medicine = {
      ...med,
      stockBase: Math.max(0, med.stockBase + variance),
    };
    dbState.medicines = dbState.medicines.map((m) => (m.id === med.id ? updatedMed : m));

    const auditLog: StockAuditLog = {
      id: nextId(dbState.stockAuditLogs),
      medicineId: med.id,
      batchId: batch.id,
      medicineName: med.name,
      batchNumber: batch.batchNumber,
      systemQty,
      physicalQty: physical,
      variance,
      reason: body.reason || 'Koreksi Opname',
      auditorName: body.auditorName || currentUserName,
      notes: String(body.notes || '').trim(),
      auditDate: body.auditDate || new Date().toISOString().slice(0, 10),
    };
    dbState.stockAuditLogs.unshift(auditLog);
    saveLocalDb(dbState);
    return { batch: updatedBatch, medicine: updatedMed, auditLog } as unknown as T;
  }

  // 13. Purchase Orders: POST, PATCH, PUT, DELETE, POST /:id/process
  if (pathname === '/api/inventory/purchase-orders' && method === 'POST') {
    const orderDate = body.orderDate || new Date().toISOString().slice(0, 10);
    const poNumber = `PO-LF-${orderDate.replace(/-/g, '').slice(0, 6)}-${Math.floor(100 + Math.random() * 899)}`;
    const items = Array.isArray(body.items) ? body.items : [];
    const estimatedTotal = items.reduce((sum: number, i: { lineTotal?: number }) => sum + (Number(i.lineTotal) || 0), 0);
    const created: PurchaseOrder = {
      id: nextId(dbState.purchaseOrders),
      poNumber,
      supplierId: body.supplierId ?? null,
      supplierName: String(body.supplierName || 'PBF Resmi').trim(),
      status: 'Draft',
      items,
      estimatedTotal,
      createdBy: body.createdBy || currentUserName,
      orderDate,
      notes: String(body.notes || '').trim(),
    };
    dbState.purchaseOrders.unshift(created);
    saveLocalDb(dbState);
    return created as unknown as T;
  }
  const poProcessMatch = pathname.match(/^\/api\/inventory\/purchase-orders\/(\d+)\/process$/);
  if (poProcessMatch && method === 'POST') {
    const id = Number(poProcessMatch[1]);
    const existing = dbState.purchaseOrders.find((p) => p.id === id);
    if (!existing) {
      throw new Error('Data pembelian tidak ditemukan.');
    }
    const today = new Date().toISOString().slice(0, 10);
    const defaultExpiryDate = new Date(Date.now() + 540 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const createdBatches: ObatBatch[] = [];
    const updatedMedicines: Medicine[] = [];
    const createdAuditLogs: StockAuditLog[] = [];

    for (const item of existing.items || []) {
      const qty = Math.max(0, Math.round(Number(item.orderQtyBase) || 0));
      if (!item.medicineId || qty <= 0) continue;
      const med = dbState.medicines.find((m) => m.id === item.medicineId);
      if (!med) continue;

      const batchNo = `PB-${existing.poNumber.slice(-5)}-${med.sku.slice(-3)}`;
      const newBatch: ObatBatch = {
        id: nextId(dbState.batches),
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
      };
      dbState.batches.push(newBatch);
      createdBatches.push(newBatch);

      const updatedMed: Medicine = {
        ...med,
        stockBase: med.stockBase + qty,
      };
      dbState.medicines = dbState.medicines.map((m) => (m.id === med.id ? updatedMed : m));
      updatedMedicines.push(updatedMed);

      const auditLog: StockAuditLog = {
        id: nextId(dbState.stockAuditLogs),
        medicineId: med.id,
        batchId: newBatch.id,
        medicineName: med.name,
        batchNumber: batchNo,
        systemQty: med.stockBase,
        physicalQty: med.stockBase + qty,
        variance: qty,
        reason: 'Penerimaan PBF',
        auditorName: currentUserName,
        notes: `Proses pembelian ${existing.poNumber} dari ${existing.supplierName}`,
        auditDate: today,
      };
      dbState.stockAuditLogs.unshift(auditLog);
      createdAuditLogs.push(auditLog);
    }

    const updatedPo: PurchaseOrder = { ...existing, status: 'Diproses' };
    dbState.purchaseOrders = dbState.purchaseOrders.map((p) => (p.id === id ? updatedPo : p));
    saveLocalDb(dbState);

    return {
      purchaseOrder: updatedPo,
      createdBatches,
      updatedMedicines,
      createdAuditLogs,
    } as unknown as T;
  }
  const poMatch = pathname.match(/^\/api\/inventory\/purchase-orders\/(\d+)$/);
  if (poMatch && method === 'PATCH') {
    const id = Number(poMatch[1]);
    let updatedPo: PurchaseOrder | null = null;
    dbState.purchaseOrders = dbState.purchaseOrders.map((p) => {
      if (p.id === id) {
        updatedPo = { ...p, status: body.status || p.status };
        return updatedPo;
      }
      return p;
    });
    saveLocalDb(dbState);
    return updatedPo as unknown as T;
  }
  if (poMatch && method === 'PUT') {
    const id = Number(poMatch[1]);
    const items = Array.isArray(body.items) ? body.items : [];
    const estimatedTotal = items.reduce((sum: number, i: { lineTotal?: number }) => sum + (Number(i.lineTotal) || 0), 0);
    let updatedPo: PurchaseOrder | null = null;
    dbState.purchaseOrders = dbState.purchaseOrders.map((p) => {
      if (p.id === id) {
        updatedPo = {
          ...p,
          supplierId: body.supplierId ?? p.supplierId,
          supplierName: String(body.supplierName || p.supplierName).trim(),
          items,
          estimatedTotal,
          orderDate: body.orderDate || p.orderDate,
          notes: String(body.notes ?? p.notes).trim(),
        };
        return updatedPo;
      }
      return p;
    });
    saveLocalDb(dbState);
    return updatedPo as unknown as T;
  }
  if (poMatch && method === 'DELETE') {
    const id = Number(poMatch[1]);
    dbState.purchaseOrders = dbState.purchaseOrders.filter((p) => p.id !== id);
    saveLocalDb(dbState);
    return { deletedId: id } as unknown as T;
  }

  // 14. Transactions (POS): POST, PUT, DELETE, PATCH /:id/payment
  if (pathname === '/api/transactions' && method === 'POST') {
    const allowNegativeStock = Boolean(body.allowNegativeStock);
    const txDate = body.transactionDate || new Date().toISOString().slice(0, 10);
    const invoiceNo = `INV-${txDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
    const isTempo = body.paymentMethod === 'Piutang/Tempo';
    const totalAmount = Number(body.totalAmount) || 0;
    const paidAmount = Number(body.paidAmount) || 0;
    const remainingBalance = isTempo ? Math.max(0, totalAmount - paidAmount) : 0;
    const paymentStatus =
      remainingBalance === 0 ? 'Lunas' : paidAmount > 0 ? 'Cicilan' : 'Belum Lunas';

    const createdTx: TransactionRecord = {
      ...body,
      id: nextId(dbState.transactions),
      invoiceNo,
      paymentStatus,
      remainingBalance,
    };
    dbState.transactions.unshift(createdTx);

    for (const item of createdTx.items || []) {
      if (item.medicineId && item.baseQtyDeducted > 0) {
        dbState.medicines = dbState.medicines.map((m) => {
          if (m.id === item.medicineId) {
            return {
              ...m,
              stockBase: allowNegativeStock
                ? m.stockBase - item.baseQtyDeducted
                : Math.max(0, m.stockBase - item.baseQtyDeducted),
            };
          }
          return m;
        });
      }
    }

    if (createdTx.patientId) {
      const earnedPoints = Math.floor(totalAmount / 10000);
      dbState.patients = dbState.patients.map((p) =>
        p.id === createdTx.patientId
          ? {
              ...p,
              points: p.points + earnedPoints,
              receivableBalance: p.receivableBalance + remainingBalance,
            }
          : p
      );
    }

    saveLocalDb(dbState);
    return createdTx as unknown as T;
  }
  const txPayMatch = pathname.match(/^\/api\/transactions\/(\d+)\/payment$/);
  if (txPayMatch && method === 'PATCH') {
    const id = Number(txPayMatch[1]);
    const amount = Math.max(0, Number(body.amount) || 0);
    let updatedTx: TransactionRecord | null = null;
    dbState.transactions = dbState.transactions.map((tx) => {
      if (tx.id === id) {
        const applied = Math.min(tx.remainingBalance, amount);
        const newRemaining = Math.max(0, tx.remainingBalance - applied);
        const newPaid = tx.paidAmount + applied;
        updatedTx = {
          ...tx,
          paidAmount: newPaid,
          remainingBalance: newRemaining,
          paymentStatus: newRemaining === 0 ? 'Lunas' : 'Cicilan',
        };
        return updatedTx;
      }
      return tx;
    });
    saveLocalDb(dbState);
    return updatedTx as unknown as T;
  }
  const txMatch = pathname.match(/^\/api\/transactions\/(\d+)$/);
  if (txMatch && method === 'PUT') {
    const id = Number(txMatch[1]);
    let updatedTx: TransactionRecord | null = null;
    dbState.transactions = dbState.transactions.map((tx) => {
      if (tx.id === id) {
        const isTempo = body.paymentMethod === 'Piutang/Tempo';
        const totalAmount = Number(body.totalAmount ?? tx.totalAmount) || 0;
        const paidAmount = Number(body.paidAmount ?? tx.paidAmount) || 0;
        const remainingBalance = isTempo ? Math.max(0, totalAmount - paidAmount) : 0;
        const paymentStatus =
          remainingBalance === 0 ? 'Lunas' : paidAmount > 0 ? 'Cicilan' : 'Belum Lunas';
        const nextTx: TransactionRecord = {
          ...tx,
          ...body,
          id,
          remainingBalance,
          paymentStatus,
        };
        updatedTx = nextTx;
        return nextTx;
      }
      return tx;
    });
    saveLocalDb(dbState);
    return updatedTx as unknown as T;
  }
  if (txMatch && method === 'DELETE') {
    const id = Number(txMatch[1]);
    const existing = dbState.transactions.find((t) => t.id === id);
    dbState.transactions = dbState.transactions.filter((t) => t.id !== id);
    saveLocalDb(dbState);
    return {
      deletedId: id,
      invoiceNo: existing?.invoiceNo || `#${id}`,
      restoredMedicines: dbState.medicines,
      restoredBatches: dbState.batches,
    } as unknown as T;
  }

  // 15. Clinical Records: POST /api/clinical-records & PATCH /api/clinical-records/:id
  if (pathname === '/api/clinical-records' && method === 'POST') {
    const created: ClinicalCareRecord = {
      ...body,
      id: nextId(dbState.clinicalRecords),
    };
    dbState.clinicalRecords.unshift(created);
    saveLocalDb(dbState);
    return created as unknown as T;
  }
  const clinMatch = pathname.match(/^\/api\/clinical-records\/(\d+)$/);
  if (clinMatch && method === 'PATCH') {
    const id = Number(clinMatch[1]);
    let updatedRec: ClinicalCareRecord | null = null;
    dbState.clinicalRecords = dbState.clinicalRecords.map((rec) => {
      if (rec.id === id) {
        const nextRec: ClinicalCareRecord = {
          ...rec,
          status: body.status || rec.status,
          adherenceScore: Number(body.adherenceScore ?? rec.adherenceScore),
          ePrescriptionItems: Array.isArray(body.ePrescriptionItems)
            ? body.ePrescriptionItems
            : rec.ePrescriptionItems,
        };
        updatedRec = nextRec;
        return nextRec;
      }
      return rec;
    });
    saveLocalDb(dbState);
    return updatedRec as unknown as T;
  }

  // 16. Swamedikasi & Bundles
  if (pathname === '/api/swamedikasi' && method === 'POST') {
    const created: SwamedikasiLog = {
      ...body,
      id: nextId(dbState.swamedikasiLogs),
    };
    dbState.swamedikasiLogs.unshift(created);
    saveLocalDb(dbState);
    return created as unknown as T;
  }
  if (pathname === '/api/bundles' && method === 'POST') {
    const created: RxBundle = {
      ...body,
      id: nextId(dbState.rxBundles),
      isActive: true,
    };
    dbState.rxBundles.unshift(created);
    saveLocalDb(dbState);
    return created as unknown as T;
  }

  // 17. Prescriptions: POST, PUT, DELETE
  if (pathname === '/api/prescriptions' && method === 'POST') {
    const rxDate = body.rxDate || new Date().toISOString().slice(0, 10);
    const created: PrescriptionRecord = {
      ...body,
      id: nextId(dbState.prescriptions),
      rxNumber:
        body.rxNumber?.trim() ||
        `RX-LF-${rxDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 899)}`,
      rxDate,
      pharmacistName: body.pharmacistName || currentUserName,
      status: body.status || 'Diserahkan',
    };
    dbState.prescriptions.unshift(created);
    saveLocalDb(dbState);
    return created as unknown as T;
  }
  const rxMatch = pathname.match(/^\/api\/prescriptions\/(\d+)$/);
  if (rxMatch && method === 'PUT') {
    const id = Number(rxMatch[1]);
    let updatedRx: PrescriptionRecord | null = null;
    dbState.prescriptions = dbState.prescriptions.map((rx) => {
      if (rx.id === id) {
        const nextRx: PrescriptionRecord = { ...rx, ...body, id };
        updatedRx = nextRx;
        return nextRx;
      }
      return rx;
    });
    saveLocalDb(dbState);
    return updatedRx as unknown as T;
  }
  if (rxMatch && method === 'DELETE') {
    const id = Number(rxMatch[1]);
    dbState.prescriptions = dbState.prescriptions.filter((rx) => rx.id !== id);
    saveLocalDb(dbState);
    return { deletedId: id } as unknown as T;
  }

  // 18. Drug Interactions: POST /api/interactions/check & POST /api/interactions
  if (pathname === '/api/interactions/check' && method === 'POST') {
    const items = (Array.isArray(body.items) ? body.items : []) as CandidateDrugInput[];
    const alerts = detectDrugInteractions(items, [], dbState.drugInteractions);
    return {
      totalCheckedDrugs: items.length,
      totalInteractions: alerts.length,
      hasMajorOrContraindicated: alerts.some((a) => a.severity === 'Major'),
      alerts,
    } as unknown as T;
  }
  if (pathname === '/api/interactions' && method === 'POST') {
    const created: DrugInteractionRule = {
      id: nextId(dbState.drugInteractions),
      drugAKeyword: String(body.drugAKeyword || '').trim(),
      drugBKeyword: String(body.drugBKeyword || '').trim(),
      severity: body.severity || 'Moderate',
      mechanism: String(body.mechanism || '').trim(),
      clinicalEffect: String(body.clinicalEffect || '').trim(),
      managementAdvice: String(body.managementAdvice || '').trim(),
      evidenceLevel: body.evidenceLevel || 'Established',
      literature:
        String(body.literature || '').trim() ||
        "Stockley's Drug Interactions Ed. 13; Lexicomp Clinical Drug Information",
    };
    dbState.drugInteractions.unshift(created);
    saveLocalDb(dbState);
    return created as unknown as T;
  }

  // 19. Backup Export & Restore
  if (pathname === '/api/backup/export' && method === 'GET') {
    return {
      schemaVersion: '1.0.0',
      application: 'ApotekSu - Clinical & Retail Pharmacy (Enterprise Edition)',
      exportedAt: new Date().toISOString(),
      data: dbState,
    } as unknown as T;
  }
  if (pathname === '/api/backup/restore' && method === 'POST') {
    const payload = body.data;
    if (payload && Array.isArray(payload.medicines)) {
      saveLocalDb({
        ...dbState,
        ...payload,
      });
    }
    return {
      ok: true,
      restoredCategories: payload?.categories?.length || 0,
      restoredInteractions: payload?.drugInteractions?.length || 0,
      message: 'Snapshot JSON divalidasi dan disinkronkan ke database lokal aktif.',
    } as unknown as T;
  }

  throw new Error(`Endpoint lokal tidak ditemukan: ${method} ${pathname}`);
}
