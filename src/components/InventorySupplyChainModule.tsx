import { useMemo, useState } from 'react';
import { apiRequest } from '../lib/apiClient';
import { formatDateID, formatIDR, getBaseHpp } from '../lib/formatters';
import type {
  Medicine,
  ObatBatch,
  PurchaseOrder,
  PurchaseOrderItem,
  StockAuditLog,
  Supplier,
} from '../types/pharmacy';

interface InventorySupplyChainModuleProps {
  medicines: Medicine[];
  suppliers: Supplier[];
  batches: ObatBatch[];
  stockAuditLogs: StockAuditLog[];
  purchaseOrders: PurchaseOrder[];
  pharmacistName: string;
  onGoodsReceiptRecorded: (res: {
    batch: ObatBatch;
    medicine: Medicine;
    auditLog: StockAuditLog;
  }) => void;
  onStockOpnameRecorded: (res: {
    batch: ObatBatch;
    medicine: Medicine;
    auditLog: StockAuditLog;
  }) => void;
  onPurchaseOrderCreated: (po: PurchaseOrder) => void;
  onPurchaseOrderUpdated: (po: PurchaseOrder) => void;
}

const TODAY_ISO = new Date().toISOString().slice(0, 10);

function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00`);
  const now = new Date(`${TODAY_ISO}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 9999;
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function InventorySupplyChainModule({
  medicines,
  suppliers,
  batches,
  stockAuditLogs,
  purchaseOrders,
  pharmacistName,
  onGoodsReceiptRecorded,
  onStockOpnameRecorded,
  onPurchaseOrderCreated,
  onPurchaseOrderUpdated,
}: InventorySupplyChainModuleProps) {
  const [activeTab, setActiveTab] = useState<'batches' | 'alerts' | 'opname'>('batches');
  const [searchQuery, setSearchQuery] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<'Semua' | 'SegeraED' | 'Aman' | 'Habis'>('Semua');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Goods Receipt Modal State
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptForm, setReceiptForm] = useState({
    medicineId: medicines[0]?.id ?? 0,
    supplierId: suppliers[0]?.id ?? 0,
    batchNumber: `BTH-${new Date().getFullYear().toString().slice(-2)}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(100 + Math.random() * 899)}`,
    expiryDate: '2028-06-30',
    qtyReceived: 100,
    rackLocation: 'Rak A-1',
    hppUnit: medicines[0] ? getBaseHpp(medicines[0]) : 0,
    receivedDate: TODAY_ISO,
    notes: '',
  });

  // FEFO Simulator State
  const [simMedId, setSimMedId] = useState<number>(medicines[0]?.id ?? 0);
  const [simRequestQty, setSimRequestQty] = useState<number>(180);

  // Auto-Reorder PO Draft Builder State
  const lowStockMedicines = useMemo(
    () => medicines.filter((m) => m.stockBase <= m.minStockBase),
    [medicines]
  );
  const [poSupplierId, setPoSupplierId] = useState<number>(suppliers[0]?.id ?? 0);
  const [poNotes, setPoNotes] = useState('Pengadaan restock otomatis item di bawah batas minimum');
  const [poOrderQtys, setPoOrderQtys] = useState<Record<number, number>>({});
  const [selectedPoPreview, setSelectedPoPreview] = useState<PurchaseOrder | null>(null);

  // Stock Opname Form State
  const [opnameBatchId, setOpnameBatchId] = useState<number>(batches[0]?.id ?? 0);
  const selectedOpnameBatch = useMemo(
    () => batches.find((b) => b.id === opnameBatchId) ?? batches[0] ?? null,
    [batches, opnameBatchId]
  );
  const [opnamePhysicalQty, setOpnamePhysicalQty] = useState<number>(
    batches[0]?.qtyRemaining ?? 0
  );
  const [opnameReason, setOpnameReason] = useState<string>('Koreksi Opname');
  const [opnameNotes, setOpnameNotes] = useState<string>('');

  // Sorted FEFO batches & priority map (earliest active batch per medicine)
  const fefoBatches = useMemo(() => {
    return [...batches].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.id - b.id);
  }, [batches]);

  const firstActiveBatchIdByMed = useMemo(() => {
    const map = new Map<number, number>();
    for (const b of fefoBatches) {
      if (b.qtyRemaining > 0 && !map.has(b.medicineId)) {
        map.set(b.medicineId, b.id);
      }
    }
    return map;
  }, [fefoBatches]);

  const nearExpiryBatches = useMemo(() => {
    return fefoBatches.filter((b) => {
      if (b.qtyRemaining <= 0) return false;
      const days = daysUntil(b.expiryDate);
      return days <= 180; // <= 6 bulan
    });
  }, [fefoBatches]);

  const totalInventoryValuation = useMemo(() => {
    return fefoBatches.reduce((sum, b) => sum + b.qtyRemaining * b.hppUnit, 0);
  }, [fefoBatches]);

  const filteredBatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return fefoBatches.filter((b) => {
      const days = daysUntil(b.expiryDate);
      if (expiryFilter === 'SegeraED' && (b.qtyRemaining <= 0 || days > 180)) return false;
      if (expiryFilter === 'Aman' && (b.qtyRemaining <= 0 || days <= 180)) return false;
      if (expiryFilter === 'Habis' && b.qtyRemaining > 0) return false;
      if (!q) return true;
      return (
        b.medicineName.toLowerCase().includes(q) ||
        b.medicineSku.toLowerCase().includes(q) ||
        b.batchNumber.toLowerCase().includes(q) ||
        b.rackLocation.toLowerCase().includes(q) ||
        b.supplierName.toLowerCase().includes(q)
      );
    });
  }, [fefoBatches, searchQuery, expiryFilter]);

  // FEFO Allocation Preview for selected medicine & qty
  const fefoAllocationPreview = useMemo(() => {
    const active = fefoBatches.filter((b) => b.medicineId === simMedId && b.qtyRemaining > 0);
    let remainingNeed = Math.max(0, simRequestQty);
    const plan: { batch: ObatBatch; take: number }[] = [];
    for (const b of active) {
      if (remainingNeed <= 0) break;
      const take = Math.min(b.qtyRemaining, remainingNeed);
      plan.push({ batch: b, take });
      remainingNeed -= take;
    }
    return { plan, shortfall: remainingNeed };
  }, [fefoBatches, simMedId, simRequestQty]);

  // Auto-reorder PO items computed from lowStockMedicines + user edits
  const draftPoItems: PurchaseOrderItem[] = useMemo(() => {
    return lowStockMedicines.map((m) => {
      const suggestedQty = Math.max(10, m.minStockBase * 3 - m.stockBase);
      const orderQtyBase = poOrderQtys[m.id] ?? suggestedQty;
      const baseHpp = getBaseHpp(m);
      return {
        medicineId: m.id,
        sku: m.sku,
        medicineName: m.name,
        currentStock: m.stockBase,
        minStock: m.minStockBase,
        orderQtyBase,
        estimatedHpp: baseHpp,
        lineTotal: orderQtyBase * baseHpp,
      };
    });
  }, [lowStockMedicines, poOrderQtys]);

  const handleOpenReceiptModal = () => {
    const defaultMed = medicines[0];
    const defaultSup = suppliers[0];
    setReceiptForm({
      medicineId: defaultMed?.id ?? 0,
      supplierId: defaultSup?.id ?? 0,
      batchNumber: `BTH-${new Date().getFullYear().toString().slice(-2)}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(100 + Math.random() * 899)}`,
      expiryDate: '2028-06-30',
      qtyReceived: 100,
      rackLocation: 'Rak A-1',
      hppUnit: defaultMed ? getBaseHpp(defaultMed) : 0,
      receivedDate: TODAY_ISO,
      notes: '',
    });
    setShowReceiptModal(true);
  };

  const handleSubmitGoodsReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const supplier = suppliers.find((s) => s.id === receiptForm.supplierId);
      const res = await apiRequest<{
        batch: ObatBatch;
        medicine: Medicine;
        auditLog: StockAuditLog;
      }>('/api/inventory/batches', {
        method: 'POST',
        body: JSON.stringify({
          medicineId: receiptForm.medicineId,
          supplierId: supplier?.id ?? null,
          supplierName: supplier?.name ?? 'PBF Resmi',
          batchNumber: receiptForm.batchNumber,
          expiryDate: receiptForm.expiryDate,
          qtyReceived: receiptForm.qtyReceived,
          rackLocation: receiptForm.rackLocation,
          hppUnit: receiptForm.hppUnit,
          receivedDate: receiptForm.receivedDate,
          notes: receiptForm.notes,
          auditorName: pharmacistName,
        }),
      });
      onGoodsReceiptRecorded(res);
      setShowReceiptModal(false);
      setSuccessMsg(
        `Batch ${res.batch.batchNumber} (${res.batch.medicineName}) berhasil diterima & tercatat dalam log audit.`
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan penerimaan batch.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAutoPo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draftPoItems.length === 0) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const supplier = suppliers.find((s) => s.id === poSupplierId) ?? suppliers[0];
      const created = await apiRequest<PurchaseOrder>('/api/inventory/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: supplier?.id ?? null,
          supplierName: supplier?.name ?? 'PBF Resmi',
          items: draftPoItems.filter((i) => i.orderQtyBase > 0),
          createdBy: pharmacistName,
          orderDate: TODAY_ISO,
          notes: poNotes,
        }),
      });
      onPurchaseOrderCreated(created);
      setSuccessMsg(`Draf PO ${created.poNumber} berhasil dibuat untuk ${created.supplierName}.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat draf PO.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePoStatus = async (poId: number, status: string) => {
    setErrorMsg(null);
    try {
      const updated = await apiRequest<PurchaseOrder>(`/api/inventory/purchase-orders/${poId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      onPurchaseOrderUpdated(updated);
      setSuccessMsg(`Status PO ${updated.poNumber} diperbarui menjadi "${updated.status}".`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui status PO.');
    }
  };

  const handleSubmitOpname = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpnameBatch) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await apiRequest<{
        batch: ObatBatch;
        medicine: Medicine;
        auditLog: StockAuditLog;
      }>('/api/inventory/opname', {
        method: 'POST',
        body: JSON.stringify({
          batchId: selectedOpnameBatch.id,
          physicalQty: opnamePhysicalQty,
          reason: opnameReason,
          notes: opnameNotes,
          auditorName: pharmacistName,
          auditDate: TODAY_ISO,
        }),
      });
      onStockOpnameRecorded(res);
      setOpnameNotes('');
      setSuccessMsg(
        `Opname batch ${res.batch.batchNumber} tersimpan (Selisih: ${res.auditLog.variance > 0 ? `+${res.auditLog.variance}` : res.auditLog.variance}).`
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan hasil stock opname.');
    } finally {
      setSaving(false);
    }
  };

  const opnameVariance = selectedOpnameBatch
    ? opnamePhysicalQty - selectedOpnameBatch.qtyRemaining
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-red-100 dark:border-slate-800">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <i className="fa-solid fa-boxes-stacked text-red-700" aria-hidden="true" />
            <span>Manajemen Stok &amp; Rantai Pasok Lanjutan</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Pelacakan Batch &amp; FEFO otomatis · Peringatan stok minimum &amp; ED &lt; 6 bulan · Auto-Reorder PO · Audit Stock Opname
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenReceiptModal}
            className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <i className="fa-solid fa-truck-ramp-box" aria-hidden="true" />
            <span>Barang Masuk (Goods Receipt)</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Batch Aktif (FEFO)</span>
            <i className="fa-solid fa-layer-group text-red-600" aria-hidden="true" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {fefoBatches.filter((b) => b.qtyRemaining > 0).length} Batch
          </div>
          <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
            Nilai HPP: {formatIDR(totalInventoryValuation)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-400 font-medium">
            <span>Mendekati ED (&le; 6 Bulan)</span>
            <i className="fa-solid fa-hourglass-half text-amber-600" aria-hidden="true" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
            {nearExpiryBatches.length} Batch
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Prioritas pengeluaran FEFO &amp; retur PBF
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-rose-700 dark:text-rose-400 font-medium">
            <span>Stok Di Bawah Minimum</span>
            <i className="fa-solid fa-triangle-exclamation text-rose-600" aria-hidden="true" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-rose-700 dark:text-rose-400 tabular-nums">
            {lowStockMedicines.length} Item
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Siap diproses ke Draf Purchase Order
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Log Audit &amp; Opname</span>
            <i className="fa-solid fa-clipboard-check text-red-600" aria-hidden="true" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {stockAuditLogs.length} Catatan
          </div>
          <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
            {purchaseOrders.length} Purchase Order tersimpan
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 border border-red-100 dark:border-slate-800 rounded-xl p-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('batches')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'batches'
              ? 'bg-red-700 text-white'
              : 'text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-slate-800'
          }`}
        >
          <i className="fa-solid fa-barcode" aria-hidden="true" />
          <span>Batch Tracking &amp; FEFO ({fefoBatches.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('alerts')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'alerts'
              ? 'bg-red-700 text-white'
              : 'text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-slate-800'
          }`}
        >
          <i className="fa-solid fa-bell" aria-hidden="true" />
          <span>
            Alert Stok &amp; Auto-Reorder PO ({lowStockMedicines.length + nearExpiryBatches.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('opname')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'opname'
              ? 'bg-red-700 text-white'
              : 'text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-slate-800'
          }`}
        >
          <i className="fa-solid fa-scale-balanced" aria-hidden="true" />
          <span>Stock Opname &amp; Audit Selisih ({stockAuditLogs.length})</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs flex justify-between items-center">
          <span>
            <i className="fa-solid fa-circle-exclamation mr-2" aria-hidden="true" />
            {errorMsg}
          </span>
          <button type="button" onClick={() => setErrorMsg(null)} className="cursor-pointer font-semibold">
            Tutup
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex justify-between items-center">
          <span>
            <i className="fa-solid fa-circle-check mr-2" aria-hidden="true" />
            {successMsg}
          </span>
          <button type="button" onClick={() => setSuccessMsg(null)} className="cursor-pointer font-semibold">
            Tutup
          </button>
        </div>
      )}

      {/* ==================== TAB 1: BATCH TRACKING & FEFO ==================== */}
      {activeTab === 'batches' && (
        <div className="space-y-5">
          {/* Search & Filter + FEFO Simulator */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-red-100 dark:border-slate-800 rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Filter Inventaris Batch &amp; Lokasi Rak (Diurutkan FEFO)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-7 relative">
                  <i
                    className="fa-solid fa-magnifying-glass text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 text-xs"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari No. Batch, nama obat, SKU, rak, atau PBF..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-5">
                  <select
                    value={expiryFilter}
                    onChange={(e) =>
                      setExpiryFilter(e.target.value as 'Semua' | 'SegeraED' | 'Aman' | 'Habis')
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <option value="Semua">Semua Status Kedaluwarsa</option>
                    <option value="SegeraED">Waspada ED (&le; 6 Bulan)</option>
                    <option value="Aman">Stok Aman (&gt; 6 Bulan)</option>
                    <option value="Habis">Batch Kosong (0 Qty)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Simulasi Prioritas Pengeluaran FEFO */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-red-100 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-red-700 dark:text-red-400">
                <span>
                  <i className="fa-solid fa-arrow-down-short-wide mr-1.5" aria-hidden="true" />
                  Simulasi Pemotongan FEFO Otomatis
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={simMedId}
                  onChange={(e) => setSimMedId(Number(e.target.value))}
                  className="col-span-2 px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.stockBase} {m.unitBase})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={simRequestQty}
                  onChange={(e) => setSimRequestQty(Math.max(1, Number(e.target.value) || 1))}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                  aria-label="Jumlah pengeluaran FEFO"
                />
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                {fefoAllocationPreview.plan.length === 0 ? (
                  <span className="text-rose-600">Tidak ada batch aktif untuk obat ini.</span>
                ) : (
                  fefoAllocationPreview.plan.map((p, idx) => (
                    <div key={p.batch.id} className="flex justify-between tabular-nums">
                      <span>
                        Urutan #{idx + 1}: <strong className="font-mono">{p.batch.batchNumber}</strong> (ED{' '}
                        {formatDateID(p.batch.expiryDate)})
                      </span>
                      <span className="font-semibold text-red-700 dark:text-red-400">
                        Ambil {p.take} pcs
                      </span>
                    </div>
                  ))
                )}
                {fefoAllocationPreview.shortfall > 0 && (
                  <div className="text-rose-600 font-medium tabular-nums">
                    Kekurangan stok: {fefoAllocationPreview.shortfall} pcs
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Batch Table */}
          <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500">
                    <th className="py-3 px-4 font-semibold">No. Batch &amp; Urutan FEFO</th>
                    <th className="py-3 px-4 font-semibold">Produk Obat &amp; SKU</th>
                    <th className="py-3 px-4 font-semibold">Kedaluwarsa (ED)</th>
                    <th className="py-3 px-4 font-semibold text-right">Stok Sisa / Masuk</th>
                    <th className="py-3 px-4 font-semibold">Lokasi Rak</th>
                    <th className="py-3 px-4 font-semibold">Supplier PBF</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi Cepat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredBatches.map((b) => {
                    const days = daysUntil(b.expiryDate);
                    const isFirstFefo = firstActiveBatchIdByMed.get(b.medicineId) === b.id;
                    const isCriticalEd = b.qtyRemaining > 0 && days <= 60;
                    const isWarningEd = b.qtyRemaining > 0 && days > 60 && days <= 180;
                    return (
                      <tr key={b.id} className="hover:bg-red-50/30 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="font-mono font-semibold text-slate-900 dark:text-white">
                            {b.batchNumber}
                          </div>
                          <div className="text-[11px] mt-0.5">
                            {isFirstFefo ? (
                              <span className="text-red-700 dark:text-red-400 font-semibold">
                                Prioritas #1 FEFO
                              </span>
                            ) : b.qtyRemaining === 0 ? (
                              <span className="text-slate-400">Batch Terpakai Habis</span>
                            ) : (
                              <span className="text-slate-500">Antrean Cadangan</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {b.medicineName}
                          </div>
                          <div className="text-slate-400 font-mono">{b.medicineSku}</div>
                        </td>
                        <td className="py-3 px-4 tabular-nums">
                          <div
                            className={`font-semibold ${
                              isCriticalEd
                                ? 'text-rose-700 dark:text-rose-400'
                                : isWarningEd
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {formatDateID(b.expiryDate)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {days <= 0
                              ? 'Sudah Kedaluwarsa'
                              : `${days} hari lagi (${Math.floor(days / 30)} bln)`}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {b.qtyRemaining.toLocaleString('id-ID')}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            dari {b.qtyReceived.toLocaleString('id-ID')} masuk
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                          {b.rackLocation}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-800 dark:text-slate-200">{b.supplierName}</div>
                          <div className="text-[11px] text-slate-400 tabular-nums">
                            Masuk: {formatDateID(b.receivedDate)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setOpnameBatchId(b.id);
                              setOpnamePhysicalQty(b.qtyRemaining);
                              setActiveTab('opname');
                            }}
                            className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-slate-800 text-red-700 dark:text-red-400 font-medium cursor-pointer whitespace-nowrap"
                          >
                            Opname
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredBatches.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Tidak ada data batch yang sesuai dengan pencarian.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: STOCK ALERTS & AUTO-REORDER PO ==================== */}
      {activeTab === 'alerts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Low Stock Alert Panel */}
            <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm text-rose-700 dark:text-rose-400 flex items-center gap-2">
                  <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                  <span>Peringatan Stok Minimum (Low Stock Warning)</span>
                </h3>
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 tabular-nums">
                  {lowStockMedicines.length} Item Kritis
                </span>
              </div>

              <div className="divide-y divide-rose-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                {lowStockMedicines.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    Semua stok obat berada di atas batas minimum aman.
                  </p>
                ) : (
                  lowStockMedicines.map((m) => (
                    <div key={m.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{m.name}</div>
                        <div className="text-slate-500 tabular-nums">
                          SKU {m.sku} · Batas min: {m.minStockBase} {m.unitBase}
                        </div>
                      </div>
                      <div className="text-right tabular-nums shrink-0">
                        <div className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-bold">
                          Sisa {m.stockBase} {m.unitBase}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Saran Order: {Math.max(10, m.minStockBase * 3 - m.stockBase)} {m.unitBase}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Approaching Expiry Panel (< 6 months) */}
            <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
                  <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
                  <span>Peringatan Dini Kedaluwarsa (&le; 6 Bulan)</span>
                </h3>
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                  {nearExpiryBatches.length} Batch
                </span>
              </div>

              <div className="divide-y divide-amber-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                {nearExpiryBatches.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    Tidak ada batch yang akan kedaluwarsa dalam 6 bulan ke depan.
                  </p>
                ) : (
                  nearExpiryBatches.map((b) => {
                    const days = daysUntil(b.expiryDate);
                    const critical = days <= 60;
                    return (
                      <div key={b.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {b.medicineName}
                          </div>
                          <div className="text-slate-500 font-mono">
                            Batch {b.batchNumber} · {b.rackLocation}
                          </div>
                        </div>
                        <div className="text-right tabular-nums shrink-0">
                          <div
                            className={`px-2 py-0.5 rounded font-bold ${
                              critical
                                ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                                : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            ED {formatDateID(b.expiryDate)} ({days} hr)
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Sisa {b.qtyRemaining} unit · {b.supplierName}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Auto-Reorder Draft PO Generator */}
          <form
            onSubmit={handleCreateAutoPo}
            className="bg-white dark:bg-slate-900 border border-red-100 dark:border-slate-800 rounded-xl p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <i className="fa-solid fa-file-invoice text-red-700" aria-hidden="true" />
                  <span>Draf Otomatis Purchase Order (Auto-Reorder PBF)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Menghitung otomatis kebutuhan stok (target 3× stok minimum) untuk dikirim ke PBF
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={poSupplierId}
                  onChange={(e) => setPoSupplierId(Number(e.target.value))}
                  className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.paymentTerms})
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={saving || draftPoItems.length === 0}
                  className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <i className="fa-solid fa-paper-plane mr-1.5" aria-hidden="true" />
                  {saving ? 'Menyimpan...' : 'Buat Draf PO ke Supplier'}
                </button>
              </div>
            </div>

            {draftPoItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                Belum ada obat di bawah stok minimum untuk dibuatkan PO otomatis.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <th className="py-2 px-3 font-semibold">Obat &amp; SKU</th>
                        <th className="py-2 px-3 font-semibold text-right">Stok Saat Ini</th>
                        <th className="py-2 px-3 font-semibold text-right">Stok Min</th>
                        <th className="py-2 px-3 font-semibold text-right">Qty Pesan (Satuan Dasar)</th>
                        <th className="py-2 px-3 font-semibold text-right">Est. HPP/Unit</th>
                        <th className="py-2 px-3 font-semibold text-right">Subtotal PO</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {draftPoItems.map((item) => (
                        <tr key={item.medicineId}>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {item.medicineName}
                            </div>
                            <div className="text-slate-400 font-mono">{item.sku}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-rose-600 font-semibold">
                            {item.currentStock}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-slate-500">
                            {item.minStock}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              min={0}
                              value={item.orderQtyBase}
                              onChange={(e) =>
                                setPoOrderQtys((prev) => ({
                                  ...prev,
                                  [item.medicineId]: Math.max(0, Number(e.target.value) || 0),
                                }))
                              }
                              className="w-24 px-2 py-1 text-right bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded tabular-nums font-semibold"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            {formatIDR(item.estimatedHpp)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-900 dark:text-white">
                            {formatIDR(item.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <input
                    type="text"
                    value={poNotes}
                    onChange={(e) => setPoNotes(e.target.value)}
                    placeholder="Catatan untuk PBF..."
                    className="flex-1 min-w-[240px] px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                  <div className="font-bold text-sm text-red-700 dark:text-red-400 tabular-nums">
                    Estimasi Total PO:{' '}
                    {formatIDR(draftPoItems.reduce((s, i) => s + i.lineTotal, 0))}
                  </div>
                </div>
              </>
            )}
          </form>

          {/* Saved Purchase Orders List */}
          <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h4 className="font-display font-bold text-xs text-slate-800 dark:text-slate-200">
                Riwayat Purchase Order (PO) ke Supplier
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500">
                    <th className="py-2.5 px-4 font-semibold">No. PO &amp; Tanggal</th>
                    <th className="py-2.5 px-4 font-semibold">Supplier PBF</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Item</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Estimasi Nilai</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {purchaseOrders.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4">
                        <div className="font-mono font-semibold text-slate-900 dark:text-white">
                          {po.poNumber}
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {formatDateID(po.orderDate)} · {po.createdBy}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-800 dark:text-slate-200">
                        {po.supplierName}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums">
                        {po.items.length} item
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-semibold">
                        {formatIDR(po.estimatedTotal)}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={
                            po.status === 'Diterima'
                              ? 'text-emerald-700 font-semibold'
                              : po.status === 'Dikirim ke PBF'
                                ? 'text-amber-700 font-semibold'
                                : 'text-red-700 font-semibold'
                          }
                        >
                          {po.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedPoPreview(po)}
                            className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            Detail
                          </button>
                          {po.status === 'Draft' && (
                            <button
                              type="button"
                              onClick={() => handleUpdatePoStatus(po.id, 'Dikirim ke PBF')}
                              className="px-2.5 py-1 rounded bg-red-700 text-white hover:bg-red-800 cursor-pointer"
                            >
                              Kirim ke PBF
                            </button>
                          )}
                          {po.status === 'Dikirim ke PBF' && (
                            <button
                              type="button"
                              onClick={() => handleUpdatePoStatus(po.id, 'Diterima')}
                              className="px-2.5 py-1 rounded bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                            >
                              Tandai Diterima
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {purchaseOrders.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        Belum ada Purchase Order tersimpan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 3: STOCK OPNAME & AUDIT LOGS ==================== */}
      {activeTab === 'opname' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Opname Form */}
          <form
            onSubmit={handleSubmitOpname}
            className="lg:col-span-5 bg-white dark:bg-slate-900 border border-red-100 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit"
          >
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <i className="fa-solid fa-clipboard-list text-red-700" aria-hidden="true" />
                <span>Formulir Stock Opname Berkala</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Bandingkan stok sistem per batch dengan hitungan fisik rak aktual
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Pilih Obat &amp; Batch (Urutan FEFO)</label>
                <select
                  value={selectedOpnameBatch?.id ?? ''}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setOpnameBatchId(id);
                    const found = batches.find((b) => b.id === id);
                    if (found) setOpnamePhysicalQty(found.qtyRemaining);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  {fefoBatches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.medicineName} · Batch {b.batchNumber} (ED {formatDateID(b.expiryDate)} · Sistem:{' '}
                      {b.qtyRemaining})
                    </option>
                  ))}
                </select>
              </div>

              {selectedOpnameBatch && (
                <div className="p-3 rounded-lg bg-red-50/60 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 grid grid-cols-3 gap-2 tabular-nums">
                  <div>
                    <div className="text-[11px] text-slate-500">Lokasi Rak</div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedOpnameBatch.rackLocation}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Stok Sistem</div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {selectedOpnameBatch.qtyRemaining} unit
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Selisih (Variance)</div>
                    <div
                      className={`font-bold ${
                        opnameVariance < 0
                          ? 'text-rose-700'
                          : opnameVariance > 0
                            ? 'text-emerald-700'
                            : 'text-slate-600'
                      }`}
                    >
                      {opnameVariance > 0 ? `+${opnameVariance}` : opnameVariance} unit
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Stok Fisik Aktual</label>
                  <input
                    required
                    type="number"
                    min={0}
                    value={opnamePhysicalQty}
                    onChange={(e) => setOpnamePhysicalQty(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Alasan Penyesuaian</label>
                  <select
                    value={opnameReason}
                    onChange={(e) => setOpnameReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <option value="Koreksi Opname">Koreksi Opname</option>
                    <option value="Obat Rusak">Obat Rusak</option>
                    <option value="Kedaluwarsa (ED)">Kedaluwarsa (ED)</option>
                    <option value="Selisih Hilang">Selisih Hilang</option>
                    <option value="Retur PBF">Retur PBF</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Catatan Audit &amp; Bukti Berita Acara</label>
                <textarea
                  rows={3}
                  value={opnameNotes}
                  onChange={(e) => setOpnameNotes(e.target.value)}
                  placeholder="Contoh: 2 blister rusak lembab saat pengecekan rak A-1, disisihkan ke karantina..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <button
                type="submit"
                disabled={saving || !selectedOpnameBatch}
                className="w-full py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                <i className="fa-solid fa-check-double mr-1.5" aria-hidden="true" />
                {saving ? 'Menyimpan Audit...' : 'Simpan & Sesuaikan Stok'}
              </button>
            </div>
          </form>

          {/* Variance Audit Log Table */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-red-100 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                Log Audit Selisih &amp; Mutasi Stok
              </h3>
              <span className="text-xs text-slate-500 tabular-nums">
                {stockAuditLogs.length} entri tercatat
              </span>
            </div>

            <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500 sticky top-0">
                    <th className="py-2.5 px-3 font-semibold">Tanggal &amp; Obat</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Sistem</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Fisik</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Selisih</th>
                    <th className="py-2.5 px-3 font-semibold">Alasan &amp; Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stockAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {log.medicineName}
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {formatDateID(log.auditDate)} · Batch{' '}
                          <span className="font-mono">{log.batchNumber}</span> · {log.auditorName}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-slate-600">
                        {log.systemQty}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                        {log.physicalQty}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right tabular-nums font-bold ${
                          log.variance < 0
                            ? 'text-rose-600'
                            : log.variance > 0
                              ? 'text-emerald-600'
                              : 'text-slate-500'
                        }`}
                      >
                        {log.variance > 0 ? `+${log.variance}` : log.variance}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-red-700 dark:text-red-400">
                          {log.reason}
                        </div>
                        <div className="text-[11px] text-slate-500">{log.notes || '-'}</div>
                      </td>
                    </tr>
                  ))}
                  {stockAuditLogs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        Belum ada log audit stok tercatat.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: GOODS RECEIPT (BARANG MASUK PBF) ==================== */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSubmitGoodsReceipt}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 text-xs my-8"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-display font-bold text-base text-slate-900 dark:text-white">
                <i className="fa-solid fa-truck-ramp-box text-red-700" aria-hidden="true" />
                <span>Penerimaan Barang Masuk &amp; Batch Baru (Goods Receipt)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-base" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Produk Obat</label>
                <select
                  value={receiptForm.medicineId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const med = medicines.find((m) => m.id === id);
                    setReceiptForm((f) => ({
                      ...f,
                      medicineId: id,
                      hppUnit: med ? getBaseHpp(med) : f.hppUnit,
                    }));
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Supplier / PBF Pengirim</label>
                <select
                  value={receiptForm.supplierId}
                  onChange={(e) =>
                    setReceiptForm((f) => ({ ...f, supplierId: Number(e.target.value) }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium mb-1">Nomor Batch</label>
                <input
                  required
                  type="text"
                  value={receiptForm.batchNumber}
                  onChange={(e) => setReceiptForm((f) => ({ ...f, batchNumber: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Tanggal Kedaluwarsa (ED)</label>
                <input
                  required
                  type="date"
                  value={receiptForm.expiryDate}
                  onChange={(e) => setReceiptForm((f) => ({ ...f, expiryDate: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Tanggal Terima</label>
                <input
                  required
                  type="date"
                  value={receiptForm.receivedDate}
                  onChange={(e) => setReceiptForm((f) => ({ ...f, receivedDate: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium mb-1">Jumlah Masuk (Satuan Dasar)</label>
                <input
                  required
                  type="number"
                  min={1}
                  value={receiptForm.qtyReceived}
                  onChange={(e) =>
                    setReceiptForm((f) => ({ ...f, qtyReceived: Number(e.target.value) || 1 }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums font-bold"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">HPP / Unit (Rp)</label>
                <input
                  required
                  type="number"
                  min={0}
                  value={receiptForm.hppUnit}
                  onChange={(e) =>
                    setReceiptForm((f) => ({ ...f, hppUnit: Number(e.target.value) || 0 }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Lokasi Rak Penyimpanan</label>
                <input
                  required
                  type="text"
                  value={receiptForm.rackLocation}
                  onChange={(e) =>
                    setReceiptForm((f) => ({ ...f, rackLocation: e.target.value }))
                  }
                  placeholder="Mis. Rak A-1 / Cold Chain"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium mb-1">No. Faktur PBF / Catatan</label>
              <input
                type="text"
                value={receiptForm.notes}
                onChange={(e) => setReceiptForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Mis. Faktur PBF #FJ-2026-8841, segel & suhu baik"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan Barang Masuk'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== MODAL: DETAIL PURCHASE ORDER ==================== */}
      {selectedPoPreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 text-xs">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Purchase Order {selectedPoPreview.poNumber}
                </h4>
                <p className="text-slate-500">
                  {selectedPoPreview.supplierName} · {formatDateID(selectedPoPreview.orderDate)} ·{' '}
                  {selectedPoPreview.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPoPreview(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-base" aria-hidden="true" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
              {selectedPoPreview.items.map((it) => (
                <div key={it.medicineId} className="py-2.5 flex justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {it.medicineName}
                    </div>
                    <div className="text-slate-400 tabular-nums">
                      {it.sku} · Qty {it.orderQtyBase} × {formatIDR(it.estimatedHpp)}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums">{formatIDR(it.lineTotal)}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
              <span className="text-slate-500">{selectedPoPreview.notes || '-'}</span>
              <span className="font-bold text-sm text-red-700 dark:text-red-400 tabular-nums">
                Total: {formatIDR(selectedPoPreview.estimatedTotal)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
