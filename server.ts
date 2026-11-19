import express from 'express';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import { signEmployeeToken } from './src/lib/employeeAuth.ts';
import { verifyExternalClientLicense } from './src/lib/externalLicense.ts';
import { checkpointEmbeddedDb, ensureDatabaseReady } from './src/db/index.ts';
import {
  authenticateEmployeeLogin,
  checkAutomatedInteractions,
  createCategory,
  createClinicalRecord,
  createDrugInteractionRule,
  createGoodsReceiptBatch,
  createPatient,
  createPosTransaction,
  createPurchaseOrderDraft,
  createRxBundle,
  createSwamedikasiLog,
  exportFullDatabaseSnapshot,
  getBootstrapData,
  lookupEmployeesByNameKeyword,
  processPurchaseOrder,
  recordReceivablePayment,
  recordStockOpname,
  removeCategory,
  removeEmployee,
  removeMedicine,
  removePatient,
  removePosTransaction,
  removePrescription,
  removePurchaseOrder,
  removeSupplier,
  updateClinicalRecordStatus,
  updatePatient,
  updatePosTransaction,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
  upsertEmployee,
  upsertMedicine,
  upsertPrescription,
  upsertSupplier,
} from './src/db/repository.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

app.use('/api', async (req, res, next) => {
  try {
    await ensureDatabaseReady();
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      res.on('finish', () => {
        if (res.statusCode < 400) {
          void checkpointEmbeddedDb();
        }
      });
    }
    next();
  } catch (error) {
    console.error('Database initialization failed:', error);
    res.status(500).json({ error: 'Layanan basis data sedang tidak tersedia. Silakan coba lagi.' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ApotekSu - Clinical & Retail Pharmacy Operational API' });
});

// External License Verification Connector (connects to separate Portal Lisensi URL via LICENSE_PORTAL_API_URL, LICENSE_PORTAL_API_KEY, LICENSE_CLIENT_EMAIL)
app.get('/api/license/status', requireAuth, async (req, res) => {
  const forceRefresh = req.query.refresh === '1';
  const license = await verifyExternalClientLicense({ forceRefresh });
  res.json(license);
});

app.get('/api/license/external-status', requireAuth, async (req, res) => {
  const forceRefresh = req.query.refresh === '1';
  const license = await verifyExternalClientLicense({ forceRefresh });
  res.json(license);
});

app.post('/api/license/verify-now', requireAuth, async (_req, res) => {
  const license = await verifyExternalClientLicense({ forceRefresh: true });
  res.json(license);
});

app.get('/api/bootstrap', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [data, license] = await Promise.all([
      getBootstrapData(),
      verifyExternalClientLicense(),
    ]);
    res.json({
      user: {
        uid: req.user?.uid,
        email: req.user?.email,
        name: req.user?.name || 'Apoteker Latisha',
        role: req.user?.role || 'apoteker',
        nip: req.user?.nip,
        jobTitle: req.user?.jobTitle,
      },
      license,
      ...data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memuat data awal.';
    res.status(500).json({ error: message });
  }
});

// Public Employee Name Detection (returns matching active full names only, never ID Karyawan)
app.get('/api/public/employee-lookup', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (q.trim().length < 2) {
      return res.json([]);
    }
    const matches = await lookupEmployeesByNameKeyword(q);
    res.json(matches);
  } catch (error: unknown) {
    console.error('Error in /api/public/employee-lookup:', error);
    res.json([]);
  }
});

// Public Employee Login (Nama Karyawan & ID Karyawan verified against employees table + external license check if configured)
app.post('/api/public/employee-login', async (req, res) => {
  try {
    const { name, nip } = req.body || {};
    if (!name?.trim() || !nip?.trim()) {
      return res.status(400).json({ error: 'Nama karyawan dan ID Karyawan wajib diisi.' });
    }
    const authResult = await authenticateEmployeeLogin(String(name), String(nip));
    if (!authResult.ok) {
      return res.status(authResult.statusCode).json({ error: authResult.error });
    }

    const license = await verifyExternalClientLicense();
    if (license.configured && license.reachable && !license.allowed) {
      return res.status(403).json({
        error: license.message || 'Lisensi langganan ApotekSu sedang tidak aktif. Hubungi pengelola platform.',
      });
    }

    const { employee, appRole } = authResult;
    const email = employee.email || `${employee.nip.toLowerCase()}@latishafarma.id`;
    const token = signEmployeeToken({
      uid: `emp-${employee.id}`,
      employeeId: employee.id,
      nip: employee.nip,
      name: employee.name,
      email,
      jobTitle: employee.role,
      role: appRole,
    });
    res.json({
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
      license,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal masuk dengan akun karyawan.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/categories', requireAuth, async (req, res) => {
  try {
    const { name, description } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
    }
    const created = await createCategory(name, description || '');
    res.status(201).json(created);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal membuat kategori.';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/categories/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID kategori tidak valid.' });
    }
    const result = await removeCategory(id);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menghapus kategori.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/medicines', requireAuth, async (req, res) => {
  try {
    const created = await upsertMedicine(null, req.body);
    res.status(201).json(created);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menambah obat.';
    res.status(500).json({ error: message });
  }
});

