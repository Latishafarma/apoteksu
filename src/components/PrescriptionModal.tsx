import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookmarkCheck,
  CheckCircle2,
  FileText,
  FileWarning,
  Info,
  Plus,
  Search,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/apiClient';
import {
  detectDrugInteractions,
  type CandidateDrugInput,
  type DetectedInteractionAlert,
} from '../lib/drugInteractions';
import {
  calculateAgeFromBirthDate,
  calculateBirthDateFromAge,
  DEFAULT_PHARMACY_HEADER,
  formatPrescriptionLineLatin,
  parseQuickIndonesianRx,
  toRomanNumeral,
} from '../lib/rxLatinTranslator';
import type {
  ClinicalCareRecord,
  DrugInteractionRule,
  EPrescriptionItem,
  Medicine,
  Patient,
  PrescriptionHeaderInfo,
  PrescriptionRecord,
  PrescriptionRxItem,
  TransactionRecord,
} from '../types/pharmacy';

interface PrescriptionModalProps {
  open: boolean;
  editingRx: PrescriptionRecord | null;
  patients: Patient[];
  medicines: Medicine[];
  interactionRules?: DrugInteractionRule[];
  clinicalRecords?: ClinicalCareRecord[];
  transactions?: TransactionRecord[];
  initialPatientId: number | null;
  pharmacistName: string;
  onClose: () => void;
  onSaved: (rx: PrescriptionRecord, isEdit: boolean) => void;
  onSaveAndLoadToPos?: (rx: PrescriptionRecord) => void;
  onClinicalRecordCreated?: (rec: ClinicalCareRecord) => void;
}

const EMPTY_RX_ITEM: PrescriptionRxItem = {
  medicineId: null,
  rawInput: '',
  medicineName: '',
  quantity: 10,
  quantityRoman: 'X',
  dosageForm: 'tab',
  signaIndonesian: '',
  latinFormatted: '',
  deturStatus: 'det orig',
};

