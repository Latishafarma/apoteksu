import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Lock,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/apiClient';
import {
  formatDateID,
  formatIDR,
  getBaseHpp,
  getTierUnitPrice,
  getUnitHpp,
  getUnitMultiplier,
} from '../lib/formatters';
import type {
  Medicine,
  Patient,
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
  TransactionLineItem,
  TransactionRecord,
  TransactionSubMenu,
} from '../types/pharmacy';
import { triggerSafePrint } from '../lib/printHelper';

interface TransactionModuleProps {
  activeSubMenu: TransactionSubMenu;
  onChangeSubMenu: (sub: TransactionSubMenu) => void;
  transactions: TransactionRecord[];
  purchaseOrders: PurchaseOrder[];
  medicines: Medicine[];
  patients: Patient[];
  suppliers: Supplier[];
  operatorName: string;
  onRefreshData: () => Promise<void>;
}

interface SaleDraftRow {
  rowKey: string;
  medicineId: number;
  unitType: 'Pcs' | 'Strip' | 'Box';
  qty: number;
  unitPrice: number;
}

interface PurchaseDraftRow {
  rowKey: string;
  medicineId: number;
  orderQtyBase: number;
  estimatedHpp: number;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const isPurchaseLocked = (status: string): boolean => {
  const normalized = (status || '').trim().toLowerCase();
  return normalized === 'diproses' || normalized === 'diterima';
};

export function TransactionModule({
  activeSubMenu,
  onChangeSubMenu,
  transactions,
  purchaseOrders,
  medicines,
  patients,
  suppliers,
  operatorName,
  onRefreshData,
}: TransactionModuleProps) {
  // Feedback banners
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Filters - Penjualan
  const [saleSearch, setSaleSearch] = useState('');
  const [saleStatusFilter, setSaleStatusFilter] = useState('Semua');

  // Filters - Pembelian
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState('Semua');

  // Sales Modal (Tambah / Edit Penjualan)
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null);
  const [salePatientId, setSalePatientId] = useState<string>('');
  const [salePatientName, setSalePatientName] = useState('Pasien Umum');
  const [saleDate, setSaleDate] = useState(todayIso());
  const [salePriceTier, setSalePriceTier] = useState<'reguler' | 'klinik' | 'mitra'>('reguler');
  const [salePaymentMethod, setSalePaymentMethod] = useState('Tunai');
  const [saleDueDate, setSaleDueDate] = useState('');
  const [salePaidAmount, setSalePaidAmount] = useState(0);
  const [saleDiscount, setSaleDiscount] = useState(0);
  const [salePrescriptionType, setSalePrescriptionType] = useState('Non-Resep');
  const [saleDoctorName, setSaleDoctorName] = useState('-');
  const [saleNotes, setSaleNotes] = useState('');
  const [saleRows, setSaleRows] = useState<SaleDraftRow[]>([]);

  // Print Sales Invoice Modal
  const [printInvoiceTx, setPrintInvoiceTx] = useState<TransactionRecord | null>(null);

  // Delete Sales Confirmation Modal
  const [deleteSaleTarget, setDeleteSaleTarget] = useState<TransactionRecord | null>(null);

  // Purchase Modal (Tambah / Edit Pembelian)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<number | null>(null);
  const [purchaseSupplierId, setPurchaseSupplierId] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [purchaseRows, setPurchaseRows] = useState<PurchaseDraftRow[]>([]);

  // Confirm Process / Delete Purchase Modals
  const [processPurchaseTarget, setProcessPurchaseTarget] = useState<PurchaseOrder | null>(null);
  const [deletePurchaseTarget, setDeletePurchaseTarget] = useState<PurchaseOrder | null>(null);

  const medById = useMemo(() => new Map(medicines.map((m) => [m.id, m])), [medicines]);