app.put('/api/medicines/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID obat tidak valid.' });
    }
    const updated = await upsertMedicine(id, req.body);
    res.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memperbarui obat.';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/medicines/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID obat tidak valid.' });
    }
    const result = await removeMedicine(id);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menghapus obat.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/patients', requireAuth, async (req, res) => {
  try {
    const created = await createPatient(req.body);
    res.status(201).json(created);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menambah pasien.';
    res.status(500).json({ error: message });
  }
});

app.put('/api/patients/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID pasien tidak valid.' });
    }
    const updated = await updatePatient(id, req.body);
    res.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memperbarui pasien.';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/patients/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID pasien tidak valid.' });
    }
    const result = await removePatient(id);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menghapus pasien.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/suppliers', requireAuth, async (req, res) => {
  try {
    const created = await upsertSupplier(null, req.body);
    res.status(201).json(created);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menambah supplier.';
    res.status(500).json({ error: message });
  }
});

app.put('/api/suppliers/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID supplier tidak valid.' });
    }
    const updated = await upsertSupplier(id, req.body);
    res.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memperbarui supplier.';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/suppliers/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID supplier tidak valid.' });
    }
    const result = await removeSupplier(id);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menghapus supplier.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/employees', requireAuth, async (req, res) => {
  try {
    const created = await upsertEmployee(null, req.body);
    res.status(201).json(created);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menambah karyawan.';
    res.status(500).json({ error: message });
  }
});

app.put('/api/employees/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID karyawan tidak valid.' });
    }
    const updated = await upsertEmployee(id, req.body);
    res.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memperbarui karyawan.';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/employees/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID karyawan tidak valid.' });
    }
    const result = await removeEmployee(id);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menghapus karyawan.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/inventory/batches', requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    if (!body.medicineId || !body.batchNumber || !body.expiryDate) {
      return res.status(400).json({ error: 'Obat, nomor batch, dan tanggal kedaluwarsa wajib diisi.' });
    }
    const result = await createGoodsReceiptBatch({
      ...body,
      auditorName: body.auditorName || req.user?.name || 'Apt. Latisha',
    });
    res.status(201).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal mencatat barang masuk batch.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/inventory/opname', requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    if (!body.batchId || body.physicalQty === undefined) {
      return res.status(400).json({ error: 'Batch dan stok fisik aktual wajib diisi.' });
    }
    const result = await recordStockOpname({
      ...body,
      auditorName: body.auditorName || req.user?.name || 'Apt. Latisha',
    });
    res.status(201).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menyimpan hasil stock opname.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/inventory/purchase-orders', requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ error: 'Daftar item Purchase Order tidak boleh kosong.' });
    }
    const created = await createPurchaseOrderDraft({
      ...body,
      createdBy: body.createdBy || req.user?.name || 'Apt. Latisha',
    });
    res.status(201).json(created);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal membuat draf Purchase Order.';
    res.status(500).json({ error: message });
  }
});

app.patch('/api/inventory/purchase-orders/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (!Number.isFinite(id) || !status) {
      return res.status(400).json({ error: 'ID dan status PO tidak valid.' });
    }
    const updated = await updatePurchaseOrderStatus(id, status);
    res.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memperbarui status PO.';
    res.status(500).json({ error: message });
  }
});

app.put('/api/inventory/purchase-orders/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};
    if (!Number.isFinite(id) || !Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ error: 'ID atau daftar item pembelian tidak valid.' });
    }
    const result = await updatePurchaseOrder(id, body);
    if (!result.ok) {
      return res.status(result.statusCode).json({ error: result.error });
    }
    res.json(result.data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memperbarui pembelian.';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/inventory/purchase-orders/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID pembelian tidak valid.' });
    }
    const result = await removePurchaseOrder(id);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menghapus pembelian.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/inventory/purchase-orders/:id/process', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID pembelian tidak valid.' });
    }
    const result = await processPurchaseOrder(id, req.user?.name || 'Apt. Latisha');
    if (!result.ok) {
      return res.status(result.statusCode).json({ error: result.error });
    }
    res.json(result.data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memproses pembelian.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/transactions', requireAuth, async (req, res) => {
  try {
    const created = await createPosTransaction({
      ...req.body,
      allowNegativeStock: Boolean(req.body?.allowNegativeStock),
    });
    res.status(201).json(created);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menyimpan transaksi POS.';
    res.status(500).json({ error: message });
  }
});