export function PrescriptionModal({
  open,
  editingRx,
  patients,
  medicines,
  interactionRules = [],
  clinicalRecords = [],
  transactions = [],
  initialPatientId,
  pharmacistName,
  onClose,
  onSaved,
  onSaveAndLoadToPos,
  onClinicalRecordCreated,
}: PrescriptionModalProps) {
  const [rxNumber, setRxNumber] = useState('');
  const [rxDate, setRxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientName, setPatientName] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [ageYears, setAgeYears] = useState<string>('');
  const [ageLabel, setAgeLabel] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [allergies, setAllergies] = useState('Tidak ada riwayat alergi');

  const [doctorName, setDoctorName] = useState('');
  const [doctorSip, setDoctorSip] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [iterFlag, setIterFlag] = useState('Non-Iter');
  const [status, setStatus] = useState<'Menunggu' | 'Diserahkan' | 'Iter/Sebagian'>('Diserahkan');
  const [notes, setNotes] = useState('');
  const [pharmacyHeader, setPharmacyHeader] = useState<PrescriptionHeaderInfo>(
    DEFAULT_PHARMACY_HEADER
  );
  const [showHeaderEditor, setShowHeaderEditor] = useState(false);

  const [items, setItems] = useState<PrescriptionRxItem[]>([{ ...EMPTY_RX_ITEM }]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Drug Interaction Check state inside Form Input Resep
  const [showInteractionPanel, setShowInteractionPanel] = useState(false);
  const [detectedInteractions, setDetectedInteractions] = useState<DetectedInteractionAlert[]>([]);
  const [checkedDrugNames, setCheckedDrugNames] = useState<string[]>([]);
  const [savingInteractionSoap, setSavingInteractionSoap] = useState(false);
  const [interactionSavedSuccess, setInteractionSavedSuccess] = useState<string | null>(null);
  const [openMedSearchIdx, setOpenMedSearchIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setShowInteractionPanel(false);
    setDetectedInteractions([]);
    setCheckedDrugNames([]);
    setInteractionSavedSuccess(null);
    setOpenMedSearchIdx(null);
    if (editingRx) {
      setRxNumber(editingRx.rxNumber);
      setRxDate(editingRx.rxDate);
      setPatientId(editingRx.patientId);
      setPatientName(editingRx.patientName);
      setWeightKg(editingRx.weightKg);
      setBirthDate(editingRx.birthDate);
      setAgeYears(editingRx.ageYears ? String(editingRx.ageYears) : '');
      setAgeLabel(editingRx.ageLabel || (editingRx.ageYears ? `${editingRx.ageYears} Thn` : ''));
      setPatientPhone(editingRx.patientPhone);
      setPatientAddress(editingRx.patientAddress);
      setAllergies(editingRx.allergies || 'Tidak ada riwayat alergi');
      setDoctorName(editingRx.doctorName === '-' ? '' : editingRx.doctorName);
      setDoctorSip(editingRx.doctorSip === '-' ? '' : editingRx.doctorSip);
      setClinicName(editingRx.clinicName === '-' ? '' : editingRx.clinicName);
      setIterFlag(editingRx.iterFlag || 'Non-Iter');
      setStatus((editingRx.status as 'Menunggu' | 'Diserahkan' | 'Iter/Sebagian') || 'Diserahkan');
      setNotes(editingRx.notes || '');
      setPharmacyHeader(editingRx.pharmacyHeader || DEFAULT_PHARMACY_HEADER);
      setItems(
        editingRx.items.length > 0
          ? editingRx.items.map((it) => ({ ...it }))
          : [{ ...EMPTY_RX_ITEM }]
      );
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    setRxNumber(`RX-LF-${today.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 899)}`);
    setRxDate(today);
    const matchedPatient = patients.find((p) => p.id === initialPatientId) ?? null;
    if (matchedPatient) {
      setPatientId(matchedPatient.id);
      setPatientName(matchedPatient.name);
      setBirthDate(matchedPatient.birthDate || '');
      const calc = calculateAgeFromBirthDate(matchedPatient.birthDate || '');
      setAgeYears(calc ? String(calc.years) : '');
      setAgeLabel(calc ? calc.label : '');
      setPatientPhone(matchedPatient.phone || '');
      setPatientAddress(matchedPatient.address || '');
      setAllergies(matchedPatient.allergies || 'Tidak ada riwayat alergi');
    } else {
      setPatientId(null);
      setPatientName('');
      setBirthDate('');
      setAgeYears('');
      setAgeLabel('');
      setPatientPhone('');
      setPatientAddress('');
      setAllergies('Tidak ada riwayat alergi');
    }
    setWeightKg('');
    setDoctorName('');
    setDoctorSip('');
    setClinicName('');
    setIterFlag('Non-Iter');
    setStatus('Diserahkan');
    setNotes('');
    setPharmacyHeader(DEFAULT_PHARMACY_HEADER);
    setShowHeaderEditor(false);
    setItems([{ ...EMPTY_RX_ITEM }]);
  }, [open, editingRx, initialPatientId, patients]);

  if (!open) return null;

  const handleSelectPatient = (idStr: string) => {
    if (!idStr) {
      setPatientId(null);
      return;
    }
    const found = patients.find((p) => p.id === Number(idStr));
    if (!found) return;
    setPatientId(found.id);
    setPatientName(found.name);
    setPatientPhone(found.phone || '');
    setPatientAddress(found.address || '');
    setAllergies(found.allergies || 'Tidak ada riwayat alergi');
    if (found.birthDate) {
      setBirthDate(found.birthDate);
      const calc = calculateAgeFromBirthDate(found.birthDate);
      if (calc) {
        setAgeYears(String(calc.years));
        setAgeLabel(calc.label);
      }
    }
  };

  // Bidirectional synchronization: Birth Date -> Age
  const handleBirthDateChange = (val: string) => {
    setBirthDate(val);
    if (!val) {
      setAgeYears('');
      setAgeLabel('');
      return;
    }
    const calc = calculateAgeFromBirthDate(val);
    if (calc) {
      setAgeYears(String(calc.years));
      setAgeLabel(calc.label);
    }
  };

  // Bidirectional synchronization: Age -> Birth Date
  const handleAgeChange = (val: string) => {
    setAgeYears(val);
    if (val === '') {
      setAgeLabel('');
      return;
    }
    const num = Number(val);
    if (Number.isFinite(num) && num >= 0 && num <= 130) {
      const approxDob = calculateBirthDateFromAge(num, birthDate);
      setBirthDate(approxDob);
      setAgeLabel(`${Math.round(num)} Thn`);
    }
  };

  const updateStructuredField = (
    idx: number,
    patch: Partial<PrescriptionRxItem>,
    recomputeLatin = true
  ) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const merged = { ...item, ...patch };
        merged.quantityRoman = toRomanNumeral(merged.quantity || 1);
        if (recomputeLatin) {
          merged.latinFormatted = formatPrescriptionLineLatin({
            medicineName: merged.medicineName,
            quantity: merged.quantity,
            dosageForm: merged.dosageForm,
            signaIndonesian: merged.signaIndonesian,
          });
        }
        return merged;
      })
    );
  };

  const handleSelectMasterMedicine = (idx: number, medIdStr: string) => {
    if (!medIdStr) {
      updateStructuredField(idx, { medicineId: null }, false);
      return;
    }
    const med = medicines.find((m) => m.id === Number(medIdStr));
    if (!med) return;
    const formHint =
      med.unitBase.toLowerCase().includes('kapsul')
        ? 'caps'
        : med.unitBase.toLowerCase().includes('botol') || med.unitBase.toLowerCase().includes('sirup')
        ? 'cth'
        : med.unitBase.toLowerCase().includes('tube')
        ? 'u.e.'
        : 'tab';
    updateStructuredField(idx, {
      medicineId: med.id,
      medicineName: med.name,
      dosageForm: formHint,
    });
  };

  const handleCheckInteractions = () => {
    setErrorMsg(null);
    setInteractionSavedSuccess(null);

    const candidateDrugs: CandidateDrugInput[] = [];
    for (const it of items) {
      const parsedName =
        it.medicineName.trim() ||
        (it.rawInput.trim() ? parseQuickIndonesianRx(it.rawInput).medicineName.trim() : '');
      if (!parsedName) continue;

      const linkedMed =
        (it.medicineId ? medicines.find((m) => m.id === it.medicineId) : null) ??
        medicines.find(
          (m) =>
            m.name.toLowerCase().includes(parsedName.toLowerCase()) ||
            parsedName.toLowerCase().includes(m.name.toLowerCase().split(' ')[0]) ||
            (m.genericName &&
              parsedName.toLowerCase().includes(m.genericName.toLowerCase().split(' ')[0]))
        ) ??
        null;

      candidateDrugs.push({
        name: linkedMed ? linkedMed.name : parsedName,
        genericName: linkedMed?.genericName || parsedName,
      });
    }

    // Also include ongoing therapy history for selected patient if available
    const historyDrugs: CandidateDrugInput[] = [];
    const targetNameLower = patientName.trim().toLowerCase();
    for (const rec of clinicalRecords) {
      const samePatient =
        (patientId && rec.patientId === patientId) ||
        (targetNameLower && rec.patientName.trim().toLowerCase() === targetNameLower);
      if (samePatient) {
        for (const rxItem of rec.ePrescriptionItems || []) {
          const med = medicines.find(
            (m) => m.name.toLowerCase() === rxItem.medicineName.toLowerCase()
          );
          historyDrugs.push({
            name: rxItem.medicineName,
            genericName: med?.genericName || rxItem.medicineName,
          });
        }
      }
    }
    for (const tx of transactions) {
      const samePatient =
        (patientId && tx.patientId === patientId) ||
        (targetNameLower && tx.patientName.trim().toLowerCase() === targetNameLower);
      if (samePatient) {
        for (const txItem of tx.items || []) {
          const med = medicines.find((m) => m.id === txItem.medicineId);
          historyDrugs.push({
            name: txItem.name,
            genericName: med?.genericName || txItem.name,
          });
        }
      }
    }

    const alerts =
      candidateDrugs.length > 0
        ? detectDrugInteractions(candidateDrugs, historyDrugs, interactionRules)
        : [];

    setCheckedDrugNames(candidateDrugs.map((d) => d.name));
    setDetectedInteractions(alerts);
    setShowInteractionPanel(true);
  };

  const handleSaveInteractionToSoap = async () => {
    if (checkedDrugNames.length === 0) {
      setErrorMsg('Masukkan minimal 1 obat pada resep sebelum menyimpan riwayat interaksi.');
      return;
    }
    setSavingInteractionSoap(true);
    setErrorMsg(null);
    setInteractionSavedSuccess(null);
    try {
      const hasMajor = detectedInteractions.some((a) => a.severity === 'Major');
      const hasAny = detectedInteractions.length > 0;
      const eRxList: EPrescriptionItem[] = items
        .map((it) => {
          const medName =
            it.medicineName.trim() ||
            (it.rawInput.trim() ? parseQuickIndonesianRx(it.rawInput).medicineName.trim() : '');
          return {
            medicineName: medName,
            dosage: `${it.quantity || 1} ${it.dosageForm || 'tab'}`,
            frequency: it.signaIndonesian.trim() || 'Sesuai etiket resep',
            duration: iterFlag || 'Terapi Resep',
            adherenceStatus: (hasMajor ? 'Perlu Pantauan' : 'Patuh') as
              | 'Patuh'
              | 'Perlu Pantauan'
              | 'Putus Obat',
          };
        })
        .filter((it) => it.medicineName.length > 0);

      const drpSummary = hasAny
        ? detectedInteractions
            .map(
              (a) =>
                `[${a.severity.toUpperCase()}] ${a.drugA} + ${a.drugB}: ${a.clinicalEffect} (Mekanisme: ${a.mechanism}${
                  a.literature ? ` | Literatur: ${a.literature}` : ''
                })`
            )
            .join(' | ')
        : `Skrining interaksi untuk (${checkedDrugNames.join(', ')}) dinyatakan aman / tidak ditemukan interaksi berisiko.`;

      const planSummary = hasAny
        ? detectedInteractions
            .map((a) => `${a.drugA} + ${a.drugB}: ${a.managementAdvice}`)
            .join(' ; ')
        : 'Lanjutkan pelayanan resep sesuai dosis dan berikan konseling kepatuhan minum obat.';

      const followUp = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

      const created = await apiRequest<ClinicalCareRecord>('/api/clinical-records', {
        method: 'POST',
        body: JSON.stringify({
          patientId: patientId ?? null,
          patientName: patientName.trim() || 'Pasien Resep Umum',
          pharmacistName: pharmacistName || pharmacyHeader.apaName,
          visitDate: rxDate || new Date().toISOString().slice(0, 10),
          subjective: `Skrining Interaksi Resep ${rxNumber}${
            doctorName.trim() ? ` (Dokter: ${doctorName.trim()})` : ''
          }: ${checkedDrugNames.join(', ')}`,
          objective: `BB: ${weightKg ? `${weightKg} kg` : '-'} · Umur: ${
            ageLabel || (ageYears ? `${ageYears} Thn` : '-')
          } · Alergi: ${allergies || 'Tidak ada riwayat alergi'}`,
          assessment: hasAny ? 'Interaksi Obat' : 'Kepatuhan & Skrining Resep',
          drpDetails: drpSummary,
          plan: planSummary,
          interventionTarget: hasMajor ? 'Dokter Penulis Resep' : 'Pasien',
          ePrescriptionItems: eRxList,
          adherenceScore: hasMajor ? 80 : hasAny ? 85 : 95,
          followUpDate: followUp,
          status: hasAny ? 'Perlu Follow-Up' : 'Selesai',
        }),
      });

      if (onClinicalRecordCreated) {
        onClinicalRecordCreated(created);
      }
      setInteractionSavedSuccess(
        'Riwayat interaksi berhasil disimpan otomatis ke Adherence Monitoring & Catatan SOAP.'
      );
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan riwayat interaksi ke Adherence Monitoring & Catatan SOAP.'
      );
    } finally {
      setSavingInteractionSoap(false);
    }
  };

  const submitPrescription = async (loadToPos: boolean) => {
    setErrorMsg(null);
    if (!patientName.trim()) {
      setErrorMsg('Nama pasien wajib diisi.');
      return;
    }
    const validItems = items
      .map((it) => ({
        ...it,
        medicineName: it.medicineName.trim(),
        latinFormatted:
          it.latinFormatted.trim() ||
          formatPrescriptionLineLatin({
            medicineName: it.medicineName,
            quantity: it.quantity,
            dosageForm: it.dosageForm,
            signaIndonesian: it.signaIndonesian,
          }),
      }))
      .filter((it) => it.medicineName.length > 0);

    if (validItems.length === 0) {
      setErrorMsg('Minimal masukkan 1 obat pada lembar resep.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        rxNumber: rxNumber.trim(),
        rxDate,
        patientId,
        patientName: patientName.trim(),
        weightKg: weightKg.trim(),
        birthDate,
        ageYears: Number(ageYears) || 0,
        ageLabel: ageLabel || (ageYears ? `${ageYears} Thn` : ''),
        patientPhone: patientPhone.trim(),
        patientAddress: patientAddress.trim(),
        allergies: allergies.trim() || 'Tidak ada riwayat alergi',
        doctorName: doctorName.trim() || '-',
        doctorSip: doctorSip.trim() || '-',
        clinicName: clinicName.trim() || '-',
        iterFlag,
        pharmacyHeader,
        items: validItems,
        notes: notes.trim(),
        pharmacistName,
        status,
      };

      const isEdit = Boolean(editingRx);
      const saved = await apiRequest<PrescriptionRecord>(
        isEdit ? `/api/prescriptions/${editingRx!.id}` : '/api/prescriptions',
        {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        }
      );

      onSaved(saved, isEdit);
      if (loadToPos && onSaveAndLoadToPos) {
        onSaveAndLoadToPos(saved);
      }
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan data resep.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/65 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-slate-800 rounded-2xl max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-red-100 dark:border-slate-800 bg-gradient-to-r from-red-700 to-rose-700 text-white flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-display font-bold text-base truncate">
                {editingRx ? `Edit Resep (${editingRx.rxNumber})` : 'Form Input Resep Dokter (Rx) & Penerjemah Bahasa Latin'}
              </h3>
              <p className="text-xs text-red-100 truncate">
                Kelengkapan unsur resep resmi · Sinkronisasi Tgl Lahir ↔ Umur · Konversi otomatis Bahasa Latin
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 text-white cursor-pointer shrink-0"
            aria-label="Tutup modal resep"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form Column (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
                {errorMsg}
              </div>
            )}

            {/* 1. Kop Apotek & Inscriptio */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wide">
                  1. Kop Apotek &amp; Inscriptio Resep
                </span>
                <button
                  type="button"
                  onClick={() => setShowHeaderEditor((v) => !v)}
                  className="text-xs text-red-700 dark:text-red-400 hover:underline cursor-pointer"
                >
                  {showHeaderEditor ? 'Sembunyikan Kop' : 'Sesuaikan Kop Apotek'}
                </button>
              </div>

              {showHeaderEditor && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-lg bg-white dark:bg-slate-900 border border-red-100 dark:border-slate-800 text-xs">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Nama Apotek</label>
                    <input
                      type="text"
                      value={pharmacyHeader.pharmacyName}
                      onChange={(e) =>
                        setPharmacyHeader((h) => ({ ...h, pharmacyName: e.target.value }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Apoteker (APA)</label>
                    <input
                      type="text"
                      value={pharmacyHeader.apaName}
                      onChange={(e) =>
                        setPharmacyHeader((h) => ({ ...h, apaName: e.target.value }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Alamat Apotek</label>
                    <input
                      type="text"
                      value={pharmacyHeader.address}
                      onChange={(e) =>
                        setPharmacyHeader((h) => ({ ...h, address: e.target.value }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">No. SIPA</label>
                      <input
                        type="text"
                        value={pharmacyHeader.sipaNumber}
                        onChange={(e) =>
                          setPharmacyHeader((h) => ({ ...h, sipaNumber: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">No. SIA</label>
                      <input
                        type="text"
                        value={pharmacyHeader.siaNumber}
                        onChange={(e) =>
                          setPharmacyHeader((h) => ({ ...h, siaNumber: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    No. Resep
                  </label>
                  <input
                    type="text"
                    value={rxNumber}
                    onChange={(e) => setRxNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Tanggal Resep
                  </label>
                  <input
                    type="date"
                    value={rxDate}
                    onChange={(e) => setRxDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Keterangan Iter
                  </label>
                  <select
                    value={iterFlag}
                    onChange={(e) => setIterFlag(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    <option value="Non-Iter">Non-Iter (Tidak Diulang)</option>
                    <option value="Iter 1x">Iter 1x</option>
                    <option value="Iter 2x">Iter 2x</option>
                    <option value="Iter 3x">Iter 3x</option>
                    <option value="Cito / Urgent">Cito / Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Nama Dokter Penulis
                  </label>
                  <input
                    type="text"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="dr. Aditya Pratama, Sp.PD"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    No. SIP Dokter
                  </label>
                  <input
                    type="text"
                    value={doctorSip}
                    onChange={(e) => setDoctorSip(e.target.value)}
                    placeholder="SIP. 446/0198/Dinkes"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Asal Klinik / RS / Praktek
                  </label>
                  <input
                    type="text"
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder="Klinik / Rumah Sakit"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* 2. Data Pasien (Pro) dengan Sinkronisasi Tgl Lahir <-> Umur */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wide">
                  2. Data Pasien (Pro)
                </span>
                <select
                  value={patientId ?? ''}
                  onChange={(e) => handleSelectPatient(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">Isi Manual / Pilih Member Terdaftar...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.mrn} — {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
                <div className="sm:col-span-5">
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Nama Pasien <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Nama lengkap pasien..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    BB (kg)
                  </label>
                  <input
                    type="text"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    placeholder="56"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 tabular-nums"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Tanggal Lahir
                  </label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => handleBirthDateChange(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 tabular-nums"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Umur (Thn)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={130}
                    value={ageYears}
                    onChange={(e) => handleAgeChange(e.target.value)}
                    placeholder="35"
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    No. Telp / WA
                  </label>
                  <input
                    type="text"
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    placeholder="0812-xxxx-xxxx"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Alamat Pasien
                  </label>
                  <input
                    type="text"
                    value={patientAddress}
                    onChange={(e) => setPatientAddress(e.target.value)}
                    placeholder="Alamat domisili"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Riwayat Alergi
                  </label>
                  <input
                    type="text"
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* 3. Praescriptio & Penerjemah Bahasa Indonesia -> Bahasa Latin Resep */}
            <div className="p-4 rounded-xl border border-red-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    3. Daftar Obat (Praescriptio &amp; Bahasa Latin Otomatis)
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Cari atau ketik nama obat di kolom Nama &amp; Kekuatan Obat, isi jumlah dan aturan pakai Bahasa Indonesia untuk diterjemahkan otomatis ke Bahasa Latin (<code className="font-mono font-semibold">R/ ...</code>).
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCheckInteractions}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Cek Interaksi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setItems((prev) => [...prev, { ...EMPTY_RX_ITEM }])}
                    className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-medium flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah R/</span>
                  </button>
                </div>
              </div>

              {/* Panel Hasil Cek Interaksi Obat Terintegrasi Database */}
              {showInteractionPanel && (
                <div
                  className={`rounded-xl border p-3.5 space-y-3 text-xs ${
                    detectedInteractions.some((a) => a.severity === 'Major')
                      ? 'bg-rose-50/95 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
                      : detectedInteractions.length > 0
                        ? 'bg-amber-50/95 dark:bg-amber-950/35 border-amber-300 dark:border-amber-800'
                        : 'bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {detectedInteractions.some((a) => a.severity === 'Major') ? (
                        <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      ) : detectedInteractions.length > 0 ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                      <div>
                        <div className="font-display font-bold text-slate-900 dark:text-white">
                          Hasil Skrining Database Interaksi Obat ({detectedInteractions.length} Temuan)
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">
                          Terintegrasi dengan {interactionRules.length} aturan interaksi database sistem
                          {checkedDrugNames.length > 0 ? ` · Obat diperiksa: ${checkedDrugNames.join(', ')}` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {checkedDrugNames.length > 0 && (
                        <button
                          type="button"
                          disabled={savingInteractionSoap}
                          onClick={handleSaveInteractionToSoap}
                          className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <BookmarkCheck className="w-3.5 h-3.5" />
                          <span>
                            {savingInteractionSoap
                              ? 'Menyimpan...'
                              : 'Simpan ke Adherence & SOAP'}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowInteractionPanel(false)}
                        className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                        aria-label="Tutup hasil interaksi"
                        title="Tutup hasil interaksi"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {interactionSavedSuccess && (
                    <div className="p-2.5 rounded-lg bg-emerald-100/90 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 font-medium flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{interactionSavedSuccess}</span>
                    </div>
                  )}

                  {checkedDrugNames.length === 0 ? (
                    <div className="p-3 rounded-lg bg-white/85 dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                      Masukkan minimal 1–2 nama obat pada daftar R/ di bawah, lalu klik tombol{' '}
                      <strong>Cek Interaksi</strong>.
                    </div>
                  ) : detectedInteractions.length === 0 ? (
                    <div className="p-3 rounded-lg bg-white/85 dark:bg-slate-900/85 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-medium">
                      Tidak ditemukan interaksi obat berisiko dari obat yang diinput ({checkedDrugNames.join(', ')}) berdasarkan database interaksi sistem. Anda tetap dapat menyimpan riwayat skrining ini ke Adherence Monitoring &amp; Catatan SOAP.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200/80 dark:divide-slate-800 bg-white/90 dark:bg-slate-900/90 rounded-lg border border-slate-200/80 dark:border-slate-800">
                      {detectedInteractions.map((alert, idx) => {
                        const isMajor = alert.severity === 'Major';
                        const isModerate = alert.severity === 'Moderate';
                        return (
                          <div key={`${alert.ruleId}-${idx}`} className="p-3 space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                                {isMajor ? (
                                  <FileWarning className="w-4 h-4 text-rose-600 shrink-0" />
                                ) : isModerate ? (
                                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                ) : (
                                  <Info className="w-4 h-4 text-red-600 shrink-0" />
                                )}
                                <span
                                  className={
                                    isMajor
                                      ? 'text-rose-700 dark:text-rose-400'
                                      : isModerate
                                        ? 'text-amber-700 dark:text-amber-400'
                                        : 'text-red-700 dark:text-red-400'
                                  }
                                >
                                  [{alert.severity.toUpperCase()}]
                                </span>
                                <span>
                                  {alert.drugA} + {alert.drugB}
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                Sumber: {alert.sourceContext} · Bukti: {alert.evidenceLevel}
                              </span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-300">
                              <strong className="text-slate-900 dark:text-slate-100">
                                Mekanisme:
                              </strong>{' '}
                              {alert.mechanism}
                            </p>
                            <p className="text-slate-700 dark:text-slate-200">
                              <strong className="text-slate-900 dark:text-slate-100">
                                Efek Klinis:
                              </strong>{' '}
                              {alert.clinicalEffect}
                            </p>
                            <p className="text-emerald-800 dark:text-emerald-300 font-medium">
                              <strong>Tatalaksana Apoteker:</strong> {alert.managementAdvice}
                            </p>
                            {alert.literature && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                                <strong>Literatur:</strong> {alert.literature}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {items.map((item, idx) => {
                  const medQuery = item.medicineName.trim().toLowerCase();
                  const filteredMasterMeds = medicines
                    .filter((m) => {
                      if (!medQuery) return true;
                      return (
                        m.name.toLowerCase().includes(medQuery) ||
                        (m.genericName && m.genericName.toLowerCase().includes(medQuery)) ||
                        m.sku.toLowerCase().includes(medQuery) ||
                        m.categoryName.toLowerCase().includes(medQuery)
                      );
                    })
                    .slice(0, 8);
                  const linkedMasterMed = item.medicineId
                    ? medicines.find((m) => m.id === item.medicineId) ?? null
                    : null;

                  return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-red-700 dark:text-red-400">
                          Item Resep R/ #{idx + 1}
                        </span>
                        {linkedMasterMed && (
                          <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            Tertaut: {linkedMasterMed.sku} (Stok: {linkedMasterMed.stockBase}{' '}
                            {linkedMasterMed.unitBase})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                            aria-label="Hapus baris resep"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Structured Fields with Interactive Medicine Search */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                      <div className="sm:col-span-5 relative">
                        <label className="block text-[11px] text-slate-500 mb-1">
                          Nama &amp; Kekuatan Obat (Cari Database / Ketik Manual)
                        </label>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={item.medicineName}
                            onFocus={() => setOpenMedSearchIdx(idx)}
                            onBlur={() => {
                              window.setTimeout(() => {
                                setOpenMedSearchIdx((cur) => (cur === idx ? null : cur));
                              }, 160);
                            }}
                            onChange={(e) => {
                              const val = e.target.value;
                              const exactMatch =
                                medicines.find(
                                  (m) => m.name.toLowerCase() === val.trim().toLowerCase()
                                ) ?? null;
                              updateStructuredField(idx, {
                                medicineName: val,
                                medicineId: exactMatch ? exactMatch.id : null,
                              });
                              setOpenMedSearchIdx(idx);
                            }}
                            placeholder="Cari nama obat, zat aktif, atau SKU..."
                            className="w-full pl-8 pr-7 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-red-600"
                          />
                          {item.medicineName && (
                            <button
                              type="button"
                              onClick={() => {
                                updateStructuredField(idx, {
                                  medicineName: '',
                                  medicineId: null,
                                });
                                setOpenMedSearchIdx(idx);
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                              aria-label="Bersihkan nama obat"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {openMedSearchIdx === idx && (
                          <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredMasterMeds.length > 0 ? (
                              filteredMasterMeds.map((med) => (
                                <button
                                  key={med.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSelectMasterMedicine(idx, String(med.id));
                                    setOpenMedSearchIdx(null);
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-between gap-2"
                                >
                                  <div className="min-w-0">
                                    <div className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                                      {med.name}
                                    </div>
                                    <div className="text-[11px] text-slate-500 truncate">
                                      {med.genericName || med.categoryName} ·{' '}
                                      <span className="font-mono">{med.sku}</span>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
                                      Stok: {med.stockBase} {med.unitBase}
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      Gol. {med.classification}
                                    </div>
                                  </div>
                                </button>
                              ))
                            ) : (
                              <div className="px-3 py-2.5 text-[11px] text-slate-500">
                                Tidak ditemukan di master obat. Nama{' '}
                                <strong className="text-slate-700 dark:text-slate-200">
                                  &ldquo;{item.medicineName}&rdquo;
                                </strong>{' '}
                                tetap dapat digunakan sebagai obat resep manual.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-slate-500 mb-1">
                          Jumlah (No)
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            updateStructuredField(idx, {
                              quantity: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-slate-500 mb-1">Sediaan</label>
                        <select
                          value={item.dosageForm}
                          onChange={(e) =>
                            updateStructuredField(idx, { dosageForm: e.target.value })
                          }
                          className="w-full px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          <option value="tab">tab</option>
                          <option value="caps">caps</option>
                          <option value="capl">capl</option>
                          <option value="cth">cth (sirup)</option>
                          <option value="gtt">gtt (tetes)</option>
                          <option value="pulv">pulv (puyer)</option>
                          <option value="u.e.">u.e. (oles)</option>
                          <option value="amp">amp</option>
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] text-slate-500 mb-1">
                          Status Copy Resep
                        </label>
                        <select
                          value={item.deturStatus}
                          onChange={(e) =>
                            updateStructuredField(idx, { deturStatus: e.target.value }, false)
                          }
                          className="w-full px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          <option value="det orig">det orig (Sudah diserahkan)</option>
                          <option value="det 1x">det 1x (Baru 1x)</option>
                          <option value="ne det">ne det (Belum diserahkan)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          Aturan Pakai (Bahasa Indonesia)
                        </label>
                        <input
                          type="text"
                          value={item.signaIndonesian}
                          onChange={(e) =>
                            updateStructuredField(idx, { signaIndonesian: e.target.value })
                          }
                          placeholder="3x1 sesudah makan"
                          className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-red-700 dark:text-red-400 mb-1">
                          Terjemahan Bahasa Latin Resep (Bisa Disunting)
                        </label>
                        <input
                          type="text"
                          value={item.latinFormatted}
                          onChange={(e) =>
                            updateStructuredField(idx, { latinFormatted: e.target.value }, false)
                          }
                          placeholder="R/ paracetamol 500mg No X / 3 dd 1 tab PC"
                          className="w-full px-2.5 py-1.5 rounded-md border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-slate-950 font-mono font-semibold text-red-900 dark:text-red-300"
                        />
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>

            {/* 4. Status & Catatan Apoteker */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Status Penyerahan Resep
                </label>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as 'Menunggu' | 'Diserahkan' | 'Iter/Sebagian')
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="Diserahkan">Diserahkan (Lengkap)</option>
                  <option value="Iter/Sebagian">Iter / Sebagian (Copy Resep)</option>
                  <option value="Menunggu">Menunggu Peracikan</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Catatan Klinis / KIE Apoteker
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan konseling atau perhatian dosis..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Right Live Prescription Preview Column (5 cols) */}
          <div className="lg:col-span-5">
            <div className="sticky top-0 rounded-2xl border-2 border-red-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-5 space-y-4 shadow-sm text-slate-900 dark:text-slate-100">
              <div className="text-center border-b-2 border-red-700 pb-3 space-y-0.5">
                <div className="font-display font-bold text-base text-red-800 dark:text-red-400 uppercase tracking-wide">
                  {pharmacyHeader.pharmacyName}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400">
                  {pharmacyHeader.address} · Telp: {pharmacyHeader.phone}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400">
                  APA: {pharmacyHeader.apaName} · SIPA: {pharmacyHeader.sipaNumber} · SIA: {pharmacyHeader.siaNumber}
                </div>
              </div>

              <div className="flex justify-between text-xs border-b border-dashed border-slate-300 dark:border-slate-700 pb-2.5 tabular-nums">
                <div className="space-y-0.5">
                  <div>
                    <span className="text-slate-500">Dokter:</span>{' '}
                    <span className="font-semibold">{doctorName || '-'}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    SIP: {doctorSip || '-'} · {clinicName || '-'}
                  </div>
                </div>
                <div className="text-right space-y-0.5">
                  <div className="font-mono font-semibold text-red-700 dark:text-red-400">
                    {rxNumber}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Tgl: {rxDate} · {iterFlag}
                  </div>
                </div>
              </div>

              {/* Invocatio & Praescriptio */}
              <div className="min-h-[180px] space-y-3 py-1 font-mono text-xs">
                {items.some((i) => i.medicineName.trim()) ? (
                  items.map((it, idx) => {
                    if (!it.medicineName.trim() && !it.latinFormatted.trim()) return null;
                    const latin =
                      it.latinFormatted.trim() ||
                      formatPrescriptionLineLatin({
                        medicineName: it.medicineName,
                        quantity: it.quantity,
                        dosageForm: it.dosageForm,
                        signaIndonesian: it.signaIndonesian,
                      });
                    return (
                      <div
                        key={idx}
                        className="pb-2.5 border-b border-dotted border-slate-200 dark:border-slate-800 space-y-1"
                      >
                        <div className="font-semibold text-slate-900 dark:text-white leading-relaxed">
                          {latin}
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>({it.signaIndonesian || 'Aturan pakai sesuai etiket'})</span>
                          <span className="italic font-semibold text-red-700 dark:text-red-400">
                            — {it.deturStatus}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-10 text-center font-sans text-xs text-slate-400">
                    Pratinjau bahasa Latin resep (R/) akan tampil otomatis saat Anda mengetik obat di panel kiri.
                  </div>
                )}
              </div>

              {/* Pro (Patient Identity) */}
              <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-3 text-xs space-y-1 tabular-nums">
                <div className="flex justify-between">
                  <span>
                    <strong className="text-red-700 dark:text-red-400">Pro:</strong>{' '}
                    <span className="font-semibold">{patientName || '-'}</span>
                  </span>
                  <span>
                    BB: <strong>{weightKg ? `${weightKg} kg` : '-'}</strong>
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400">
                  <span>
                    Umur: {ageLabel || (ageYears ? `${ageYears} Thn` : '-')}
                  </span>
                  <span>Tgl Lahir: {birthDate || '-'}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Alamat: {patientAddress || '-'} · Alergi: {allergies || '-'}
                </div>
              </div>

              {notes && (
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-300">
                  <strong>KIE Apoteker:</strong> {notes}
                </div>
              )}

              <div className="pt-2 flex justify-end text-right text-[11px] text-slate-600 dark:text-slate-400">
                <div>
                  <div>Apoteker Penanggung Jawab,</div>
                  <div className="mt-6 font-semibold text-slate-900 dark:text-white underline">
                    {pharmacistName || pharmacyHeader.apaName}
                  </div>
                  <div>SIPA: {pharmacyHeader.sipaNumber}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500">
            Resep tersimpan otomatis ke database PostgreSQL &amp; tersedia di menu Riwayat Resep.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => submitPrescription(false)}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-red-700 hover:bg-red-800 text-white cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : editingRx ? 'Simpan Perubahan Resep' : 'Simpan Resep'}
            </button>
            {onSaveAndLoadToPos && (
              <button
                type="button"
                disabled={saving}
                onClick={() => submitPrescription(true)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Simpan &amp; Muat ke Kasir POS</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
