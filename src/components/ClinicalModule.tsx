import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  Plus,
  Send,
  ShieldAlert,
  Stethoscope,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../lib/apiClient';
import { detectDrugInteractions, type DetectedInteractionAlert } from '../lib/drugInteractions';
import { formatDateID, formatIDR } from '../lib/formatters';
import type {
  ClinicalCareRecord,
  DrugInteractionRule,
  EPrescriptionItem,
  Medicine,
  Patient,
  SwamedikasiLog,
  SwamedikasiRecommendation,
  TransactionRecord,
} from '../types/pharmacy';
import { InteractionAlertBanner } from './InteractionAlertBanner';

interface ClinicalModuleProps {
  patients: Patient[];
  medicines: Medicine[];
  clinicalRecords: ClinicalCareRecord[];
  transactions: TransactionRecord[];
  swamedikasiLogs: SwamedikasiLog[];
  interactionRules: DrugInteractionRule[];
  pharmacistName: string;
  escalatedDraft: {
    alert: DetectedInteractionAlert;
    patientId: number | null;
  } | null;
  onClearEscalatedDraft: () => void;
  onClinicalRecordCreated: (rec: ClinicalCareRecord) => void;
  onClinicalRecordUpdated: (rec: ClinicalCareRecord) => void;
  onSwamedikasiCreated: (log: SwamedikasiLog) => void;
  onInteractionRuleCreated: (rule: DrugInteractionRule) => void;
  onSendSwamedikasiToPos: (
    items: { medicineId: number; qty: number; unitType: 'Box' | 'Strip' | 'Pcs'; isCrossSell: boolean }[]
  ) => void;
}

const SWAMEDIKASI_PROTOCOLS: Record<
  string,
  {
    questions: string[];
    redFlags: string[];
    summary: string;
    primarySkus: string[];
    crossSellSkus: string[];
  }
> = {
  'Batuk & Pilek (ISPA Ringan)': {
    questions: [
      'Apakah batuk disertai dahak kental atau kering?',
      'Apakah keluhan sudah berlangsung kurang dari 5 hari?',
      'Apakah pasien memiliki riwayat hipertensi sebelum memilih dekongestan?',
    ],
    redFlags: [
      'Sesak napas / mengi berat',
      'Demam tinggi > 38.5°C lebih dari 3 hari',
      'Batuk berdarah atau nyeri dada',
    ],
    summary:
      'Terapi simtomatik aman dengan pereda demam, antihistamin generasi-2 minim kantuk, mukolitik bila berdahak, serta suplemen Vitamin C + Zinc untuk imunitas.',
    primarySkus: ['LF-OBT-002', 'LF-RSP-013', 'LF-RSP-014'],
    crossSellSkus: ['LF-SUP-012'],
  },
  'Demam & Nyeri Otot/Sendi': {
    questions: [
      'Apakah pasien memiliki riwayat tukak lambung atau konsumsi antikoagulan (Warfarin)?',
      'Berapa suhu tubuh saat pengukuran terakhir?',
    ],
    redFlags: [
      'Ruam petekie / tanda demam berdarah',
      'Kejang atau penurunan kesadaran',
      'Nyeri hebat disertai bengkak sendi mendadak',
    ],
    summary:
      'Lini pertama Paracetamol 500 mg (aman untuk lambung dan terapi antikoagulan jangka pendek) dikombinasikan suplemen neurotropik/imunitas.',
    primarySkus: ['LF-OBT-002'],
    crossSellSkus: ['LF-SUP-012', 'LF-MET-017'],
  },
  'Maag, Asam Lambung & GERD': {
    questions: [
      'Apakah nyeri ulu hati muncul sebelum atau sesudah makan?',
      'Apakah pasien sedang mengonsumsi Clopidogrel (perhatikan interaksi Omeprazole)?',
    ],
    redFlags: [
      'Muntah darah atau feses berwarna hitam pekat (melena)',
      'Penurunan berat badan drastis tanpa sebab',
      'Nyeri menjalar ke rahang / lengan kiri',
    ],
    summary:
      'Edukasi porsi makan kecil sering, hindari kafein/pedas, gunakan PPI/pelindung mukosa serta probiotik pemulihan saluran cerna.',
    primarySkus: ['LF-OBT-007'],
    crossSellSkus: ['LF-SUP-015'],
  },
  'Diare Akut Tanpa Komplikasi': {
    questions: [
      'Berapa kali frekuensi BAB cair dalam 24 jam terakhir?',
      'Apakah ada riwayat baru mengonsumsi antibiotik dalam 7 hari terakhir?',
    ],
    redFlags: [
      'BAB berdarah / berlendir disertai demam tinggi',
      'Tanda dehidrasi berat (mata cekung, tidak buang air kecil > 6 jam)',
    ],
    summary:
      'Rehidrasi oral dengan Oralit + Zinc & Probiotik untuk mengembalikan keseimbangan flora usus dan mempersingkat durasi diare.',
    primarySkus: ['LF-SUP-015'],
    crossSellSkus: ['LF-SUP-012'],
  },
};