app.put('/api/transactions/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID transaksi penjualan tidak valid.' });
    }
    const updated = await updatePosTransaction(id, {
      ...req.body,
      allowNegativeStock: Boolean(req.body?.allowNegativeStock),
    });
    res.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memperbarui transaksi penjualan.';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/transactions/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID transaksi penjualan tidak valid.' });
    }
    const result = await removePosTransaction(id);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menghapus transaksi penjualan.';
    res.status(500).json({ error: message });
  }
});

app.patch('/api/transactions/:id/payment', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const amount = Number(req.body?.amount ?? 0);
    if (!Number.isFinite(id) || amount <= 0) {
      return res.status(400).json({ error: 'Nominal pelunasan tidak valid.' });
    }
    const updated = await recordReceivablePayment(id, amount);
    res.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal mencatat pembayaran piutang.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/clinical-records', requireAuth, async (req, res) => {
  try {
    const created = await createClinicalRecord(req.body);
    res.status(201).json(created);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menyimpan catatan SOAP.';
    res.status(500).json({ error: message });
  }
});

app.patch('/api/clinical-records/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, adherenceScore, ePrescriptionItems } = req.body || {};
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID catatan klinis tidak valid.' });
    }
    const updated = await updateClinicalRecordStatus(
      id,
      status || 'Selesai',
      Number(adherenceScore ?? 100),
      ePrescriptionItems
    );
    res.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memperbarui catatan klinis.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/swamedikasi', requireAuth, async (req, res) => {
  try {
    const created = await createSwamedikasiLog(req.body);
    res.status(201).json(created);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menyimpan swamedikasi.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/bundles', requireAuth, async (req, res) => {
  try {
    const created = await createRxBundle(req.body);
    res.status(201).json(created);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal membuat paket resep.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/prescriptions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    if (!body.patientName || !Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ error: 'Nama pasien dan minimal satu item obat resep wajib diisi.' });
    }
    const created = await upsertPrescription(null, {
      ...body,
      pharmacistName: body.pharmacistName || req.user?.name || 'Apt. Latisha Rahma, S.Farm',
    });
    res.status(201).json(created);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menyimpan resep.';
    res.status(500).json({ error: message });
  }
});

app.put('/api/prescriptions/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID resep tidak valid.' });
    }
    const body = req.body || {};
    if (!body.patientName || !Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ error: 'Nama pasien dan minimal satu item obat resep wajib diisi.' });
    }
    const updated = await upsertPrescription(id, {
      ...body,
      pharmacistName: body.pharmacistName || req.user?.name || 'Apt. Latisha Rahma, S.Farm',
    });
    res.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memperbarui resep.';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/prescriptions/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID resep tidak valid.' });
    }
    const result = await removePrescription(id);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menghapus resep.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/interactions/check', requireAuth, async (req, res) => {
  try {
    const { items = [], patientId = null } = req.body || {};
    const result = await checkAutomatedInteractions(items, patientId);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memeriksa interaksi obat.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/interactions', requireAuth, async (req, res) => {
  try {
    const created = await createDrugInteractionRule(req.body);
    res.status(201).json(created);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menambah aturan interaksi.';
    res.status(500).json({ error: message });
  }
});

app.get('/api/backup/export', requireAuth, async (_req, res) => {
  try {
    const snapshot = await exportFullDatabaseSnapshot();
    res.json(snapshot);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal mengekspor backup.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/backup/restore', requireAuth, async (req, res) => {
  try {
    const payload = req.body?.data;
    if (!payload || !Array.isArray(payload.medicines)) {
      return res.status(400).json({ error: 'Format file JSON backup tidak valid.' });
    }
    let restoredCategories = 0;
    let restoredInteractions = 0;
    if (Array.isArray(payload.categories)) {
      for (const cat of payload.categories) {
        if (cat?.name) {
          try {
            await createCategory(cat.name, cat.description || '');
            restoredCategories++;
          } catch {
            // ignore duplicate category
          }
        }
      }
    }
    if (Array.isArray(payload.drugInteractions)) {
      for (const rule of payload.drugInteractions) {
        if (rule?.drugAKeyword && rule?.drugBKeyword) {
          try {
            await createDrugInteractionRule({
              drugAKeyword: rule.drugAKeyword,
              drugBKeyword: rule.drugBKeyword,
              severity: rule.severity || 'Moderate',
              mechanism: rule.mechanism || '-',
              clinicalEffect: rule.clinicalEffect || '-',
              managementAdvice: rule.managementAdvice || '-',
              evidenceLevel: rule.evidenceLevel || 'Probable',
            });
            restoredInteractions++;
          } catch {
            // ignore errors
          }
        }
      }
    }
    res.json({
      ok: true,
      restoredCategories,
      restoredInteractions,
      message: 'Snapshot JSON divalidasi dan disinkronkan ke database aktif.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal merestore snapshot.';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) {
        return next();
      }
      try {
        const htmlPath = path.resolve(__dirname, 'index.html');
        let template = fs.readFileSync(htmlPath, 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        next(e);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ApotekSu server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
