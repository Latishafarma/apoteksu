import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Barcode,
  CheckCircle2,
  CreditCard,
  FileText,
  Pencil,
  Plus,
  Printer,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/apiClient';
import { detectDrugInteractions, type DetectedInteractionAlert } from '../lib/drugInteractions';
import {
  formatDateID,
  formatIDR,
  formatMultiUnitStock,
  getTierUnitPrice,
  getUnitHpp,
  getUnitMultiplier,
} from '../lib/formatters';
import type {
  ClinicalCareRecord,
  DrugCategory,
  DrugInteractionRule,
  Medicine,
  ObatBatch,
  Patient,
  PrescriptionRecord,
  RxBundle,
  TransactionLineItem,
  TransactionRecord,
} from '../types/pharmacy';
import { InteractionAlertBanner } from './InteractionAlertBanner';
import { PrescriptionModal } from './PrescriptionModal';
import { CopyResepPrintModal } from './CopyResepPrintModal';
import { triggerSafePrint } from '../lib/printHelper';

export interface PosCartItem {
  medicine: Medicine;
  unitType: 'Box' | 'Strip' | 'Pcs';
  qty: number;
  discountPercent: number;
  isCrossSell: boolean;
  batchId?: number | null;
  batchNumber?: string;
  batchExpiryDate?: string;
}

interface PosModuleProps {
  medicines: Medicine[];
  categories: DrugCategory[];
  patients: Patient[];
  batches?: ObatBatch[];
  prescriptions: PrescriptionRecord[];
  rxBundles: RxBundle[];
  transactions: TransactionRecord[];
  clinicalRecords: ClinicalCareRecord[];
  interactionRules: DrugInteractionRule[];
  cashierName: string;
  queuedItems: { medicineId: number; qty: number; unitType: 'Box' | 'Strip' | 'Pcs'; isCrossSell: boolean }[];
  onClearQueuedItems: () => void;
  onTransactionCreated: (tx: TransactionRecord, options?: { allowNegativeStock?: boolean }) => void;
  onReceivablePaid: (tx: TransactionRecord) => void;
  onPatientCreated: (patient: Patient) => void;
  onPrescriptionSaved: (rx: PrescriptionRecord, isEdit: boolean) => void;
  onPrescriptionDeleted: (id: number) => void;
  onClinicalRecordCreated?: (rec: ClinicalCareRecord) => void;
  onEscalateInteraction: (alert: DetectedInteractionAlert, patientId: number | null) => void;
}