export function ClinicalModule({
  patients,
  medicines,
  clinicalRecords,
  transactions,
  swamedikasiLogs,
  interactionRules,
  pharmacistName,
  escalatedDraft,
  onClearEscalatedDraft,
  onClinicalRecordCreated,
  onClinicalRecordUpdated,
  onSwamedikasiCreated,
  onInteractionRuleCreated,
  onSendSwamedikasiToPos,
}: ClinicalModuleProps) {
  const [subTab, setSubTab] = useState<'soap' | 'swamedikasi' | 'interactions'>('soap');

  // SOAP + e-Resep state
  const [selectedPatientId, setSelectedPatientId] = useState<number>(patients[0]?.id ?? 0);
  const [visitDate, setVisitDate] = useState<string>('2026-11-18');
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('Interaksi Obat');
  const [drpDetails, setDrpDetails] = useState('');
  const [plan, setPlan] = useState('');
  const [interventionTarget, setInterventionTarget] = useState('Pasien');
  const [adherenceScore, setAdherenceScore] = useState(90);
  const [followUpDate, setFollowUpDate] = useState('2026-11-25');
  const [eRxItems, setERxItems] = useState<EPrescriptionItem[]>([]);
  const [rxSelectMedId, setRxSelectMedId] = useState<string>('');
  const [rxDosage, setRxDosage] = useState('500 mg');
  const [rxFreq, setRxFreq] = useState('3 x 1 sesudah makan');
  const [rxDuration, setRxDuration] = useState('7 hari');
  const [savingSoap, setSavingSoap] = useState(false);
  const [clinicalMsg, setClinicalMsg] = useState<string | null>(null);

  // Swamedikasi state
  const [swamPatientName, setSwamPatientName] = useState('Pasien Walk-in');
  const [selectedSymptom, setSelectedSymptom] = useState<string>('Batuk & Pilek (ISPA Ringan)');
  const [checkedRedFlags, setCheckedRedFlags] = useState<string[]>([]);
  const [triageNote, setTriageNote] = useState('Keluhan baru 2 hari, tidak ada sesak.');
  const [savingSwam, setSavingSwam] = useState(false);

  // Interaction DB state
  const [interactionQuery, setInteractionQuery] = useState('');
  const [newRuleForm, setNewRuleForm] = useState({
    drugAKeyword: '',
    drugBKeyword: '',
    severity: 'Major',
    mechanism: '',
    clinicalEffect: '',
    managementAdvice: '',
    evidenceLevel: 'Established',
    literature: '',
  });

  // Absorb escalated alert from POS
  useEffect(() => {
    if (!escalatedDraft) return;
    setSubTab('soap');
    if (escalatedDraft.patientId) {
      setSelectedPatientId(escalatedDraft.patientId);
    }
    setAssessment('Interaksi Obat');
    setDrpDetails(
      `[${escalatedDraft.alert.severity.toUpperCase()}] ${escalatedDraft.alert.drugA} + ${escalatedDraft.alert.drugB}: ${escalatedDraft.alert.clinicalEffect}`
    );
    setPlan(escalatedDraft.alert.managementAdvice);
    setInterventionTarget('Dokter Penulis Resep');
    onClearEscalatedDraft();
  }, [escalatedDraft, onClearEscalatedDraft]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  );

  // Gather patient's ongoing therapy history from past clinical records & POS transactions
  const patientTherapyHistory = useMemo(() => {
    if (!selectedPatientId) return [];
    const list: { name: string; source: string; date: string; adherence?: string }[] = [];
    clinicalRecords
      .filter((r) => r.patientId === selectedPatientId)
      .forEach((r) => {
        r.ePrescriptionItems.forEach((item) => {
          list.push({
            name: item.medicineName,
            source: 'e-Resep Klinis',
            date: r.visitDate,
            adherence: item.adherenceStatus,
          });
        });
      });
    transactions
      .filter((t) => t.patientId === selectedPatientId)
      .forEach((t) => {
        t.items.forEach((it) => {
          list.push({
            name: it.name,
            source: `POS (${t.invoiceNo})`,
            date: t.transactionDate,
          });
        });
      });
    return list;
  }, [selectedPatientId, clinicalRecords, transactions]);

  // Automated Drug Interaction Alert for current e-Resep + patient's therapy history!
  const clinicalInteractionAlerts = useMemo(() => {
    const active = eRxItems.map((it) => ({ name: it.medicineName }));
    const history = patientTherapyHistory.map((h) => ({ name: h.name }));
    if (active.length === 0 && history.length < 2) return [];
    // If no new eRxItems yet, still check intra-history interactions when reviewing therapy history!
    const primaryCheck = active.length > 0 ? active : history;
    const secondaryCheck = active.length > 0 ? history : [];
    return detectDrugInteractions(primaryCheck, secondaryCheck, interactionRules);
  }, [eRxItems, patientTherapyHistory, interactionRules]);

  const handleAddERxItem = () => {
    const med = medicines.find((m) => String(m.id) === rxSelectMedId);
    if (!med) return;
    setERxItems((prev) => [
      ...prev,
      {
        medicineName: med.name,
        dosage: rxDosage,
        frequency: rxFreq,
        duration: rxDuration,
        adherenceStatus: 'Patuh',
      },
    ]);
    setRxSelectMedId('');
  };

  const handleSaveSoap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjective.trim() || !plan.trim()) return;
    setSavingSoap(true);
    setClinicalMsg(null);
    try {
      const created = await apiRequest<ClinicalCareRecord>('/api/clinical-records', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedPatient?.id ?? null,
          patientName: selectedPatient?.name ?? 'Pasien Umum',
          pharmacistName,
          visitDate,
          subjective,
          objective,
          assessment,
          drpDetails,
          plan,
          interventionTarget,
          ePrescriptionItems: eRxItems,
          adherenceScore,
          followUpDate,
          status:
            clinicalInteractionAlerts.some((a) => a.severity === 'Major') || adherenceScore < 85
              ? 'Perlu Follow-Up'
              : 'Selesai',
        }),
      });
      onClinicalRecordCreated(created);
      setSubjective('');
      setObjective('');
      setDrpDetails('');
      setPlan('');
      setERxItems([]);
      setClinicalMsg('Catatan pelayanan kefarmasian SOAP/DRP berhasil disimpan ke database.');
    } catch (err: unknown) {
      setClinicalMsg(err instanceof Error ? err.message : 'Gagal menyimpan catatan SOAP.');
    } finally {
      setSavingSoap(false);
    }
  };

  const handleToggleAdherence = async (rec: ClinicalCareRecord, nextScore: number) => {
    try {
      const updated = await apiRequest<ClinicalCareRecord>(`/api/clinical-records/${rec.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextScore >= 90 ? 'Selesai' : 'Perlu Follow-Up',
          adherenceScore: nextScore,
          ePrescriptionItems: rec.ePrescriptionItems.map((it) => ({
            ...it,
            adherenceStatus:
              nextScore >= 90 ? 'Patuh' : nextScore >= 70 ? 'Perlu Pantauan' : 'Putus Obat',
          })),
        }),
      });
      onClinicalRecordUpdated(updated);
    } catch (err: unknown) {
      setClinicalMsg(err instanceof Error ? err.message : 'Gagal memperbarui adherence.');
    }
  };

  const activeProtocol = SWAMEDIKASI_PROTOCOLS[selectedSymptom];
  const recommendedSwamItems: SwamedikasiRecommendation[] = useMemo(() => {
    if (!activeProtocol) return [];
    const list: SwamedikasiRecommendation[] = [];
    for (const sku of activeProtocol.primarySkus) {
      const med = medicines.find((m) => m.sku === sku);
      if (med) {
        list.push({
          medicineId: med.id,
          name: med.name,
          dosage: med.dosageInstructions,
          role: 'primary',
          reason: med.indication,
          priceReguler: med.priceReguler * (med.pcsPerStrip > 1 ? med.pcsPerStrip : 1),
        });
      }
    }
    for (const sku of activeProtocol.crossSellSkus) {
      const med = medicines.find((m) => m.sku === sku);
      if (med) {
        list.push({
          medicineId: med.id,
          name: med.name,
          dosage: med.dosageInstructions,
          role: 'cross_sell',
          reason: `Cross-Sell Penunjang: ${med.indication}`,
          priceReguler: med.priceReguler * (med.pcsPerStrip > 1 ? med.pcsPerStrip : 1),
        });
      }
    }
    return list;
  }, [activeProtocol, medicines]);

  const handleSaveAndSendSwamedikasi = async (sendToPos: boolean) => {
    setSavingSwam(true);
    try {
      const created = await apiRequest<SwamedikasiLog>('/api/swamedikasi', {
        method: 'POST',
        body: JSON.stringify({
          patientName: swamPatientName.trim() || 'Pasien Walk-in',
          symptomCategory: selectedSymptom,
          triageAnswers: { catatan: triageNote, redFlags: checkedRedFlags.join(', ') || 'Tidak ada' },
          redFlagsDetected: checkedRedFlags.length > 0,
          recommendationSummary:
            checkedRedFlags.length > 0
              ? 'TERDETEKSI RED FLAG: Pasien disarankan segera dirujuk ke dokter/klinik.'
              : activeProtocol.summary,
          recommendedMedicines: checkedRedFlags.length > 0 ? [] : recommendedSwamItems,
          convertedToPos: sendToPos && checkedRedFlags.length === 0,
        }),
      });
      onSwamedikasiCreated(created);

      if (sendToPos && checkedRedFlags.length === 0) {
        onSendSwamedikasiToPos(
          recommendedSwamItems
            .filter((r) => Boolean(r.medicineId))
            .map((r) => ({
              medicineId: r.medicineId!,
              qty: 1,
              unitType: 'Strip',
              isCrossSell: r.role === 'cross_sell',
            }))
        );
      }
    } catch (err: unknown) {
      setClinicalMsg(err instanceof Error ? err.message : 'Gagal menyimpan konsultasi swamedikasi.');
    } finally {
      setSavingSwam(false);
    }
  };

  const handleCreateInteractionRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleForm.drugAKeyword.trim() || !newRuleForm.drugBKeyword.trim()) return;
    try {
      const created = await apiRequest<DrugInteractionRule>('/api/interactions', {
        method: 'POST',
        body: JSON.stringify(newRuleForm),
      });
      onInteractionRuleCreated(created);
      setNewRuleForm({
        drugAKeyword: '',
        drugBKeyword: '',
        severity: 'Major',
        mechanism: '',
        clinicalEffect: '',
        managementAdvice: '',
        evidenceLevel: 'Established',
        literature: '',
      });
    } catch (err: unknown) {
      setClinicalMsg(err instanceof Error ? err.message : 'Gagal menambah aturan interaksi.');
    }
  };

  const filteredRules = useMemo(() => {
    const q = interactionQuery.trim().toLowerCase();
    if (!q) return interactionRules;
    return interactionRules.filter(
      (r) =>
        r.drugAKeyword.toLowerCase().includes(q) ||
        r.drugBKeyword.toLowerCase().includes(q) ||
        r.clinicalEffect.toLowerCase().includes(q) ||
        (r.literature || '').toLowerCase().includes(q)
    );
  }, [interactionRules, interactionQuery]);

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Praktek Apoteker Klinis (Pharmaceutical Care)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Asesmen SOAP &amp; DRPs · Penapisan interaksi obat otomatis · Swamedikasi OTC terpandu
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('soap')}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'soap'
                ? 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            SOAP, DRPs &amp; e-Resep
          </button>
          <button
            type="button"
            onClick={() => setSubTab('swamedikasi')}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'swamedikasi'
                ? 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Layanan Swamedikasi
          </button>
          <button
            type="button"
            onClick={() => setSubTab('interactions')}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'interactions'
                ? 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Basis Data Interaksi ({interactionRules.length})
          </button>
        </div>
      </div>

      {clinicalMsg && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between">
          <span>{clinicalMsg}</span>
          <button
            type="button"
            onClick={() => setClinicalMsg(null)}
            className="text-emerald-700 font-semibold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {subTab === 'soap' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left: Patient Therapy History + SOAP & e-Resep Form */}
          <div className="xl:col-span-7 space-y-5">
            {/* Patient Selector + Clinical Snapshot */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    Pilih Pasien untuk Review Terapi
                  </label>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.mrn} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    Tanggal Kunjungan / Telaah
                  </label>
                  <input
                    type="date"
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                  />
                </div>
              </div>

              {selectedPatient && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
                    <span className="font-semibold text-rose-700 dark:text-rose-400">
                      Alergi: {selectedPatient.allergies}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Kondisi Kronis: {selectedPatient.chronicConditions}</span>
                  </div>
                  <div className="text-slate-500">
                    Riwayat obat tercatat: {patientTherapyHistory.length} entri dari e-Resep &amp; POS
                  </div>
                </div>
              )}
            </div>

            {/* Live Automated Drug Interaction Alert when entering e-Resep or reviewing patient history */}
            <InteractionAlertBanner
              alerts={clinicalInteractionAlerts}
              contextTitle="Deteksi Otomatis Interaksi Obat (e-Resep Baru & Riwayat Terapi)"
              onEscalateToSoap={(alert) => {
                setAssessment('Interaksi Obat');
                setDrpDetails(
                  `[${alert.severity}] ${alert.drugA} + ${alert.drugB}: ${alert.clinicalEffect}`
                );
                setPlan(alert.managementAdvice);
              }}
            />

            {/* e-Resep & SOAP Entry Form */}
            <form
              onSubmit={handleSaveSoap}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-red-600" />
                  <span>Input e-Resep Baru &amp; Dokumentasi SOAP / DRPs</span>
                </h3>
                <span className="text-xs text-slate-500">Apoteker: {pharmacistName}</span>
              </div>

              {/* e-Resep Mini Builder */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Daftar Obat pada e-Resep (Otomatis dicek terhadap interaksi obat)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <select
                    value={rxSelectMedId}
                    onChange={(e) => setRxSelectMedId(e.target.value)}
                    className="sm:col-span-5 px-2.5 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <option value="">-- Pilih Obat Master --</option>
                    {medicines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.genericName})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={rxDosage}
                    onChange={(e) => setRxDosage(e.target.value)}
                    placeholder="Dosis"
                    className="sm:col-span-2 px-2.5 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                  <input
                    type="text"
                    value={rxFreq}
                    onChange={(e) => setRxFreq(e.target.value)}
                    placeholder="Aturan pakai"
                    className="sm:col-span-3 px-2.5 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleAddERxItem}
                    disabled={!rxSelectMedId}
                    className="sm:col-span-2 px-3 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-medium cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Resep</span>
                  </button>
                </div>

                {eRxItems.length > 0 && (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                    {eRxItems.map((it, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-medium">{it.medicineName}</span>{' '}
                          <span className="text-slate-500">
                            · {it.dosage} · {it.frequency} ({it.duration})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setERxItems((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-medium mb-1">Subjective (Keluhan Pasien)</label>
                  <textarea
                    required
                    rows={2}
                    value={subjective}
                    onChange={(e) => setSubjective(e.target.value)}
                    placeholder="Keluhan utama, riwayat gejala, pertanyaan pasien..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Objective (Tanda Vital / Lab / Obat Aktif)</label>
                  <textarea
                    rows={2}
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    placeholder="TD, GDS, INR, hasil skrining riwayat obat..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-medium mb-1">Kategori DRP (Assessment)</label>
                  <select
                    value={assessment}
                    onChange={(e) => setAssessment(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <option value="Interaksi Obat">Interaksi Obat</option>
                    <option value="Dosis Terlalu Tinggi">Dosis Terlalu Tinggi</option>
                    <option value="Dosis Terlalu Rendah">Dosis Terlalu Rendah</option>
                    <option value="Efek Samping Obat">Efek Samping Obat</option>
                    <option value="Ketidakpatuhan">Ketidakpatuhan (Adherence)</option>
                    <option value="Tidak Ada DRP">Tidak Ada DRP (Terapi Optimal)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Target Intervensi</label>
                  <select
                    value={interventionTarget}
                    onChange={(e) => setInterventionTarget(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <option value="Pasien">Edukasi Pasien / Keluarga</option>
                    <option value="Dokter Penulis Resep">Konfirmasi Dokter Penulis Resep</option>
                    <option value="Internal Farmasi">Penyesuaian Internal Farmasi</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Skor Kepatuhan (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={adherenceScore}
                    onChange={(e) => setAdherenceScore(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                  />
                </div>
              </div>

              <div className="text-xs space-y-3">
                <div>
                  <label className="block font-medium mb-1">Detail Identifikasi DRP</label>
                  <input
                    type="text"
                    value={drpDetails}
                    onChange={(e) => setDrpDetails(e.target.value)}
                    placeholder="Uraian masalah terkait obat atau potensi interaksi..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Plan (Saran Intervensi &amp; Edukasi Konseling)</label>
                  <textarea
                    required
                    rows={2}
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    placeholder="Tindakan apoteker, rekomendasi penyesuaian dosis/jadwal, poin edukasi pasien..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Jadwal Follow-Up:</span>
                  <input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingSoap}
                  className="px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {savingSoap ? 'Menyimpan...' : 'Simpan Catatan SOAP & e-Resep'}
                </button>
              </div>
            </form>
          </div>

          {/* Right: Adherence Monitoring & Patient Therapy Timeline */}
          <div className="xl:col-span-5 space-y-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  <span>Adherence Monitoring &amp; Catatan SOAP</span>
                </h3>
                <span className="text-xs text-slate-500 tabular-nums">
                  {clinicalRecords.length} rekam
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[680px] overflow-y-auto">
                {clinicalRecords.map((rec) => (
                  <div key={rec.id} className="p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {rec.patientName}
                      </span>
                      <span className="text-slate-500 tabular-nums">
                        {formatDateID(rec.visitDate)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
                      <span className="font-medium text-red-700 dark:text-red-400">
                        DRP: {rec.assessment}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Target: {rec.interventionTarget}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          rec.adherenceScore >= 90
                            ? 'text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums'
                            : 'text-amber-700 dark:text-amber-400 font-semibold tabular-nums'
                        }
                      >
                        Adherence {rec.adherenceScore}%
                      </span>
                    </div>
                    {rec.drpDetails && (
                      <p className="text-rose-700 dark:text-rose-300 font-medium">
                        {rec.drpDetails}
                      </p>
                    )}
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      <strong className="text-slate-900 dark:text-slate-100">Plan:</strong> {rec.plan}
                    </p>
                    {rec.ePrescriptionItems.length > 0 && (
                      <div className="pt-1 text-slate-500">
                        Terapi: {rec.ePrescriptionItems.map((it) => it.medicineName).join(', ')}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-slate-400">
                        Status: {rec.status} · Follow-up: {rec.followUpDate || '-'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleAdherence(rec, 95)}
                          className="px-2.5 py-1 rounded-md border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 cursor-pointer"
                        >
                          Tandai Patuh (95%)
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Swamedikasi Tab */}
      {subTab === 'swamedikasi' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-emerald-600" />
              <h3 className="font-display font-semibold text-base">
                Panduan Tanya-Jawab Swamedikasi Aman &amp; Cross-Selling OTC
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Nama Pasien Walk-in</label>
                <input
                  type="text"
                  value={swamPatientName}
                  onChange={(e) => setSwamPatientName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Keluhan Utama Pasien</label>
                <select
                  value={selectedSymptom}
                  onChange={(e) => {
                    setSelectedSymptom(e.target.value);
                    setCheckedRedFlags([]);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  {Object.keys(SWAMEDIKASI_PROTOCOLS).map((sym) => (
                    <option key={sym} value={sym}>
                      {sym}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-slate-700 dark:text-slate-200">
                Pertanyaan Penapisan Klinis (WWHAM):
              </div>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                {activeProtocol.questions.map((q, idx) => (
                  <li key={idx}>{q}</li>
                ))}
              </ul>
              <input
                type="text"
                value={triageNote}
                onChange={(e) => setTriageNote(e.target.value)}
                placeholder="Ringkasan jawaban pasien..."
                className="w-full mt-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-2 text-xs">
              <div className="font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4" />
                <span>Cek Red Flags (Tanda Bahaya Rujukan Dokter):</span>
              </div>
              <div className="space-y-1.5">
                {activeProtocol.redFlags.map((flag) => (
                  <label key={flag} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checkedRedFlags.includes(flag)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCheckedRedFlags((prev) => [...prev, flag]);
                        } else {
                          setCheckedRedFlags((prev) => prev.filter((f) => f !== flag));
                        }
                      }}
                    />
                    <span className="text-slate-800 dark:text-slate-200">{flag}</span>
                  </label>
                ))}
              </div>
            </div>

            {checkedRedFlags.length > 0 ? (
              <div className="p-4 rounded-xl bg-rose-100 dark:bg-rose-950 border border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200 text-xs font-medium">
                PERINGATAN KLINIS: Ditemukan tanda bahaya ({checkedRedFlags.join(', ')}). Hentikan
                swamedikasi dan rujuk pasien ke dokter atau fasilitas gawat darurat.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Rekomendasi Produk Aman + Cross-Sell Suplemen:
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  {recommendedSwamItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 flex items-center justify-between gap-3 text-xs bg-slate-50/60 dark:bg-slate-950/40"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {item.name}{' '}
                          <span
                            className={
                              item.role === 'cross_sell'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-red-700 dark:text-red-400'
                            }
                          >
                            ({item.role === 'cross_sell' ? 'Suplemen Cross-Sell' : 'Terapi Utama'})
                          </span>
                        </div>
                        <div className="text-slate-500">{item.reason}</div>
                      </div>
                      <div className="font-semibold tabular-nums shrink-0">
                        {formatIDR(item.priceReguler)} / strip
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={savingSwam}
                onClick={() => handleSaveAndSendSwamedikasi(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Simpan Log Konsultasi
              </button>
              {checkedRedFlags.length === 0 && (
                <button
                  type="button"
                  disabled={savingSwam}
                  onClick={() => handleSaveAndSendSwamedikasi(true)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Simpan &amp; Kirim Paket ke Kasir POS</span>
                </button>
              )}
            </div>
          </div>

          {/* Recent Swamedikasi Logs */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display font-semibold text-sm">
                Riwayat Layanan Swamedikasi ({swamedikasiLogs.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
              {swamedikasiLogs.map((log) => (
                <div key={log.id} className="p-4 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {log.patientName}
                    </span>
                    <span
                      className={
                        log.convertedToPos
                          ? 'text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1'
                          : 'text-slate-500'
                      }
                    >
                      {log.convertedToPos && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {log.convertedToPos ? 'Masuk POS' : log.redFlagsDetected ? 'Dirujuk' : 'Tercatat'}
                    </span>
                  </div>
                  <div className="text-red-700 dark:text-red-400 font-medium">
                    {log.symptomCategory}
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">{log.recommendationSummary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Drug Interaction Database Tab */}
      {subTab === 'interactions' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BookOpenCheck className="w-4 h-4 text-red-600" />
                <h3 className="font-display font-semibold text-sm">
                  Basis Data Interaksi Obat Terintegrasi ({filteredRules.length})
                </h3>
              </div>
              <input
                type="text"
                value={interactionQuery}
                onChange={(e) => setInteractionQuery(e.target.value)}
                placeholder="Cari zat aktif (Warfarin, Clopidogrel, Simvastatin...)"
                className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg w-64"
              />
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRules.map((rule) => (
                <div key={rule.id} className="p-4 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-sm text-slate-900 dark:text-white">
                      {rule.drugAKeyword} + {rule.drugBKeyword}
                    </div>
                    <span
                      className={`font-semibold ${
                        rule.severity === 'Major'
                          ? 'text-rose-700 dark:text-rose-400'
                          : rule.severity === 'Moderate'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      Severity: {rule.severity} · {rule.evidenceLevel}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">
                    <strong>Mekanisme:</strong> {rule.mechanism}
                  </p>
                  <p className="text-slate-700 dark:text-slate-200">
                    <strong>Efek Klinis:</strong> {rule.clinicalEffect}
                  </p>
                  <p className="text-emerald-700 dark:text-emerald-400 font-medium">
                    <strong>Tatalaksana Apoteker:</strong> {rule.managementAdvice}
                  </p>
                  {rule.literature && (
                    <p className="text-slate-500 dark:text-slate-400 italic">
                      <strong>Literatur:</strong> {rule.literature}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleCreateInteractionRule}
            className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-xs"
          >
            <div className="flex items-center gap-2 font-display font-semibold text-sm">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Tambah Aturan Interaksi Obat</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-medium mb-1">Zat Aktif A</label>
                <input
                  required
                  type="text"
                  value={newRuleForm.drugAKeyword}
                  onChange={(e) =>
                    setNewRuleForm((f) => ({ ...f, drugAKeyword: e.target.value }))
                  }
                  placeholder="mis. Aspirin"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Zat Aktif B</label>
                <input
                  required
                  type="text"
                  value={newRuleForm.drugBKeyword}
                  onChange={(e) =>
                    setNewRuleForm((f) => ({ ...f, drugBKeyword: e.target.value }))
                  }
                  placeholder="mis. Warfarin"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium mb-1">Tingkat Keparahan (Severity)</label>
              <select
                value={newRuleForm.severity}
                onChange={(e) => setNewRuleForm((f) => ({ ...f, severity: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="Major">Major (Kontraindikasi / Risiko Serius)</option>
                <option value="Moderate">Moderate (Perlu Penyesuaian / Monitoring)</option>
                <option value="Minor">Minor (Risiko Ringan)</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Mekanisme Interaksi</label>
              <input
                required
                type="text"
                value={newRuleForm.mechanism}
                onChange={(e) => setNewRuleForm((f) => ({ ...f, mechanism: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Efek Klinis</label>
              <input
                required
                type="text"
                value={newRuleForm.clinicalEffect}
                onChange={(e) =>
                  setNewRuleForm((f) => ({ ...f, clinicalEffect: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Rekomendasi Tatalaksana Apoteker</label>
              <textarea
                required
                rows={2}
                value={newRuleForm.managementAdvice}
                onChange={(e) =>
                  setNewRuleForm((f) => ({ ...f, managementAdvice: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Literatur / Referensi Klinis</label>
              <input
                required
                type="text"
                value={newRuleForm.literature}
                onChange={(e) =>
                  setNewRuleForm((f) => ({ ...f, literature: e.target.value }))
                }
                placeholder="mis. Stockley's Drug Interactions Ed. 13 / Lexicomp / Medscape / PIONAS"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white font-semibold cursor-pointer"
            >
              Simpan ke Database Interaksi
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