  // --- Filtered Sales & KPIs ---
  const filteredSales = useMemo(() => {
    const q = saleSearch.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (saleStatusFilter !== 'Semua' && tx.paymentStatus !== saleStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        tx.invoiceNo.toLowerCase().includes(q) ||
        tx.patientName.toLowerCase().includes(q) ||
        tx.cashierName.toLowerCase().includes(q) ||
        tx.paymentMethod.toLowerCase().includes(q) ||
        (tx.items || []).some((it) => it.name.toLowerCase().includes(q))
      );
    });
  }, [transactions, saleSearch, saleStatusFilter]);

  const salesKpi = useMemo(() => {
    const totalRevenue = transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const totalProfit = transactions.reduce((sum, t) => sum + (t.grossProfit || 0), 0);
    const totalReceivable = transactions.reduce((sum, t) => sum + (t.remainingBalance || 0), 0);
    return {
      count: transactions.length,
      totalRevenue,
      totalProfit,
      totalReceivable,
    };
  }, [transactions]);

  // --- Filtered Purchases & KPIs ---
  const filteredPurchases = useMemo(() => {
    const q = purchaseSearch.trim().toLowerCase();
    return purchaseOrders.filter((po) => {
      const locked = isPurchaseLocked(po.status);
      if (purchaseStatusFilter === 'Draft' && locked) return false;
      if (purchaseStatusFilter === 'Diproses' && !locked) return false;
      if (!q) return true;
      return (
        po.poNumber.toLowerCase().includes(q) ||
        po.supplierName.toLowerCase().includes(q) ||
        po.createdBy.toLowerCase().includes(q) ||
        (po.items || []).some((it) => it.medicineName.toLowerCase().includes(q))
      );
    });
  }, [purchaseOrders, purchaseSearch, purchaseStatusFilter]);

  const purchaseKpi = useMemo(() => {
    const draftCount = purchaseOrders.filter((po) => !isPurchaseLocked(po.status)).length;
    const processedCount = purchaseOrders.filter((po) => isPurchaseLocked(po.status)).length;
    const totalValue = purchaseOrders.reduce((sum, po) => sum + (po.estimatedTotal || 0), 0);
    return {
      count: purchaseOrders.length,
      draftCount,
      processedCount,
      totalValue,
    };
  }, [purchaseOrders]);

  // --- Sales Modal Helpers ---
  const makeDefaultSaleRow = (tier: 'reguler' | 'klinik' | 'mitra'): SaleDraftRow => {
    const firstMed = medicines[0];
    return {
      rowKey: `sale-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      medicineId: firstMed?.id ?? 0,
      unitType: 'Pcs',
      qty: 1,
      unitPrice: firstMed ? getTierUnitPrice(firstMed, tier, 'Pcs') : 0,
    };
  };

  const openCreateSaleModal = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditingSaleId(null);
    setSalePatientId('');
    setSalePatientName('Pasien Umum');
    setSaleDate(todayIso());
    setSalePriceTier('reguler');
    setSalePaymentMethod('Tunai');
    setSaleDueDate('');
    setSalePaidAmount(0);
    setSaleDiscount(0);
    setSalePrescriptionType('Non-Resep');
    setSaleDoctorName('-');
    setSaleNotes('');
    setSaleRows(medicines.length > 0 ? [makeDefaultSaleRow('reguler')] : []);
    setShowSaleModal(true);
  };

  const openEditSaleModal = (tx: TransactionRecord) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const tier =
      tx.priceTier === 'klinik' || tx.priceTier === 'mitra' ? tx.priceTier : 'reguler';
    setEditingSaleId(tx.id);
    setSalePatientId(tx.patientId ? String(tx.patientId) : '');
    setSalePatientName(tx.patientName || 'Pasien Umum');
    setSaleDate(tx.transactionDate || todayIso());
    setSalePriceTier(tier);
    setSalePaymentMethod(tx.paymentMethod || 'Tunai');
    setSaleDueDate(tx.dueDate || '');
    setSalePaidAmount(tx.paidAmount || 0);
    setSaleDiscount(tx.discountAmount || 0);
    setSalePrescriptionType(tx.prescriptionType || 'Non-Resep');
    setSaleDoctorName(tx.doctorName || '-');
    setSaleNotes(tx.notes || '');
    setSaleRows(
      (tx.items || []).map((item, idx) => ({
        rowKey: `edit-sale-${tx.id}-${idx}-${item.medicineId}`,
        medicineId: item.medicineId,
        unitType: item.unitType || 'Pcs',
        qty: item.qty || 1,
        unitPrice: item.unitPrice || 0,
      }))
    );
    setShowSaleModal(true);
  };

  const handleSaleTierChange = (nextTier: 'reguler' | 'klinik' | 'mitra') => {
    setSalePriceTier(nextTier);
    setSaleRows((prev) =>
      prev.map((row) => {
        const med = medById.get(row.medicineId);
        return {
          ...row,
          unitPrice: med ? getTierUnitPrice(med, nextTier, row.unitType) : row.unitPrice,
        };
      })
    );
  };

  const saleTotals = useMemo(() => {
    let subtotal = 0;
    let totalHpp = 0;
    for (const row of saleRows) {
      const med = medById.get(row.medicineId);
      const qty = Math.max(1, Number(row.qty) || 1);
      const lineTotal = Math.round(qty * Math.max(0, Number(row.unitPrice) || 0));
      subtotal += lineTotal;
      if (med) {
        totalHpp += Math.round(qty * getUnitHpp(med, row.unitType));
      }
    }
    const discount = Math.min(subtotal, Math.max(0, Math.round(Number(saleDiscount) || 0)));
    const totalAmount = Math.max(0, subtotal - discount);
    const grossProfit = totalAmount - totalHpp;
    return { subtotal, discount, totalAmount, totalHpp, grossProfit };
  }, [saleRows, saleDiscount, medById]);

  const handleSaveSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saleRows.length === 0) {
      setErrorMsg('Tambahkan minimal satu produk pada transaksi penjualan.');
      return;
    }

    const lineItems: TransactionLineItem[] = [];
    for (const row of saleRows) {
      const med = medById.get(row.medicineId);
      if (!med) continue;
      const qty = Math.max(1, Math.round(Number(row.qty) || 1));
      const baseQtyDeducted = qty * getUnitMultiplier(med, row.unitType);
      const unitPrice = Math.max(0, Math.round(Number(row.unitPrice) || 0));
      lineItems.push({
        medicineId: med.id,
        sku: med.sku,
        name: med.name,
        categoryName: med.categoryName,
        unitType: row.unitType,
        qty,
        baseQtyDeducted,
        unitPrice,
        hppUnit: getUnitHpp(med, row.unitType),
        discount: 0,
        lineTotal: qty * unitPrice,
        isCrossSell: false,
      });
    }

    if (lineItems.length === 0) {
      setErrorMsg('Pilih produk obat yang valid sebelum menyimpan penjualan.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const selectedPatient = salePatientId
        ? patients.find((p) => p.id === Number(salePatientId))
        : null;
      const isTempo = salePaymentMethod === 'Piutang/Tempo';
      const paidAmount = isTempo
        ? Math.min(saleTotals.totalAmount, Math.max(0, Math.round(Number(salePaidAmount) || 0)))
        : saleTotals.totalAmount;

      const payload = {
        patientId: selectedPatient?.id ?? null,
        patientName: selectedPatient?.name || salePatientName.trim() || 'Pasien Umum',
        priceTier: salePriceTier,
        paymentMethod: salePaymentMethod,
        dueDate: isTempo ? saleDueDate || null : null,
        paidAmount,
        subtotal: saleTotals.subtotal,
        discountAmount: saleTotals.discount,
        taxAmount: 0,
        totalAmount: saleTotals.totalAmount,
        totalHpp: saleTotals.totalHpp,
        grossProfit: saleTotals.grossProfit,
        diagnosisIcd10: 'Z00.0 - Umum',
        prescriptionType: salePrescriptionType,
        doctorName: saleDoctorName.trim() || '-',
        items: lineItems,
        cashierName: operatorName,
        notes: saleNotes.trim(),
        transactionDate: saleDate || todayIso(),
        allowNegativeStock: false,
      };

      if (editingSaleId) {
        await apiRequest<TransactionRecord>(`/api/transactions/${editingSaleId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setSuccessMsg('Transaksi penjualan berhasil diperbarui dan stok telah disinkronkan.');
      } else {
        await apiRequest<TransactionRecord>('/api/transactions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setSuccessMsg('Transaksi penjualan baru berhasil dicatat.');
      }

      setShowSaleModal(false);
      await onRefreshData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan transaksi penjualan.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDeleteSale = async () => {
    if (!deleteSaleTarget) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiRequest(`/api/transactions/${deleteSaleTarget.id}`, { method: 'DELETE' });
      setSuccessMsg(
        `Faktur penjualan ${deleteSaleTarget.invoiceNo} berhasil dihapus dan stok dikembalikan.`
      );
      setDeleteSaleTarget(null);
      await onRefreshData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus transaksi penjualan.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Purchase Modal Helpers ---
  const makeDefaultPurchaseRow = (): PurchaseDraftRow => {
    const firstMed = medicines[0];
    return {
      rowKey: `po-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      medicineId: firstMed?.id ?? 0,
      orderQtyBase: 50,
      estimatedHpp: firstMed ? getBaseHpp(firstMed) : 0,
    };
  };

  const openCreatePurchaseModal = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditingPurchaseId(null);
    setPurchaseSupplierId(suppliers[0] ? String(suppliers[0].id) : '');
    setPurchaseDate(todayIso());
    setPurchaseNotes('');
    setPurchaseRows(medicines.length > 0 ? [makeDefaultPurchaseRow()] : []);
    setShowPurchaseModal(true);
  };

  const openEditPurchaseModal = (po: PurchaseOrder) => {
    if (isPurchaseLocked(po.status)) {
      setErrorMsg('Pembelian yang sudah diproses terkunci dan tidak dapat diedit.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditingPurchaseId(po.id);
    setPurchaseSupplierId(po.supplierId ? String(po.supplierId) : '');
    setPurchaseDate(po.orderDate || todayIso());
    setPurchaseNotes(po.notes || '');
    setPurchaseRows(
      (po.items || []).map((item, idx) => ({
        rowKey: `edit-po-${po.id}-${idx}-${item.medicineId}`,
        medicineId: item.medicineId,
        orderQtyBase: item.orderQtyBase || 1,
        estimatedHpp: item.estimatedHpp || 0,
      }))
    );
    setShowPurchaseModal(true);
  };

  const purchaseDraftTotal = useMemo(
    () =>
      purchaseRows.reduce(
        (sum, r) =>
          sum + Math.max(1, Number(r.orderQtyBase) || 1) * Math.max(0, Number(r.estimatedHpp) || 0),
        0
      ),
    [purchaseRows]
  );

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (purchaseRows.length === 0) {
      setErrorMsg('Tambahkan minimal satu item obat pada transaksi pembelian.');
      return;
    }

    const items: PurchaseOrderItem[] = [];
    for (const row of purchaseRows) {
      const med = medById.get(row.medicineId);
      if (!med) continue;
      const qty = Math.max(1, Math.round(Number(row.orderQtyBase) || 1));
      const hpp = Math.max(0, Math.round(Number(row.estimatedHpp) || 0));
      items.push({
        medicineId: med.id,
        sku: med.sku,
        medicineName: med.name,
        currentStock: med.stockBase,
        minStock: med.minStockBase,
        orderQtyBase: qty,
        estimatedHpp: hpp,
        lineTotal: qty * hpp,
      });
    }

    if (items.length === 0) {
      setErrorMsg('Pilih produk obat yang valid untuk pembelian.');
      return;
    }

    const selectedSupplier = purchaseSupplierId
      ? suppliers.find((s) => s.id === Number(purchaseSupplierId))
      : null;

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload = {
        supplierId: selectedSupplier?.id ?? null,
        supplierName: selectedSupplier?.name || 'PBF Resmi',
        items,
        createdBy: operatorName,
        orderDate: purchaseDate || todayIso(),
        notes: purchaseNotes.trim(),
      };

      if (editingPurchaseId) {
        await apiRequest<PurchaseOrder>(`/api/inventory/purchase-orders/${editingPurchaseId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setSuccessMsg('Transaksi pembelian berhasil diperbarui.');
      } else {
        await apiRequest<PurchaseOrder>('/api/inventory/purchase-orders', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setSuccessMsg('Transaksi pembelian baru berhasil dibuat (status Draft).');
      }

      setShowPurchaseModal(false);
      await onRefreshData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan transaksi pembelian.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmProcessPurchase = async () => {
    if (!processPurchaseTarget) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiRequest(`/api/inventory/purchase-orders/${processPurchaseTarget.id}/process`, {
        method: 'POST',
      });
      setSuccessMsg(
        `Pembelian ${processPurchaseTarget.poNumber} telah diproses. Stok produk bertambah dan fitur edit otomatis terkunci.`
      );
      setProcessPurchaseTarget(null);
      await onRefreshData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses transaksi pembelian.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDeletePurchase = async () => {
    if (!deletePurchaseTarget) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiRequest(`/api/inventory/purchase-orders/${deletePurchaseTarget.id}`, {
        method: 'DELETE',
      });
      setSuccessMsg(`Transaksi pembelian ${deletePurchaseTarget.poNumber} berhasil dihapus.`);
      setDeletePurchaseTarget(null);
      await onRefreshData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus transaksi pembelian.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Header + Submenu Switcher + Primary Action */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-display text-xl lg:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Manajemen Transaksi
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Kelola riwayat penjualan, cetak faktur, serta pencatatan dan pemrosesan pembelian stok dari PBF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Submenu Segmented Switcher */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl">
            <button
              type="button"
              onClick={() => {
                onChangeSubMenu('penjualan');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeSubMenu === 'penjualan'
                  ? 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Penjualan</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onChangeSubMenu('pembelian');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeSubMenu === 'pembelian'
                  ? 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Pembelian</span>
            </button>
          </div>

          {activeSubMenu === 'penjualan' ? (
            <button
              type="button"
              onClick={openCreateSaleModal}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Penjualan</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={openCreatePurchaseModal}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Pembelian</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Alerts */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-600 dark:text-rose-300 hover:underline cursor-pointer whitespace-nowrap"
          >
            Tutup
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer whitespace-nowrap"
          >
            Tutup
          </button>
        </div>
      )}

      {/* ==================== SUBMENU 1: PENJUALAN ==================== */}
      {activeSubMenu === 'penjualan' && (
        <div className="space-y-5">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Faktur Penjualan</div>
              <div className="mt-1.5 text-xl font-display font-bold text-slate-900 dark:text-white tabular-nums">
                {salesKpi.count}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Omset Penjualan</div>
              <div className="mt-1.5 text-xl font-display font-bold text-slate-900 dark:text-white tabular-nums">
                {formatIDR(salesKpi.totalRevenue)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Estimasi Laba Kotor</div>
              <div className="mt-1.5 text-xl font-display font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {formatIDR(salesKpi.totalProfit)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Sisa Piutang / Tempo</div>
              <div className="mt-1.5 text-xl font-display font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                {formatIDR(salesKpi.totalReceivable)}
              </div>
            </div>
          </div>

          {/* Search & Filter */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-8 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={saleSearch}
                onChange={(e) => setSaleSearch(e.target.value)}
                placeholder="Cari nomor faktur, nama pasien/pelanggan, kasir, atau nama produk..."
                className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>
            <div className="md:col-span-4">
              <select
                value={saleStatusFilter}
                onChange={(e) => setSaleStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="Semua">Semua Status Pembayaran</option>
                <option value="Lunas">Lunas</option>
                <option value="Cicilan">Cicilan</option>
                <option value="Belum Lunas">Belum Lunas</option>
              </select>
            </div>
          </div>

          {/* Riwayat Penjualan Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Riwayat Penjualan
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {filteredSales.length} transaksi
              </span>
            </div>

            {filteredSales.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <ReceiptText className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Belum ada riwayat penjualan yang sesuai dengan filter.
                </p>
                <button
                  type="button"
                  onClick={openCreateSaleModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-medium cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Penjualan</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-4 font-semibold">No. Faktur &amp; Tanggal</th>
                      <th className="py-3 px-4 font-semibold">Pelanggan &amp; Kasir</th>
                      <th className="py-3 px-4 font-semibold">Ringkasan Produk</th>
                      <th className="py-3 px-4 font-semibold">Pembayaran</th>
                      <th className="py-3 px-4 font-semibold text-right">Total &amp; Laba</th>
                      <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredSales.map((tx) => (
                      <tr
                        key={tx.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono font-semibold text-slate-900 dark:text-white">
                            {tx.invoiceNo}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                            {formatDateID(tx.transactionDate)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {tx.patientName}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">
                            Kasir: {tx.cashierName} · Tier {tx.priceTier}
                          </div>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <div className="text-slate-800 dark:text-slate-200 truncate">
                            {(tx.items || [])
                              .slice(0, 2)
                              .map((it) => `${it.name} (${it.qty} ${it.unitType})`)
                              .join(', ') || '-'}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                            {(tx.items || []).length} item · {tx.prescriptionType}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {tx.paymentMethod}
                          </div>
                          <div
                            className={`font-medium ${
                              tx.paymentStatus === 'Lunas'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : tx.paymentStatus === 'Cicilan'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            {tx.paymentStatus}
                            {tx.remainingBalance > 0
                              ? ` · Sisa ${formatIDR(tx.remainingBalance)}`
                              : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap tabular-nums">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {formatIDR(tx.totalAmount)}
                          </div>
                          <div className="text-emerald-700 dark:text-emerald-400">
                            Laba {formatIDR(tx.grossProfit)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPrintInvoiceTx(tx)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium transition-colors cursor-pointer"
                              title="Cetak Faktur Penjualan"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Cetak Faktur</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditSaleModal(tx)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium transition-colors cursor-pointer"
                              title="Edit Penjualan"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteSaleTarget(tx)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-medium transition-colors cursor-pointer"
                              title="Hapus Penjualan"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Hapus</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== SUBMENU 2: PEMBELIAN ==================== */}
      {activeSubMenu === 'pembelian' && (
        <div className="space-y-5">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Transaksi Pembelian</div>
              <div className="mt-1.5 text-xl font-display font-bold text-slate-900 dark:text-white tabular-nums">
                {purchaseKpi.count}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Draft / Belum Diproses</div>
              <div className="mt-1.5 text-xl font-display font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                {purchaseKpi.draftCount}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Sudah Diproses (Terkunci)</div>
              <div className="mt-1.5 text-xl font-display font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {purchaseKpi.processedCount}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Nilai Pembelian</div>
              <div className="mt-1.5 text-xl font-display font-bold text-slate-900 dark:text-white tabular-nums">
                {formatIDR(purchaseKpi.totalValue)}
              </div>
            </div>
          </div>

          {/* Search & Filter */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-8 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={purchaseSearch}
                onChange={(e) => setPurchaseSearch(e.target.value)}
                placeholder="Cari nomor PO/pembelian, nama supplier PBF, atau nama obat..."
                className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>
            <div className="md:col-span-4">
              <select
                value={purchaseStatusFilter}
                onChange={(e) => setPurchaseStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="Semua">Semua Status Pembelian</option>
                <option value="Draft">Draft / Belum Diproses</option>
                <option value="Diproses">Diproses (Edit Terkunci)</option>
              </select>
            </div>
          </div>

          {/* Riwayat Pembelian Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Riwayat Pembelian
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {filteredPurchases.length} transaksi
              </span>
            </div>

            {filteredPurchases.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <ShoppingBag className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Belum ada riwayat pembelian yang sesuai dengan filter.
                </p>
                <button
                  type="button"
                  onClick={openCreatePurchaseModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-medium cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Pembelian</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-4 font-semibold">No. Pembelian &amp; Tanggal</th>
                      <th className="py-3 px-4 font-semibold">Supplier (PBF)</th>
                      <th className="py-3 px-4 font-semibold">Rincian Item</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold text-right">Total Nilai</th>
                      <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredPurchases.map((po) => {
                      const locked = isPurchaseLocked(po.status);
                      const totalQty = (po.items || []).reduce(
                        (sum, it) => sum + (it.orderQtyBase || 0),
                        0
                      );
                      return (
                        <tr
                          key={po.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-mono font-semibold text-slate-900 dark:text-white">
                              {po.poNumber}
                            </div>
                            <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                              {formatDateID(po.orderDate)}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {po.supplierName}
                            </div>
                            <div className="text-slate-500 dark:text-slate-400">
                              Dibuat oleh: {po.createdBy}
                            </div>
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <div className="text-slate-800 dark:text-slate-200 truncate">
                              {(po.items || [])
                                .slice(0, 2)
                                .map((it) => `${it.medicineName} (${it.orderQtyBase})`)
                                .join(', ') || '-'}
                            </div>
                            <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                              {(po.items || []).length} produk · Total {totalQty} unit dasar
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {locked ? (
                              <div className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                                <Lock className="w-3.5 h-3.5 shrink-0" />
                                <span>{po.status} · Edit Terkunci</span>
                              </div>
                            ) : (
                              <div className="font-medium text-amber-700 dark:text-amber-400">
                                {po.status} · Dapat Diedit
                              </div>
                            )}
                            {po.notes && (
                              <div className="text-slate-400 truncate max-w-[200px]">
                                {po.notes}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap font-semibold text-slate-900 dark:text-white tabular-nums">
                            {formatIDR(po.estimatedTotal)}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {!locked && (
                                <button
                                  type="button"
                                  onClick={() => setProcessPurchaseTarget(po)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-medium transition-colors cursor-pointer"
                                  title="Proses pembelian (stok otomatis masuk & kunci edit)"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Proses</span>
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={locked}
                                onClick={() => openEditPurchaseModal(po)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${
                                  locked
                                    ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer'
                                }`}
                                title={
                                  locked
                                    ? 'Pembelian sudah diproses — fitur edit terkunci otomatis'
                                    : 'Edit Pembelian'
                                }
                              >
                                {locked ? (
                                  <>
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>Terkunci</span>
                                  </>
                                ) : (
                                  <>
                                    <Pencil className="w-3.5 h-3.5" />
                                    <span>Edit</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => setDeletePurchaseTarget(po)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-medium transition-colors cursor-pointer"
                                title="Hapus Pembelian"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Hapus</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== MODAL: TAMBAH / EDIT PENJUALAN ==================== */}
      {showSaleModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveSale}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full p-6 space-y-5 text-xs my-8 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-display font-bold text-base text-slate-900 dark:text-white">
                <ShoppingCart className="w-4 h-4 text-red-700 dark:text-red-400" />
                <span>
                  {editingSaleId ? 'Edit Transaksi Penjualan' : 'Tambah Transaksi Penjualan'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowSaleModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Pelanggan / Pasien
                </label>
                <select
                  value={salePatientId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSalePatientId(val);
                    const found = patients.find((p) => p.id === Number(val));
                    setSalePatientName(found ? found.name : 'Pasien Umum');
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="">Pasien Umum (Walk-in)</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.mrn})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tanggal Penjualan
                </label>
                <input
                  required
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tier Harga
                </label>
                <select
                  value={salePriceTier}
                  onChange={(e) =>
                    handleSaleTierChange(e.target.value as 'reguler' | 'klinik' | 'mitra')
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="reguler">Reguler / Retail</option>
                  <option value="klinik">Klinik / Dokter</option>
                  <option value="mitra">Mitra / Instansi</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Metode Pembayaran
                </label>
                <select
                  value={salePaymentMethod}
                  onChange={(e) => setSalePaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="Tunai">Tunai</option>
                  <option value="QRIS">QRIS</option>
                  <option value="Transfer Bank">Transfer Bank</option>
                  <option value="Debit/Kartu">Debit/Kartu</option>
                  <option value="Piutang/Tempo">Piutang/Tempo</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Jenis Layanan
                </label>
                <select
                  value={salePrescriptionType}
                  onChange={(e) => setSalePrescriptionType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="Non-Resep">Non-Resep (OTC)</option>
                  <option value="Resep Dokter">Resep Dokter</option>
                  <option value="Swamedikasi">Swamedikasi</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nama Dokter (Opsional)
                </label>
                <input
                  type="text"
                  value={saleDoctorName}
                  onChange={(e) => setSaleDoctorName(e.target.value)}
                  placeholder="-"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>

            {salePaymentMethod === 'Piutang/Tempo' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                <div>
                  <label className="block font-medium text-amber-900 dark:text-amber-300 mb-1">
                    Tanggal Jatuh Tempo
                  </label>
                  <input
                    type="date"
                    value={saleDueDate}
                    onChange={(e) => setSaleDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-amber-200 dark:border-amber-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-amber-900 dark:text-amber-300 mb-1">
                    Nominal Dibayar / DP (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={saleTotals.totalAmount}
                    value={salePaidAmount}
                    onChange={(e) => setSalePaidAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-amber-200 dark:border-amber-800 rounded-lg tabular-nums"
                  />
                </div>
              </div>
            )}

            {/* Dynamic Sale Line Items */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-900 dark:text-white">
                  Daftar Item Penjualan
                </label>
                <button
                  type="button"
                  onClick={() => setSaleRows((prev) => [...prev, makeDefaultSaleRow(salePriceTier)])}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-slate-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-slate-800 font-medium cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Baris</span>
                </button>
              </div>

              <div className="space-y-2">
                {saleRows.map((row) => {
                  const med = medById.get(row.medicineId);
                  const lineSubtotal =
                    Math.max(1, Number(row.qty) || 1) * Math.max(0, Number(row.unitPrice) || 0);
                  return (
                    <div
                      key={row.rowKey}
                      className="grid grid-cols-12 gap-2 items-center p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                    >
                      <div className="col-span-12 sm:col-span-4">
                        <select
                          value={row.medicineId}
                          onChange={(e) => {
                            const nextMedId = Number(e.target.value);
                            const nextMed = medById.get(nextMedId);
                            setSaleRows((prev) =>
                              prev.map((r) =>
                                r.rowKey === row.rowKey
                                  ? {
                                      ...r,
                                      medicineId: nextMedId,
                                      unitPrice: nextMed
                                        ? getTierUnitPrice(nextMed, salePriceTier, r.unitType)
                                        : 0,
                                    }
                                  : r
                              )
                            );
                          }}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                        >
                          {medicines.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} (Stok: {m.stockBase} {m.unitBase})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <select
                          value={row.unitType}
                          onChange={(e) => {
                            const nextUnit = e.target.value as 'Pcs' | 'Strip' | 'Box';
                            setSaleRows((prev) =>
                              prev.map((r) =>
                                r.rowKey === row.rowKey
                                  ? {
                                      ...r,
                                      unitType: nextUnit,
                                      unitPrice: med
                                        ? getTierUnitPrice(med, salePriceTier, nextUnit)
                                        : r.unitPrice,
                                    }
                                  : r
                              )
                            );
                          }}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                        >
                          <option value="Pcs">Pcs ({med?.unitBase || 'Unit'})</option>
                          <option value="Strip">Strip</option>
                          <option value="Box">Box</option>
                        </select>
                      </div>
                      <div className="col-span-3 sm:col-span-1">
                        <input
                          required
                          type="number"
                          min={1}
                          value={row.qty}
                          onChange={(e) =>
                            setSaleRows((prev) =>
                              prev.map((r) =>
                                r.rowKey === row.rowKey
                                  ? { ...r, qty: Math.max(1, Number(e.target.value) || 1) }
                                  : r
                              )
                            )
                          }
                          className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-right tabular-nums"
                        />
                      </div>
                      <div className="col-span-5 sm:col-span-2">
                        <input
                          required
                          type="number"
                          min={0}
                          value={row.unitPrice}
                          onChange={(e) =>
                            setSaleRows((prev) =>
                              prev.map((r) =>
                                r.rowKey === row.rowKey
                                  ? { ...r, unitPrice: Math.max(0, Number(e.target.value) || 0) }
                                  : r
                              )
                            )
                          }
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-right tabular-nums"
                        />
                      </div>
                      <div className="col-span-10 sm:col-span-2 text-right font-semibold text-slate-900 dark:text-white tabular-nums">
                        {formatIDR(lineSubtotal)}
                      </div>
                      <div className="col-span-2 sm:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setSaleRows((prev) => prev.filter((r) => r.rowKey !== row.rowKey))
                          }
                          className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg cursor-pointer"
                          title="Hapus baris"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="space-y-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Diskon Faktur (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={saleDiscount}
                    onChange={(e) => setSaleDiscount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Catatan Penjualan
                  </label>
                  <input
                    type="text"
                    value={saleNotes}
                    onChange={(e) => setSaleNotes(e.target.value)}
                    placeholder="Catatan tambahan faktur (opsional)"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 tabular-nums">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span>{formatIDR(saleTotals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Diskon</span>
                  <span>- {formatIDR(saleTotals.discount)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span>Total Faktur</span>
                  <span>{formatIDR(saleTotals.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-medium">
                  <span>Estimasi Laba Kotor</span>
                  <span>{formatIDR(saleTotals.grossProfit)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSaleModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold cursor-pointer disabled:opacity-60"
              >
                {submitting
                  ? 'Menyimpan...'
                  : editingSaleId
                    ? 'Simpan Perubahan'
                    : 'Simpan Penjualan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== MODAL: CETAK FAKTUR PENJUALAN ==================== */}
      {printInvoiceTx && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="font-display font-bold text-base text-slate-900 dark:text-white">
                Pratinjau Faktur Penjualan
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    triggerSafePrint({
                      elementId: 'sales-invoice-print',
                      documentTitle: `Faktur-${printInvoiceTx.invoiceNo}`,
                      filename: `Faktur-${printInvoiceTx.invoiceNo}`,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Faktur</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintInvoiceTx(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Invoice Area */}
            <div
              id="sales-invoice-print"
              className="p-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white text-slate-900 space-y-5 text-xs"
            >
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
                <div>
                  <h2 className="font-display text-lg font-bold tracking-tight text-slate-900">
                    APOTEK LATISHA FARMA · ApotekSu
                  </h2>
                  <p className="text-slate-600 mt-0.5">
                    Jl. Kesehatan Raya No. 19, Jakarta Selatan · Telp. (021) 789-4410
                  </p>
                  <p className="text-slate-500">
                    SIA: 503/SIA-LF/2026 · SIPA: 446/APT-LF/2026
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-display font-bold text-sm text-slate-900">
                    FAKTUR PENJUALAN
                  </div>
                  <div className="font-mono font-semibold text-slate-800 mt-1">
                    {printInvoiceTx.invoiceNo}
                  </div>
                  <div className="text-slate-600 tabular-nums">
                    Tanggal: {formatDateID(printInvoiceTx.transactionDate)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-slate-500">Pelanggan / Pasien</div>
                  <div className="font-semibold text-slate-900">{printInvoiceTx.patientName}</div>
                  <div className="text-slate-600">
                    Layanan: {printInvoiceTx.prescriptionType} · Dokter: {printInvoiceTx.doctorName}
                  </div>
                </div>
                <div className="space-y-1 text-right">
                  <div className="text-slate-500">Pembayaran &amp; Kasir</div>
                  <div className="font-semibold text-slate-900">
                    {printInvoiceTx.paymentMethod} ({printInvoiceTx.paymentStatus})
                  </div>
                  <div className="text-slate-600">Kasir: {printInvoiceTx.cashierName}</div>
                </div>
              </div>

              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-y border-slate-300 bg-slate-50 text-slate-700">
                    <th className="py-2 px-2 font-semibold">No</th>
                    <th className="py-2 px-2 font-semibold">Nama Produk</th>
                    <th className="py-2 px-2 font-semibold text-center">Qty</th>
                    <th className="py-2 px-2 font-semibold text-right">Harga Satuan</th>
                    <th className="py-2 px-2 font-semibold text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(printInvoiceTx.items || []).map((item, idx) => (
                    <tr key={`${item.medicineId}-${idx}`}>
                      <td className="py-2 px-2 tabular-nums">{idx + 1}</td>
                      <td className="py-2 px-2">
                        <div className="font-medium text-slate-900">{item.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{item.sku}</div>
                      </td>
                      <td className="py-2 px-2 text-center tabular-nums">
                        {item.qty} {item.unitType}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {formatIDR(item.unitPrice)}
                      </td>
                      <td className="py-2 px-2 text-right font-medium tabular-nums">
                        {formatIDR(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-64 space-y-1.5 tabular-nums">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span>{formatIDR(printInvoiceTx.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Diskon</span>
                    <span>- {formatIDR(printInvoiceTx.discountAmount)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-slate-900 pt-1.5 border-t border-slate-300">
                    <span>Total Tagihan</span>
                    <span>{formatIDR(printInvoiceTx.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Dibayar</span>
                    <span>{formatIDR(printInvoiceTx.paidAmount)}</span>
                  </div>
                  {printInvoiceTx.remainingBalance > 0 && (
                    <div className="flex justify-between font-semibold text-rose-700">
                      <span>Sisa Piutang</span>
                      <span>{formatIDR(printInvoiceTx.remainingBalance)}</span>
                    </div>
                  )}
                </div>
              </div>

              {printInvoiceTx.notes && (
                <div className="pt-2 border-t border-slate-200 text-slate-600">
                  Catatan: {printInvoiceTx.notes}
                </div>
              )}

              <div className="grid grid-cols-2 gap-8 pt-6 text-center text-slate-600">
                <div>
                  <div>Penerima / Pelanggan</div>
                  <div className="mt-12 border-t border-slate-300 pt-1 font-medium text-slate-800">
                    {printInvoiceTx.patientName}
                  </div>
                </div>
                <div>
                  <div>Hormat Kami, Kasir / Apoteker</div>
                  <div className="mt-12 border-t border-slate-300 pt-1 font-medium text-slate-800">
                    {printInvoiceTx.cashierName}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: TAMBAH / EDIT PEMBELIAN ==================== */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSavePurchase}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full p-6 space-y-5 text-xs my-8 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-display font-bold text-base text-slate-900 dark:text-white">
                <ShoppingBag className="w-4 h-4 text-red-700 dark:text-red-400" />
                <span>
                  {editingPurchaseId ? 'Edit Transaksi Pembelian' : 'Tambah Transaksi Pembelian'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPurchaseModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Supplier / PBF Resmi
                </label>
                <select
                  required
                  value={purchaseSupplierId}
                  onChange={(e) => setPurchaseSupplierId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  {suppliers.length === 0 && <option value="">PBF Resmi</option>}
                  {suppliers.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name} ({sup.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tanggal Pembelian
                </label>
                <input
                  required
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Catatan / No. Faktur Supplier
              </label>
              <input
                type="text"
                value={purchaseNotes}
                onChange={(e) => setPurchaseNotes(e.target.value)}
                placeholder="Misal: Pengadaan rutin bulanan / No. Faktur PBF..."
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>

            {/* Dynamic Purchase Line Items */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-900 dark:text-white">
                  Daftar Item Pembelian
                </label>
                <button
                  type="button"
                  onClick={() => setPurchaseRows((prev) => [...prev, makeDefaultPurchaseRow()])}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-slate-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-slate-800 font-medium cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Item</span>
                </button>
              </div>

              <div className="space-y-2">
                {purchaseRows.map((row) => {
                  const med = medById.get(row.medicineId);
                  const lineTotal =
                    Math.max(1, Number(row.orderQtyBase) || 1) *
                    Math.max(0, Number(row.estimatedHpp) || 0);
                  return (
                    <div
                      key={row.rowKey}
                      className="grid grid-cols-12 gap-2 items-center p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                    >
                      <div className="col-span-12 sm:col-span-5">
                        <select
                          value={row.medicineId}
                          onChange={(e) => {
                            const nextMedId = Number(e.target.value);
                            const nextMed = medById.get(nextMedId);
                            setPurchaseRows((prev) =>
                              prev.map((r) =>
                                r.rowKey === row.rowKey
                                  ? {
                                      ...r,
                                      medicineId: nextMedId,
                                      estimatedHpp: nextMed ? getBaseHpp(nextMed) : 0,
                                    }
                                  : r
                              )
                            );
                          }}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                        >
                          {medicines.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} (Stok: {m.stockBase} {m.unitBase})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <input
                          required
                          type="number"
                          min={1}
                          value={row.orderQtyBase}
                          onChange={(e) =>
                            setPurchaseRows((prev) =>
                              prev.map((r) =>
                                r.rowKey === row.rowKey
                                  ? { ...r, orderQtyBase: Math.max(1, Number(e.target.value) || 1) }
                                  : r
                              )
                            )
                          }
                          placeholder={`Qty (${med?.unitBase || 'Pcs'})`}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-right tabular-nums"
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-2">
                        <input
                          required
                          type="number"
                          min={0}
                          value={row.estimatedHpp}
                          onChange={(e) =>
                            setPurchaseRows((prev) =>
                              prev.map((r) =>
                                r.rowKey === row.rowKey
                                  ? { ...r, estimatedHpp: Math.max(0, Number(e.target.value) || 0) }
                                  : r
                              )
                            )
                          }
                          placeholder="HPP / unit"
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-right tabular-nums"
                        />
                      </div>
                      <div className="col-span-10 sm:col-span-2 text-right font-semibold text-slate-900 dark:text-white tabular-nums">
                        {formatIDR(lineTotal)}
                      </div>
                      <div className="col-span-2 sm:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setPurchaseRows((prev) => prev.filter((r) => r.rowKey !== row.rowKey))
                          }
                          className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg cursor-pointer"
                          title="Hapus baris"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-slate-500 dark:text-slate-400">Total Estimasi Pembelian</div>
                <div className="text-lg font-display font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatIDR(purchaseDraftTotal)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPurchaseModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold cursor-pointer disabled:opacity-60"
                >
                  {submitting
                    ? 'Menyimpan...'
                    : editingPurchaseId
                      ? 'Simpan Perubahan'
                      : 'Simpan Pembelian'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ==================== CONFIRM DELETE SALE MODAL ==================== */}
      {deleteSaleTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Hapus Transaksi Penjualan?
            </h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Anda akan menghapus faktur{' '}
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {deleteSaleTarget.invoiceNo}
              </span>{' '}
              atas nama <span className="font-semibold">{deleteSaleTarget.patientName}</span> senilai{' '}
              <span className="font-semibold tabular-nums">
                {formatIDR(deleteSaleTarget.totalAmount)}
              </span>
              . Stok obat yang telah terpotong akan dikembalikan otomatis ke persediaan.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteSaleTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmDeleteSale}
                className="px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-semibold cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Menghapus...' : 'Ya, Hapus Penjualan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== CONFIRM PROCESS PURCHASE MODAL ==================== */}
      {processPurchaseTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Proses Transaksi Pembelian?
            </h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Memproses pembelian{' '}
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {processPurchaseTarget.poNumber}
              </span>{' '}
              dari <span className="font-semibold">{processPurchaseTarget.supplierName}</span> akan
              menambahkan stok produk ke inventori secara otomatis. Setelah diproses,{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                fitur edit akan otomatis terkunci
              </span>
              .
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProcessPurchaseTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmProcessPurchase}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold cursor-pointer disabled:opacity-60"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{submitting ? 'Memproses...' : 'Ya, Proses & Kunci Edit'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== CONFIRM DELETE PURCHASE MODAL ==================== */}
      {deletePurchaseTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Hapus Transaksi Pembelian?
            </h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Anda yakin ingin menghapus riwayat pembelian{' '}
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {deletePurchaseTarget.poNumber}
              </span>{' '}
              dari <span className="font-semibold">{deletePurchaseTarget.supplierName}</span>?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletePurchaseTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmDeletePurchase}
                className="px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-semibold cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Menghapus...' : 'Ya, Hapus Pembelian'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