export function PosModule({
  medicines,
  patients,
  batches = [],
  prescriptions = [],
  transactions,
  clinicalRecords,
  interactionRules,
  cashierName,
  queuedItems,
  onClearQueuedItems,
  onTransactionCreated,
  onReceivablePaid,
  onPatientCreated,
  onPrescriptionSaved,
  onPrescriptionDeleted,
  onClinicalRecordCreated,
  onEscalateInteraction,
}: PosModuleProps) {
  const [subTab, setSubTab] = useState<'cashier' | 'prescriptions' | 'history' | 'receivables'>('cashier');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [sellByBatch, setSellByBatch] = useState(false);
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [priceTier, setPriceTier] = useState<'reguler' | 'klinik' | 'mitra'>('reguler');
  const [prescriptionType, setPrescriptionType] = useState<'Non-Resep' | 'Resep Dokter' | 'Swamedikasi'>('Non-Resep');
  const [doctorName, setDoctorName] = useState('');
  const [diagnosisIcd10, setDiagnosisIcd10] = useState('J06.9 - ISPA Akut');
  const [globalDiscountMode, setGlobalDiscountMode] = useState<'percent' | 'nominal'>('nominal');
  const [globalDiscountValue, setGlobalDiscountValue] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'Tunai' | 'QRIS' | 'Transfer Bank' | 'Debit/Kartu' | 'Piutang/Tempo'>('Tunai');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [dueDate, setDueDate] = useState<string>('2026-12-02');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [receiptModalTx, setReceiptModalTx] = useState<TransactionRecord | null>(null);
  const [showNewPatientModal, setShowNewPatientModal] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState({
    name: '',
    phone: '',
    memberTier: 'Reguler',
    allergies: 'Tidak ada riwayat alergi',
    chronicConditions: '-',
    receivableLimit: 500000,
  });
  const [serverInteractionAlerts, setServerInteractionAlerts] = useState<DetectedInteractionAlert[]>([]);
  const [payModalTx, setPayModalTx] = useState<TransactionRecord | null>(null);
  const [payInstallmentAmount, setPayInstallmentAmount] = useState<number>(0);

  // Rx Input, Riwayat Resep & Copy Resep state
  const [showRxModal, setShowRxModal] = useState(false);
  const [editingRx, setEditingRx] = useState<PrescriptionRecord | null>(null);
  const [activeAttachedRx, setActiveAttachedRx] = useState<PrescriptionRecord | null>(null);
  const [copyResepModalRx, setCopyResepModalRx] = useState<PrescriptionRecord | null>(null);
  const [rxSearchQuery, setRxSearchQuery] = useState('');
  const [rxStatusFilter, setRxStatusFilter] = useState<string>('Semua');
  const [rxDateFrom, setRxDateFrom] = useState('');
  const [rxDateTo, setRxDateTo] = useState('');
  const [confirmDeleteRxId, setConfirmDeleteRxId] = useState<number | null>(null);
  const [deletingRxId, setDeletingRxId] = useState<number | null>(null);

  // Absorb queued items sent from Swamedikasi consultation
  useEffect(() => {
    if (queuedItems.length === 0) return;
    setCart((prev) => {
      const next = [...prev];
      for (const q of queuedItems) {
        const med = medicines.find((m) => m.id === q.medicineId);
        if (!med) continue;
        const existingIdx = next.findIndex(
          (c) => c.medicine.id === med.id && c.unitType === q.unitType
        );
        if (existingIdx >= 0) {
          next[existingIdx] = { ...next[existingIdx], qty: next[existingIdx].qty + q.qty };
        } else {
          next.push({
            medicine: med,
            unitType: q.unitType,
            qty: q.qty,
            discountPercent: 0,
            isCrossSell: q.isCrossSell,
          });
        }
      }
      return next;
    });
    setPrescriptionType('Swamedikasi');
    setSubTab('cashier');
    onClearQueuedItems();
  }, [queuedItems, medicines, onClearQueuedItems]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  );

  // Sorted batches grouped by medicine ID (earliest expiry first)
  const batchesByMedId = useMemo(() => {
    const sorted = [...batches].sort(
      (a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.id - b.id
    );
    const map = new Map<number, ObatBatch[]>();
    for (const b of sorted) {
      const list = map.get(b.medicineId) ?? [];
      list.push(b);
      map.set(b.medicineId, list);
    }
    return map;
  }, [batches]);

  // Automatic FEFO (First Expired, First Out) priority batch lookup per medicine
  const fefoPriorityByMedId = useMemo(() => {
    const map = new Map<number, ObatBatch>();
    for (const [medId, list] of batchesByMedId.entries()) {
      const active = list.find((b) => b.qtyRemaining > 0);
      if (active) {
        map.set(medId, active);
      }
    }
    return map;
  }, [batchesByMedId]);

  // Sync existing cart items when toggling "Jual Sesuai Batch"
  useEffect(() => {
    if (sellByBatch) {
      setCart((prev) =>
        prev.map((c) => {
          if (c.batchId) return c;
          const fallback =
            fefoPriorityByMedId.get(c.medicine.id) ?? batchesByMedId.get(c.medicine.id)?.[0];
          if (!fallback) return c;
          return {
            ...c,
            batchId: fallback.id,
            batchNumber: fallback.batchNumber,
            batchExpiryDate: fallback.expiryDate,
          };
        })
      );
    } else {
      setCart((prev) =>
        prev.map((c) =>
          c.batchId
            ? { ...c, batchId: undefined, batchNumber: undefined, batchExpiryDate: undefined }
            : c
        )
      );
    }
  }, [sellByBatch, fefoPriorityByMedId, batchesByMedId]);

  // Auto-align tier when selecting Klinik/Mitra patient
  useEffect(() => {
    if (!selectedPatient) return;
    if (selectedPatient.memberTier === 'Klinik/Dokter') {
      setPriceTier('klinik');
    } else if (selectedPatient.memberTier === 'Mitra/Instansi') {
      setPriceTier('mitra');
    } else {
      setPriceTier('reguler');
    }
  }, [selectedPatient]);

  // Automated Drug Interaction cross-check (instant local + verified via backend)
  const localPatientHistoryDrugs = useMemo(() => {
    if (!selectedPatientId) return [];
    const list: { name: string }[] = [];
    clinicalRecords
      .filter((r) => r.patientId === selectedPatientId)
      .slice(0, 5)
      .forEach((r) => {
        r.ePrescriptionItems.forEach((rx) => list.push({ name: rx.medicineName }));
      });
    transactions
      .filter((t) => t.patientId === selectedPatientId)
      .slice(0, 5)
      .forEach((t) => {
        t.items.forEach((it) => list.push({ name: it.name }));
      });
    return list;
  }, [selectedPatientId, clinicalRecords, transactions]);

  const liveAlerts = useMemo(() => {
    const active = cart.map((c) => ({
      name: c.medicine.name,
      genericName: c.medicine.genericName,
    }));
    if (active.length === 0) return [];
    return detectDrugInteractions(active, localPatientHistoryDrugs, interactionRules);
  }, [cart, localPatientHistoryDrugs, interactionRules]);

  useEffect(() => {
    if (cart.length === 0) {
      setServerInteractionAlerts([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest<{ alerts: DetectedInteractionAlert[] }>(
          '/api/interactions/check',
          {
            method: 'POST',
            signal: controller.signal,
            body: JSON.stringify({
              items: cart.map((c) => ({
                name: c.medicine.name,
                genericName: c.medicine.genericName,
              })),
              patientId: selectedPatientId,
            }),
          }
        );
        setServerInteractionAlerts(res.alerts || []);
      } catch {
        // Fallback smoothly to liveAlerts if aborted
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [cart, selectedPatientId]);

  const activeAlerts = serverInteractionAlerts.length > 0 ? serverInteractionAlerts : liveAlerts;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchDropdownRef.current &&
        !searchDropdownRef.current.contains(event.target as Node)
      ) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  type SearchDropdownEntry =
    | {
        kind: 'batch';
        med: Medicine;
        batch: ObatBatch;
        matchedByBatch: boolean;
      }
    | {
        kind: 'medicine';
        med: Medicine;
        fefo: ObatBatch | null;
        matchedBatches: ObatBatch[];
      };

  const searchEntries = useMemo<SearchDropdownEntry[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const results: SearchDropdownEntry[] = [];

    for (const med of medicines) {
      const medMatches =
        med.name.toLowerCase().includes(q) ||
        med.genericName.toLowerCase().includes(q) ||
        med.sku.toLowerCase().includes(q) ||
        med.barcode.toLowerCase().includes(q) ||
        med.categoryName.toLowerCase().includes(q) ||
        med.classification.toLowerCase().includes(q);

      const medBatches = batchesByMedId.get(med.id) ?? [];
      const matchingBatches = medBatches.filter(
        (b) =>
          b.batchNumber.toLowerCase().includes(q) || b.rackLocation.toLowerCase().includes(q)
      );

      if (!medMatches && matchingBatches.length === 0) continue;

      if (sellByBatch) {
        const candidateBatches =
          matchingBatches.length > 0 && !medMatches ? matchingBatches : medBatches;
        const visibleBatches = allowNegativeStock
          ? candidateBatches
          : candidateBatches.filter((b) => b.qtyRemaining > 0);
        const batchesToRender =
          visibleBatches.length > 0 ? visibleBatches : candidateBatches;

        if (batchesToRender.length > 0) {
          for (const b of batchesToRender) {
            results.push({
              kind: 'batch',
              med,
              batch: b,
              matchedByBatch:
                b.batchNumber.toLowerCase().includes(q) ||
                b.rackLocation.toLowerCase().includes(q),
            });
          }
        } else {
          results.push({
            kind: 'medicine',
            med,
            fefo: null,
            matchedBatches: [],
          });
        }
      } else {
        results.push({
          kind: 'medicine',
          med,
          fefo: fefoPriorityByMedId.get(med.id) ?? null,
          matchedBatches: matchingBatches,
        });
      }
    }

    return results;
  }, [medicines, batchesByMedId, fefoPriorityByMedId, searchQuery, sellByBatch, allowNegativeStock]);

  const addToCart = (
    med: Medicine,
    unitType: 'Box' | 'Strip' | 'Pcs' = med.pcsPerStrip > 1 ? 'Strip' : 'Pcs',
    qty = 1,
    discountPercent = 0,
    isCrossSell = false,
    selectedBatch?: ObatBatch | null
  ) => {
    setFeedbackError(null);
    const medBatches = batchesByMedId.get(med.id) ?? [];
    const effectiveBatch =
      selectedBatch !== undefined
        ? selectedBatch
        : sellByBatch
          ? fefoPriorityByMedId.get(med.id) ?? medBatches[0] ?? null
          : null;

    if (!allowNegativeStock) {
      if (effectiveBatch) {
        if (effectiveBatch.qtyRemaining <= 0) {
          setFeedbackError(
            `Stok batch ${effectiveBatch.batchNumber} (${med.name}) habis. Aktifkan "Jual Stok < 0" untuk tetap menjual.`
          );
          return;
        }
      } else if (med.stockBase <= 0) {
        setFeedbackError(
          `Stok ${med.name} habis. Aktifkan "Jual Stok < 0" untuk tetap menjual.`
        );
        return;
      }
    }

    const targetBatchId = effectiveBatch?.id ?? null;

    setCart((prev) => {
      const idx = prev.findIndex(
        (c) =>
          c.medicine.id === med.id &&
          c.unitType === unitType &&
          (c.batchId ?? null) === targetBatchId
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [
        ...prev,
        {
          medicine: med,
          unitType,
          qty,
          discountPercent,
          isCrossSell,
          batchId: effectiveBatch ? effectiveBatch.id : undefined,
          batchNumber: effectiveBatch ? effectiveBatch.batchNumber : undefined,
          batchExpiryDate: effectiveBatch ? effectiveBatch.expiryDate : undefined,
        },
      ];
    });
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim().toLowerCase();
    if (!code) return;
    const match = medicines.find(
      (m) => m.barcode.toLowerCase() === code || m.sku.toLowerCase() === code
    );
    if (!match) {
      const batchMatch = batches.find((b) => b.batchNumber.toLowerCase() === code);
      if (batchMatch) {
        const medFromBatch = medicines.find((m) => m.id === batchMatch.medicineId);
        if (medFromBatch) {
          addToCart(
            medFromBatch,
            medFromBatch.pcsPerStrip > 1 ? 'Strip' : 'Pcs',
            1,
            0,
            false,
            sellByBatch ? batchMatch : undefined
          );
          setBarcodeInput('');
          return;
        }
      }
      setFeedbackError(`Barcode / SKU / No. Batch "${barcodeInput}" tidak ditemukan.`);
      return;
    }
    addToCart(match, match.pcsPerStrip > 1 ? 'Strip' : 'Pcs', 1);
    setBarcodeInput('');
  };

  const cartSummary = useMemo(() => {
    let subtotal = 0;
    let itemDiscounts = 0;
    let totalHpp = 0;

    const lineItems: TransactionLineItem[] = cart.map((c) => {
      const unitPrice = getTierUnitPrice(c.medicine, priceTier, c.unitType);
      const multiplier = getUnitMultiplier(c.medicine, c.unitType);
      const grossLine = unitPrice * c.qty;
      const lineDiscount = Math.round((grossLine * c.discountPercent) / 100);
      const lineTotal = Math.max(0, grossLine - lineDiscount);
      const hppUnit = getUnitHpp(c.medicine, c.unitType);

      subtotal += grossLine;
      itemDiscounts += lineDiscount;
      totalHpp += hppUnit * c.qty;

      return {
        medicineId: c.medicine.id,
        sku: c.medicine.sku,
        name: c.medicine.name,
        categoryName: c.medicine.categoryName,
        unitType: c.unitType,
        qty: c.qty,
        baseQtyDeducted: multiplier * c.qty,
        unitPrice,
        hppUnit,
        discount: lineDiscount,
        lineTotal,
        isCrossSell: c.isCrossSell,
        batchId: c.batchId ?? null,
        batchNumber: c.batchNumber,
        batchExpiryDate: c.batchExpiryDate,
      };
    });

    const afterItemDisc = Math.max(0, subtotal - itemDiscounts);
    const extraGlobalDiscount =
      globalDiscountMode === 'percent'
        ? Math.round((afterItemDisc * Math.min(100, Math.max(0, globalDiscountValue))) / 100)
        : Math.min(afterItemDisc, Math.max(0, globalDiscountValue));

    const totalDiscount = itemDiscounts + extraGlobalDiscount;
    const totalAmount = Math.max(0, subtotal - totalDiscount);
    const grossProfit = totalAmount - totalHpp;

    return {
      lineItems,
      subtotal,
      totalDiscount,
      totalAmount,
      totalHpp,
      grossProfit,
    };
  }, [cart, priceTier, globalDiscountMode, globalDiscountValue]);

  useEffect(() => {
    if (paymentMethod !== 'Piutang/Tempo') {
      setPaidAmount(cartSummary.totalAmount);
    }
  }, [cartSummary.totalAmount, paymentMethod]);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      setFeedbackError('Keranjang kasir masih kosong.');
      return;
    }
    if (paymentMethod === 'Piutang/Tempo' && !selectedPatient) {
      setFeedbackError('Pilih profil pasien / instansi terlebih dahulu untuk transaksi Piutang/Tempo.');
      return;
    }
    if (paymentMethod === 'Piutang/Tempo' && selectedPatient) {
      const newDebt = Math.max(0, cartSummary.totalAmount - paidAmount);
      if (
        selectedPatient.receivableLimit > 0 &&
        selectedPatient.receivableBalance + newDebt > selectedPatient.receivableLimit
      ) {
        setFeedbackError(
          `Plafon piutang ${selectedPatient.name} terlampaui (Sisa plafon: ${formatIDR(
            Math.max(0, selectedPatient.receivableLimit - selectedPatient.receivableBalance)
          )}).`
        );
        return;
      }
    }

    setSubmitting(true);
    setFeedbackError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const created = await apiRequest<TransactionRecord>('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedPatient?.id ?? null,
          patientName: selectedPatient?.name ?? 'Pasien Umum (Walk-in)',
          priceTier,
          paymentMethod,
          dueDate: paymentMethod === 'Piutang/Tempo' ? dueDate : null,
          paidAmount: paymentMethod === 'Piutang/Tempo' ? paidAmount : cartSummary.totalAmount,
          subtotal: cartSummary.subtotal,
          discountAmount: cartSummary.totalDiscount,
          taxAmount: 0,
          totalAmount: cartSummary.totalAmount,
          totalHpp: cartSummary.totalHpp,
          grossProfit: cartSummary.grossProfit,
          diagnosisIcd10,
          prescriptionType,
          doctorName: doctorName.trim() || '-',
          items: cartSummary.lineItems,
          cashierName,
          notes: notes.trim(),
          transactionDate: today,
          allowNegativeStock,
        }),
      });
      onTransactionCreated(created, { allowNegativeStock });
      setReceiptModalTx(created);
      setCart([]);
      setGlobalDiscountValue(0);
      setNotes('');
      setDoctorName('');
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Gagal menyelesaikan transaksi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientForm.name.trim()) return;
    try {
      const mrn = `LF-RM-${String(patients.length + 1).padStart(3, '0')}`;
      const created = await apiRequest<Patient>('/api/patients', {
        method: 'POST',
        body: JSON.stringify({
          mrn,
          name: newPatientForm.name.trim(),
          phone: newPatientForm.phone.trim(),
          birthDate: '1990-01-01',
          gender: newPatientForm.memberTier.includes('Klinik') || newPatientForm.memberTier.includes('Mitra') ? 'Instansi' : 'Laki-laki',
          address: '-',
          memberTier: newPatientForm.memberTier,
          allergies: newPatientForm.allergies,
          chronicConditions: newPatientForm.chronicConditions,
          receivableLimit: Number(newPatientForm.receivableLimit) || 0,
        }),
      });
      onPatientCreated(created);
      setSelectedPatientId(created.id);
      setShowNewPatientModal(false);
      setNewPatientForm({
        name: '',
        phone: '',
        memberTier: 'Reguler',
        allergies: 'Tidak ada riwayat alergi',
        chronicConditions: '-',
        receivableLimit: 500000,
      });
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Gagal mendaftarkan pasien baru.');
    }
  };

  const handlePayReceivable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalTx || payInstallmentAmount <= 0) return;
    try {
      const updated = await apiRequest<TransactionRecord>(
        `/api/transactions/${payModalTx.id}/payment`,
        {
          method: 'PATCH',
          body: JSON.stringify({ amount: payInstallmentAmount }),
        }
      );
      onReceivablePaid(updated);
      setPayModalTx(null);
      setPayInstallmentAmount(0);
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Gagal memproses pelunasan piutang.');
    }
  };

  const receivableTxs = useMemo(
    () => transactions.filter((t) => t.remainingBalance > 0 || t.paymentMethod === 'Piutang/Tempo'),
    [transactions]
  );

  const filteredPrescriptions = useMemo(() => {
    const q = rxSearchQuery.trim().toLowerCase();
    return prescriptions.filter((rx) => {
      if (rxStatusFilter !== 'Semua' && rx.status !== rxStatusFilter) return false;
      if (rxDateFrom && rx.rxDate < rxDateFrom) return false;
      if (rxDateTo && rx.rxDate > rxDateTo) return false;
      if (!q) return true;
      const itemsMatch = rx.items.some(
        (it) =>
          it.medicineName.toLowerCase().includes(q) ||
          it.latinFormatted.toLowerCase().includes(q) ||
          it.signaIndonesian.toLowerCase().includes(q)
      );
      return (
        rx.rxNumber.toLowerCase().includes(q) ||
        rx.patientName.toLowerCase().includes(q) ||
        rx.doctorName.toLowerCase().includes(q) ||
        rx.clinicName.toLowerCase().includes(q) ||
        itemsMatch
      );
    });
  }, [prescriptions, rxSearchQuery, rxStatusFilter, rxDateFrom, rxDateTo]);

  const loadPrescriptionToPos = (rx: PrescriptionRecord) => {
    setActiveAttachedRx(rx);
    setPrescriptionType('Resep Dokter');
    setDoctorName(rx.doctorName === '-' ? '' : rx.doctorName);
    if (rx.patientId) {
      setSelectedPatientId(rx.patientId);
    }
    for (const item of rx.items) {
      const med =
        (item.medicineId ? medicines.find((m) => m.id === item.medicineId) : null) ??
        medicines.find((m) =>
          m.name.toLowerCase().includes(item.medicineName.toLowerCase().split(' ')[0])
        );
      if (med && (allowNegativeStock || med.stockBase > 0)) {
        addToCart(med, 'Pcs', Math.max(1, item.quantity || 1));
      }
    }
    setSubTab('cashier');
  };

  const handleDeletePrescription = async (id: number) => {
    setDeletingRxId(id);
    setFeedbackError(null);
    try {
      await apiRequest(`/api/prescriptions/${id}`, { method: 'DELETE' });
      onPrescriptionDeleted(id);
      if (activeAttachedRx?.id === id) {
        setActiveAttachedRx(null);
      }
      setConfirmDeleteRxId(null);
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Gagal menghapus resep.');
    } finally {
      setDeletingRxId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Kasir &amp; POS Cerdas High-Conversion
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Pemindaian barcode instan · Paket bundling resep · Deteksi interaksi obat real-time
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('cashier')}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'cashier'
                ? 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            Meja Kasir POS
          </button>
          <button
            type="button"
            onClick={() => setSubTab('prescriptions')}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'prescriptions'
                ? 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            Riwayat Resep ({prescriptions.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('history')}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'history'
                ? 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            Riwayat Transaksi ({transactions.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('receivables')}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'receivables'
                ? 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            Manajemen Piutang ({receivableTxs.filter((t) => t.remainingBalance > 0).length})
          </button>
        </div>
      </div>

      {feedbackError && (
        <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-4">
          <span>{feedbackError}</span>
          <button
            type="button"
            onClick={() => setFeedbackError(null)}
            className="text-rose-500 hover:text-rose-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {subTab === 'cashier' && (
        <div className="space-y-5">
          {/* Full-width Barcode & Instant Search Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <form onSubmit={handleBarcodeSubmit} className="relative">
                <Barcode className="w-4 h-4 text-red-600 dark:text-red-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Scan Barcode / SKU / No. Batch lalu tekan Enter..."
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 font-mono"
                />
              </form>

              <div ref={searchDropdownRef} className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onFocus={() => {
                    if (searchQuery.trim().length > 0) setShowSearchDropdown(true);
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSearchQuery(val);
                    setShowSearchDropdown(val.trim().length > 0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setShowSearchDropdown(false);
                  }}
                  placeholder="Cari nama obat, zat aktif, golongan, atau No. Batch..."
                  className="w-full pl-10 pr-8 py-2.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setShowSearchDropdown(false);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
                    aria-label="Bersihkan pencarian"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {showSearchDropdown && searchQuery.trim().length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white dark:bg-slate-900 border border-red-200 dark:border-slate-700 rounded-xl shadow-xl max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {searchEntries.length > 0 ? (
                      searchEntries.slice(0, 16).map((entry) => {
                        const { med } = entry;
                        const unitType = med.pcsPerStrip > 1 ? 'Strip' : 'Pcs';
                        const unitPrice = getTierUnitPrice(med, priceTier, unitType);

                        if (entry.kind === 'batch') {
                          const { batch, matchedByBatch } = entry;
                          const batchOutOfStock = batch.qtyRemaining <= 0;
                          const disabled = batchOutOfStock && !allowNegativeStock;
                          return (
                            <button
                              key={`${med.id}-batch-${batch.id}`}
                              type="button"
                              disabled={disabled}
                              onClick={() => {
                                addToCart(med, unitType, 1, 0, false, batch);
                                setSearchQuery('');
                                setShowSearchDropdown(false);
                              }}
                              className="w-full text-left px-3.5 py-2.5 hover:bg-red-50/70 dark:hover:bg-slate-800/70 transition-colors flex items-start justify-between gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                    {med.name}
                                  </span>
                                  {matchedByBatch && (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 shrink-0">
                                      Cocok Batch
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-red-700 dark:text-red-400 tabular-nums">
                                  Batch: <span className="font-mono font-semibold">{batch.batchNumber}</span> · ED:{' '}
                                  <span className="font-medium">{formatDateID(batch.expiryDate)}</span> ·{' '}
                                  <span className="text-slate-500 dark:text-slate-400">{batch.rackLocation}</span>
                                </div>
                                <div className="text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                                  Stok Batch:{' '}
                                  <span
                                    className={
                                      batchOutOfStock
                                        ? 'text-rose-600 font-semibold'
                                        : 'font-semibold text-slate-800 dark:text-slate-200'
                                    }
                                  >
                                    {batch.qtyRemaining} {med.unitBase}
                                  </span>
                                  <span className="text-slate-400"> · Total Stok: {formatMultiUnitStock(med)}</span>
                                  {batchOutOfStock && allowNegativeStock && (
                                    <span className="text-amber-600 font-medium"> (Jual Minus)</span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right shrink-0 tabular-nums">
                                <div className="text-xs font-bold text-slate-900 dark:text-white">
                                  {formatIDR(unitPrice)}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  /{med.pcsPerStrip > 1 ? med.unitStrip : med.unitBase}
                                </div>
                              </div>
                            </button>
                          );
                        }

                        const { fefo, matchedBatches } = entry;
                        const outOfStock = med.stockBase <= 0;
                        const disabled = outOfStock && !allowNegativeStock;
                        const primaryBatchDisplay = matchedBatches[0] ?? fefo;
                        return (
                          <button
                            key={med.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              addToCart(med, unitType, 1);
                              setSearchQuery('');
                              setShowSearchDropdown(false);
                            }}
                            className="w-full text-left px-3.5 py-2.5 hover:bg-red-50/70 dark:hover:bg-slate-800/70 transition-colors flex items-start justify-between gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                  {med.name}
                                </span>
                                {matchedBatches.length > 0 && (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 shrink-0">
                                    Cocok Batch
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                                Stok:{' '}
                                <span
                                  className={
                                    outOfStock
                                      ? 'text-rose-600 font-semibold'
                                      : med.stockBase <= med.minStockBase
                                      ? 'text-amber-600 font-semibold'
                                      : 'font-medium'
                                  }
                                >
                                  {formatMultiUnitStock(med)}
                                </span>
                                {outOfStock && allowNegativeStock && (
                                  <span className="text-amber-600 font-medium"> (Mode Stok &lt; 0)</span>
                                )}
                              </div>
                              <div className="text-[11px] text-red-700 dark:text-red-400 tabular-nums">
                                {primaryBatchDisplay ? (
                                  <>
                                    {matchedBatches.length > 0 ? 'Batch:' : 'Batch FEFO:'}{' '}
                                    <span className="font-mono font-semibold">
                                      {primaryBatchDisplay.batchNumber}
                                    </span>{' '}
                                    · ED:{' '}
                                    <span className="font-medium">
                                      {formatDateID(primaryBatchDisplay.expiryDate)}
                                    </span>{' '}
                                    · Stok Batch: {primaryBatchDisplay.qtyRemaining} {med.unitBase}
                                    {matchedBatches.length > 1 && (
                                      <span className="text-slate-500">
                                        {' '}
                                        (+{matchedBatches.length - 1} batch lain)
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-slate-400">Batch: - · ED: -</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0 tabular-nums">
                              <div className="text-xs font-bold text-slate-900 dark:text-white">
                                {formatIDR(unitPrice)}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                /{med.pcsPerStrip > 1 ? med.unitStrip : med.unitBase}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3.5 py-3 text-xs text-slate-500 text-center">
                        Produk atau nomor batch "{searchQuery}" tidak ditemukan.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* POS Stock & Batch Mode Checkboxes */}
            <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs">
                <input
                  type="checkbox"
                  checked={allowNegativeStock}
                  onChange={(e) => setAllowNegativeStock(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-red-700 focus:ring-red-600 accent-red-700 cursor-pointer"
                />
                <span
                  className={
                    allowNegativeStock
                      ? 'font-semibold text-red-700 dark:text-red-400'
                      : 'font-medium text-slate-700 dark:text-slate-300'
                  }
                >
                  Jual Stok &lt; 0
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  (Izinkan penjualan saat stok kosong / minus)
                </span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs">
                <input
                  type="checkbox"
                  checked={sellByBatch}
                  onChange={(e) => setSellByBatch(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-red-700 focus:ring-red-600 accent-red-700 cursor-pointer"
                />
                <span
                  className={
                    sellByBatch
                      ? 'font-semibold text-red-700 dark:text-red-400'
                      : 'font-medium text-slate-700 dark:text-slate-300'
                  }
                >
                  Jual Sesuai Batch
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  (Pilih &amp; potong stok berdasarkan nomor batch spesifik)
                </span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Main Left Workspace: Interaction Alerts & Active Cart */}
            <div className="xl:col-span-8 space-y-4">
              {/* Automated Drug Interaction Alert Banner */}
              <InteractionAlertBanner
                alerts={activeAlerts}
                contextTitle="Peringatan Interaksi Obat (Resep & Riwayat Pasien)"
                onEscalateToSoap={(alert) => onEscalateInteraction(alert, selectedPatientId)}
              />

              {/* Cart Items */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                      Keranjang Kasir ({cart.length})
                    </h3>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Tier Aktif:{' '}
                      <strong className="text-red-700 dark:text-red-400 uppercase">{priceTier}</strong>
                    </span>
                    {cart.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCart([])}
                        className="text-xs text-rose-600 hover:underline cursor-pointer"
                      >
                        Kosongkan
                      </button>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[520px] overflow-y-auto">
                  {cart.map((item, idx) => {
                    const unitPrice = getTierUnitPrice(item.medicine, priceTier, item.unitType);
                    const lineNet = Math.round(
                      unitPrice * item.qty * (1 - item.discountPercent / 100)
                    );
                    return (
                      <div
                        key={`${item.medicine.id}-${item.unitType}-${idx}`}
                        className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                            {item.medicine.name}
                          </div>
                          <div className="text-xs text-slate-500 tabular-nums">
                            {formatIDR(unitPrice)} / {item.unitType}
                            {item.isCrossSell && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                {' '}· Cross-Sell
                              </span>
                            )}
                            {item.medicine.stockBase <= 0 && allowNegativeStock && (
                              <span className="text-amber-600 dark:text-amber-400 font-medium">
                                {' '}· Stok &lt; 0
                              </span>
                            )}
                          </div>
                          {(() => {
                            const medBatches = batchesByMedId.get(item.medicine.id) ?? [];
                            if (sellByBatch || item.batchId) {
                              return (
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <span className="text-[11px] font-medium text-red-700 dark:text-red-400">
                                    Batch:
                                  </span>
                                  {medBatches.length > 0 ? (
                                    <select
                                      value={item.batchId ?? ''}
                                      onChange={(e) => {
                                        const chosenId = Number(e.target.value);
                                        const chosen = medBatches.find((b) => b.id === chosenId);
                                        setCart((prev) =>
                                          prev.map((c, i) =>
                                            i === idx
                                              ? {
                                                  ...c,
                                                  batchId: chosen ? chosen.id : undefined,
                                                  batchNumber: chosen ? chosen.batchNumber : undefined,
                                                  batchExpiryDate: chosen ? chosen.expiryDate : undefined,
                                                }
                                              : c
                                          )
                                        );
                                      }}
                                      className="px-2 py-1 text-[11px] font-mono bg-red-50/60 dark:bg-slate-950 border border-red-200 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 tabular-nums"
                                    >
                                      <option value="">FEFO Otomatis</option>
                                      {medBatches.map((b) => (
                                        <option
                                          key={b.id}
                                          value={b.id}
                                          disabled={b.qtyRemaining <= 0 && !allowNegativeStock}
                                        >
                                          {b.batchNumber} · ED {formatDateID(b.expiryDate)} · Sisa {b.qtyRemaining}{' '}
                                          {item.medicine.unitBase} ({b.rackLocation})
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">
                                      Belum ada data batch terdaftar
                                    </span>
                                  )}
                                </div>
                              );
                            }

                            const fefo = fefoPriorityByMedId.get(item.medicine.id);
                            if (!fefo) return null;
                            return (
                              <div className="text-[11px] text-red-700 dark:text-red-400 tabular-nums mt-0.5">
                                Ambil Batch FEFO:{' '}
                                <span className="font-mono font-semibold">{fefo.batchNumber}</span> (
                                {fefo.rackLocation} · ED {formatDateID(fefo.expiryDate)})
                              </div>
                            );
                          })()}
                        </div>

                        <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 shrink-0">
                          <div className="flex items-center gap-2">
                            <select
                              value={item.unitType}
                              onChange={(e) => {
                                const nextUnit = e.target.value as 'Box' | 'Strip' | 'Pcs';
                                setCart((prev) =>
                                  prev.map((c, i) =>
                                    i === idx ? { ...c, unitType: nextUnit } : c
                                  )
                                );
                              }}
                              className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md"
                            >
                              <option value="Pcs">{item.medicine.unitBase}</option>
                              {item.medicine.pcsPerStrip > 1 && (
                                <option value="Strip">{item.medicine.unitStrip}</option>
                              )}
                              {item.medicine.stripsPerBox > 1 && (
                                <option value="Box">{item.medicine.unitBox}</option>
                              )}
                            </select>

                            <input
                              type="number"
                              min={1}
                              value={item.qty}
                              onChange={(e) => {
                                const qty = Math.max(1, Number(e.target.value) || 1);
                                setCart((prev) =>
                                  prev.map((c, i) => (i === idx ? { ...c, qty } : c))
                                );
                              }}
                              className="w-16 px-2 py-1.5 text-xs text-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md tabular-nums"
                            />

                            <div className="flex items-center gap-1 text-xs text-slate-500">
                              <span>Disc%</span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={item.discountPercent}
                                onChange={(e) => {
                                  const disc = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                                  setCart((prev) =>
                                    prev.map((c, i) =>
                                      i === idx ? { ...c, discountPercent: disc } : c
                                    )
                                  );
                                }}
                                className="w-14 px-2 py-1.5 text-xs text-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md tabular-nums"
                              />
                            </div>
                          </div>

                          <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums min-w-[96px] text-right">
                            {formatIDR(lineNet)}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setCart((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-slate-400 hover:text-rose-600 cursor-pointer p-1"
                            aria-label="Hapus item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {cart.length === 0 && (
                    <div className="p-10 text-center text-xs text-slate-500">
                      Scan barcode / SKU atau ketik nama obat pada kolom pencarian di atas untuk menambahkan item ke keranjang.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Sidebar Panel: Patient, Price Tier & Payment Checkout */}
            <div className="xl:col-span-4 space-y-4">
              {/* Patient / Member Selector & Price Tier */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Pasien / Member / Instansi
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRx(null);
                      setShowRxModal(true);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap shadow-sm"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Input Rx</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewPatientModal(true)}
                    className="text-xs font-medium text-red-700 dark:text-red-400 hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Pasien Baru</span>
                  </button>
                </div>
              </div>

              {activeAttachedRx && (
                <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-red-800 dark:text-red-300 truncate">
                      Resep Aktif: {activeAttachedRx.rxNumber} · {activeAttachedRx.patientName}
                    </div>
                    <div className="text-[11px] text-red-700/80 dark:text-red-400 truncate">
                      {activeAttachedRx.items.length} R/ · {activeAttachedRx.doctorName}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCopyResepModalRx(activeAttachedRx)}
                      className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-[11px] font-medium text-red-700 dark:text-red-300 cursor-pointer"
                    >
                      Copy Resep
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveAttachedRx(null)}
                      className="text-red-500 hover:text-red-700 cursor-pointer p-0.5"
                      aria-label="Lepas resep aktif"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <select
                value={selectedPatientId ?? ''}
                onChange={(e) =>
                  setSelectedPatientId(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
              >
                <option value="">Pasien Umum (Walk-in)</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.mrn} — {p.name} ({p.memberTier})
                  </option>
                ))}
              </select>

              {selectedPatient && (
                <div className="text-xs text-slate-600 dark:text-slate-300 pt-1 flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                  <span>Alergi: {selectedPatient.allergies}</span>
                  <span aria-hidden="true">·</span>
                  <span>Poin: {selectedPatient.points}</span>
                  <span aria-hidden="true">·</span>
                  <span>Piutang: {formatIDR(selectedPatient.receivableBalance)}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pt-1">
                {(
                  [
                    { key: 'reguler', label: 'Reguler' },
                    { key: 'klinik', label: 'Klinik/Dokter' },
                    { key: 'mitra', label: 'Mitra/Grosir' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setPriceTier(t.key)}
                    className={`py-2 px-2.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                      priceTier === t.key
                        ? 'bg-red-50 dark:bg-red-950/60 border-red-600 text-red-700 dark:text-red-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

              {/* Clinical Metadata, Discount & Payment Checkout */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Jenis Layanan</label>
                  <select
                    value={prescriptionType}
                    onChange={(e) =>
                      setPrescriptionType(
                        e.target.value as 'Non-Resep' | 'Resep Dokter' | 'Swamedikasi'
                      )
                    }
                    className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <option value="Non-Resep">Non-Resep (OTC)</option>
                    <option value="Resep Dokter">Resep Dokter</option>
                    <option value="Swamedikasi">Swamedikasi Apoteker</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Kelompok Diagnosa ICD-10</label>
                  <select
                    value={diagnosisIcd10}
                    onChange={(e) => setDiagnosisIcd10(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <option value="J06.9 - ISPA Akut">J06.9 - ISPA Akut</option>
                    <option value="I10 - Hipertensi Esensial">I10 - Hipertensi Esensial</option>
                    <option value="E11.9 - Diabetes Melitus Tipe 2">E11.9 - Diabetes Melitus</option>
                    <option value="K21.9 - Dispepsia & GERD">K21.9 - Dispepsia &amp; GERD</option>
                    <option value="I48.9 - Fibrilasi Atrium">I48.9 - Kardiovaskular</option>
                    <option value="Z00.0 - Umum / Suplemen">Z00.0 - Umum / Suplemen</option>
                  </select>
                </div>
              </div>

              {prescriptionType === 'Resep Dokter' && (
                <input
                  type="text"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  placeholder="Nama Dokter Penulis Resep (opsional)..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Diskon Tambahan</label>
                  <div className="flex">
                    <select
                      value={globalDiscountMode}
                      onChange={(e) =>
                        setGlobalDiscountMode(e.target.value as 'percent' | 'nominal')
                      }
                      className="px-2 py-2 text-xs bg-slate-100 dark:bg-slate-800 border border-r-0 border-slate-200 dark:border-slate-800 rounded-l-lg"
                    >
                      <option value="nominal">Rp</option>
                      <option value="percent">%</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={globalDiscountValue}
                      onChange={(e) => setGlobalDiscountValue(Number(e.target.value) || 0)}
                      className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-r-lg tabular-nums"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Metode Pembayaran</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(
                        e.target.value as
                          | 'Tunai'
                          | 'QRIS'
                          | 'Transfer Bank'
                          | 'Debit/Kartu'
                          | 'Piutang/Tempo'
                      )
                    }
                    className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <option value="Tunai">Tunai</option>
                    <option value="QRIS">QRIS</option>
                    <option value="Transfer Bank">Transfer Bank</option>
                    <option value="Debit/Kartu">Debit / Kartu</option>
                    <option value="Piutang/Tempo">Piutang / Tempo Instansi</option>
                  </select>
                </div>
              </div>

              {paymentMethod === 'Piutang/Tempo' && (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <div>
                    <label className="block text-xs text-amber-800 dark:text-amber-300 mb-1">
                      DP / Bayar Awal (Rp)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={cartSummary.totalAmount}
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-md tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-amber-800 dark:text-amber-300 mb-1">
                      Jatuh Tempo
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-md tabular-nums"
                    />
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs tabular-nums">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>{formatIDR(cartSummary.subtotal)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>Total Diskon</span>
                  <span>-{formatIDR(cartSummary.totalDiscount)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-slate-900 dark:text-white pt-1">
                  <span>Total Tagihan</span>
                  <span>{formatIDR(cartSummary.totalAmount)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCheckout}
                disabled={submitting || cart.length === 0}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <CreditCard className="w-4 h-4" />
                <span>
                  {submitting ? 'Memproses Transaksi...' : 'Selesaikan & Cetak Struk Thermal'}
                </span>
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Riwayat Resep Tab */}
      {subTab === 'prescriptions' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-5">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Cari Resep (No. Resep, Nama Pasien, Dokter, Nama Obat, atau Latin R/)
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={rxSearchQuery}
                    onChange={(e) => setRxSearchQuery(e.target.value)}
                    placeholder="Ketik no. resep, pasien, dokter, atau paracetamol..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Status Resep
                </label>
                <select
                  value={rxStatusFilter}
                  onChange={(e) => setRxStatusFilter(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="Semua">Semua Status</option>
                  <option value="Diserahkan">Diserahkan</option>
                  <option value="Iter/Sebagian">Iter/Sebagian</option>
                  <option value="Menunggu">Menunggu</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Dari Tanggal
                </label>
                <input
                  type="date"
                  value={rxDateFrom}
                  onChange={(e) => setRxDateFrom(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Sampai Tanggal
                </label>
                <input
                  type="date"
                  value={rxDateTo}
                  onChange={(e) => setRxDateTo(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>

              <div className="md:col-span-1 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingRx(null);
                    setShowRxModal(true);
                  }}
                  className="w-full py-2 px-2.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                  title="Input Rx Baru"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Rx</span>
                </button>
              </div>
            </div>

            {(rxSearchQuery || rxStatusFilter !== 'Semua' || rxDateFrom || rxDateTo) && (
              <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Menampilkan <strong>{filteredPrescriptions.length}</strong> dari {prescriptions.length} resep tersimpan
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRxSearchQuery('');
                    setRxStatusFilter('Semua');
                    setRxDateFrom('');
                    setRxDateTo('');
                  }}
                  className="text-red-700 dark:text-red-400 hover:underline cursor-pointer"
                >
                  Reset Filter Pencarian
                </button>
              </div>
            )}
          </div>

          {/* Prescriptions List */}
          <div className="space-y-3">
            {filteredPrescriptions.map((rx) => (
              <div
                key={rx.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-sm text-red-700 dark:text-red-400">
                        {rx.rxNumber}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {formatDateID(rx.rxDate)}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900">
                        {rx.iterFlag}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                          rx.status === 'Diserahkan'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : rx.status === 'Iter/Sebagian'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {rx.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                      <span>
                        <strong>Pro:</strong> {rx.patientName}
                      </span>
                      <span>·</span>
                      <span>
                        Umur: {rx.ageLabel || (rx.ageYears ? `${rx.ageYears} Thn` : '-')}
                      </span>
                      {rx.birthDate && (
                        <>
                          <span>·</span>
                          <span>Lahir: {formatDateID(rx.birthDate)}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>BB: {rx.weightKg ? `${rx.weightKg} kg` : '-'}</span>
                      <span>·</span>
                      <span>
                        Dokter: <strong>{rx.doctorName}</strong> ({rx.clinicName || '-'})
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons: Copy Resep, Load POS, Edit, Delete */}
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCopyResepModalRx(rx)}
                      className="px-2.5 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cetak Copy Resep</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => loadPrescriptionToPos(rx)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Ke Kasir</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRx(rx);
                        setShowRxModal(true);
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    {confirmDeleteRxId === rx.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={deletingRxId === rx.id}
                          onClick={() => handleDeletePrescription(rx.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          {deletingRxId === rx.id ? '...' : 'Ya, Hapus'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteRxId(null)}
                          className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteRxId(rx.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Latin Rx Lines */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {rx.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 flex items-start justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-semibold text-slate-900 dark:text-white">
                          {item.latinFormatted}
                        </div>
                        {item.signaIndonesian && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Bahasa Indonesia: {item.signaIndonesian}
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] italic font-semibold text-red-700 dark:text-red-400 shrink-0">
                        {item.deturStatus}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {filteredPrescriptions.length === 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-xs text-slate-500 space-y-2">
                <p>Tidak ada data resep yang sesuai dengan filter pencarian.</p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingRx(null);
                    setShowRxModal(true);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-red-700 text-white font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Input Resep Baru</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History Tab */}
      {subTab === 'history' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60">
                  <th className="py-3 px-4 font-semibold">No. Invoice</th>
                  <th className="py-3 px-4 font-semibold">Tanggal</th>
                  <th className="py-3 px-4 font-semibold">Pasien / Instansi</th>
                  <th className="py-3 px-4 font-semibold">Diagnosa ICD-10</th>
                  <th className="py-3 px-4 font-semibold">Metode</th>
                  <th className="py-3 px-4 font-semibold text-right">Total</th>
                  <th className="py-3 px-4 font-semibold text-right">Laba Kotor</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono font-medium text-red-700 dark:text-red-400">
                      {tx.invoiceNo}
                    </td>
                    <td className="py-3 px-4 tabular-nums text-slate-600 dark:text-slate-300">
                      {formatDateID(tx.transactionDate)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {tx.patientName}
                      </div>
                      <div className="text-slate-500">
                        {tx.prescriptionType} · {tx.items.length} item
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {tx.diagnosisIcd10}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          tx.paymentStatus === 'Lunas'
                            ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                            : 'text-amber-700 dark:text-amber-400 font-medium'
                        }
                      >
                        {tx.paymentMethod} ({tx.paymentStatus})
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold tabular-nums">
                      {formatIDR(tx.totalAmount)}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-700 dark:text-emerald-400 font-medium tabular-nums">
                      {formatIDR(tx.grossProfit)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setReceiptModalTx(tx)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Struk</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Receivables / Piutang Tab */}
      {subTab === 'receivables' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-600" />
              <h3 className="font-display font-semibold text-sm">
                Daftar Piutang Pasien, Karyawan &amp; Kerjasama Instansi
              </h3>
            </div>
            <span className="text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-400">
              Total Piutang Berjalan:{' '}
              {formatIDR(receivableTxs.reduce((acc, t) => acc + t.remainingBalance, 0))}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50 dark:bg-slate-950/60">
                  <th className="py-3 px-4 font-semibold">Invoice</th>
                  <th className="py-3 px-4 font-semibold">Pasien / Instansi</th>
                  <th className="py-3 px-4 font-semibold">Jatuh Tempo</th>
                  <th className="py-3 px-4 font-semibold text-right">Total Tagihan</th>
                  <th className="py-3 px-4 font-semibold text-right">Sudah Dibayar</th>
                  <th className="py-3 px-4 font-semibold text-right">Sisa Piutang</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {receivableTxs.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-3 px-4 font-mono">{tx.invoiceNo}</td>
                    <td className="py-3 px-4 font-medium">{tx.patientName}</td>
                    <td className="py-3 px-4 tabular-nums">
                      {tx.dueDate ? formatDateID(tx.dueDate) : '-'}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      {formatIDR(tx.totalAmount)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatIDR(tx.paidAmount)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-bold text-amber-700 dark:text-amber-400">
                      {formatIDR(tx.remainingBalance)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {tx.remainingBalance > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPayModalTx(tx);
                            setPayInstallmentAmount(tx.remainingBalance);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-medium cursor-pointer"
                        >
                          Catat Pembayaran
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Lunas
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Thermal Receipt Modal */}
      {receiptModalTx && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h4 className="font-display font-semibold text-sm">Struk Thermal 80mm</h4>
              <button
                type="button"
                onClick={() => setReceiptModalTx(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div
              id="thermal-receipt-print"
              className="p-6 font-mono text-xs space-y-3 bg-white text-slate-900"
            >
              <div className="text-center border-b border-dashed border-slate-300 pb-3">
                <div className="font-bold text-sm">APOTEK LATISHA FARMA</div>
                <div>Clinical &amp; Retail Pharmacy (Enterprise)</div>
                <div>SIPA: 446/APT-LF/2026 · Telp: (021) 789-4410</div>
              </div>
              <div className="space-y-0.5 border-b border-dashed border-slate-300 pb-2 tabular-nums">
                <div className="flex justify-between">
                  <span>No: {receiptModalTx.invoiceNo}</span>
                  <span>{receiptModalTx.transactionDate}</span>
                </div>
                <div>Pasien: {receiptModalTx.patientName}</div>
                <div>Kasir: {receiptModalTx.cashierName}</div>
                <div>Layanan: {receiptModalTx.prescriptionType}</div>
              </div>
              <div className="space-y-2 border-b border-dashed border-slate-300 pb-3">
                {receiptModalTx.items.map((it, idx) => (
                  <div key={idx}>
                    <div className="font-semibold">{it.name}</div>
                    {it.batchNumber && (
                      <div className="text-[10px] text-slate-500">
                        Batch: {it.batchNumber}
                        {it.batchExpiryDate ? ` · ED ${it.batchExpiryDate}` : ''}
                      </div>
                    )}
                    <div className="flex justify-between tabular-nums">
                      <span>
                        {it.qty} {it.unitType} x {formatIDR(it.unitPrice)}
                      </span>
                      <span>{formatIDR(it.lineTotal)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-1 tabular-nums">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatIDR(receiptModalTx.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Diskon</span>
                  <span>-{formatIDR(receiptModalTx.discountAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm pt-1">
                  <span>TOTAL</span>
                  <span>{formatIDR(receiptModalTx.totalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bayar ({receiptModalTx.paymentMethod})</span>
                  <span>{formatIDR(receiptModalTx.paidAmount)}</span>
                </div>
                {receiptModalTx.remainingBalance > 0 && (
                  <div className="flex justify-between font-bold">
                    <span>Sisa Piutang</span>
                    <span>{formatIDR(receiptModalTx.remainingBalance)}</span>
                  </div>
                )}
              </div>
              <div className="text-center border-t border-dashed border-slate-300 pt-3 text-[11px]">
                <div>Semoga lekas sembuh. Konsultasi gratis Apoteker!</div>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReceiptModalTx(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() =>
                  triggerSafePrint({
                    elementId: 'thermal-receipt-print',
                    documentTitle: `Struk-${receiptModalTx.invoiceNo}`,
                    filename: `Struk-${receiptModalTx.invoiceNo}`,
                  })
                }
                className="px-4 py-2 text-xs font-medium rounded-lg bg-red-700 hover:bg-red-800 text-white flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Struk Thermal</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Patient Modal */}
      {showNewPatientModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreatePatient}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-display font-bold text-base">Registrasi Pasien / Member Baru</h4>
              <button
                type="button"
                onClick={() => setShowNewPatientModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Nama Lengkap / Instansi</label>
                <input
                  required
                  type="text"
                  value={newPatientForm.name}
                  onChange={(e) => setNewPatientForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">No. Telepon / WA</label>
                  <input
                    type="text"
                    value={newPatientForm.phone}
                    onChange={(e) => setNewPatientForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Kategori Member</label>
                  <select
                    value={newPatientForm.memberTier}
                    onChange={(e) =>
                      setNewPatientForm((p) => ({ ...p, memberTier: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950"
                  >
                    <option value="Reguler">Reguler</option>
                    <option value="Gold">Gold</option>
                    <option value="Klinik/Dokter">Klinik/Dokter</option>
                    <option value="Mitra/Instansi">Mitra/Instansi</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium mb-1">Riwayat Alergi Obat</label>
                <input
                  type="text"
                  value={newPatientForm.allergies}
                  onChange={(e) =>
                    setNewPatientForm((p) => ({ ...p, allergies: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Plafon Piutang / Tempo (Rp)</label>
                <input
                  type="number"
                  min={0}
                  value={newPatientForm.receivableLimit}
                  onChange={(e) =>
                    setNewPatientForm((p) => ({
                      ...p,
                      receivableLimit: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950 tabular-nums"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewPatientModal(false)}
                className="px-4 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium rounded-lg bg-red-700 hover:bg-red-800 text-white cursor-pointer"
              >
                Simpan Profil Pasien
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pay Receivable Modal */}
      {payModalTx && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handlePayReceivable}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4"
          >
            <h4 className="font-display font-bold text-base">Pembayaran Piutang</h4>
            <p className="text-xs text-slate-500">
              {payModalTx.invoiceNo} · {payModalTx.patientName} (Sisa:{' '}
              {formatIDR(payModalTx.remainingBalance)})
            </p>
            <div>
              <label className="block text-xs font-medium mb-1">Nominal Pembayaran (Rp)</label>
              <input
                type="number"
                required
                min={1}
                max={payModalTx.remainingBalance}
                value={payInstallmentAmount}
                onChange={(e) => setPayInstallmentAmount(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950 tabular-nums"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayModalTx(null)}
                className="px-4 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                Simpan Pembayaran
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Rx Input / Edit Modal */}
      <PrescriptionModal
        open={showRxModal}
        editingRx={editingRx}
        patients={patients}
        medicines={medicines}
        interactionRules={interactionRules}
        clinicalRecords={clinicalRecords}
        transactions={transactions}
        initialPatientId={selectedPatientId}
        pharmacistName={cashierName}
        onClose={() => {
          setShowRxModal(false);
          setEditingRx(null);
        }}
        onSaved={(saved, isEdit) => {
          onPrescriptionSaved(saved, isEdit);
          if (!isEdit) {
            setActiveAttachedRx(saved);
            setPrescriptionType('Resep Dokter');
            if (saved.doctorName && saved.doctorName !== '-') {
              setDoctorName(saved.doctorName);
            }
          } else if (activeAttachedRx?.id === saved.id) {
            setActiveAttachedRx(saved);
          }
        }}
        onSaveAndLoadToPos={(saved) => loadPrescriptionToPos(saved)}
        onClinicalRecordCreated={onClinicalRecordCreated}
      />

      {/* Copy Resep Print Modal */}
      <CopyResepPrintModal
        prescription={copyResepModalRx}
        onClose={() => setCopyResepModalRx(null)}
      />
    </div>
  );
}
