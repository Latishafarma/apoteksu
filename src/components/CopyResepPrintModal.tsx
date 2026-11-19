import { useState } from 'react';
import { CheckCircle2, ExternalLink, Printer, X } from 'lucide-react';
import { formatDateID } from '../lib/formatters';
import { isSandboxedIframe, triggerSafePrint } from '../lib/printHelper';
import { DEFAULT_PHARMACY_HEADER } from '../lib/rxLatinTranslator';
import type { PrescriptionRecord } from '../types/pharmacy';

interface CopyResepPrintModalProps {
  prescription: PrescriptionRecord | null;
  onClose: () => void;
}

export function CopyResepPrintModal({ prescription, onClose }: CopyResepPrintModalProps) {
  const [printNotice, setPrintNotice] = useState<string | null>(null);

  if (!prescription) return null;

  const header = prescription.pharmacyHeader || DEFAULT_PHARMACY_HEADER;
  const copyDate = new Date().toISOString().slice(0, 10);

  const handlePrintCopyResep = () => {
    const res = triggerSafePrint({
      elementId: 'copy-resep-print',
      documentTitle: `Salinan Resep (Apograph) - ${prescription.rxNumber}`,
      filename: `Copy-Resep-${prescription.rxNumber}`,
    });
    setPrintNotice(res.message);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/65 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h4 className="font-display font-bold text-sm text-slate-900 dark:text-white">
            Cetak Salinan Resep (Copy Resep / Apograph)
          </h4>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
            aria-label="Tutup modal cetak copy resep"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 max-h-[75vh] overflow-y-auto bg-slate-100 dark:bg-slate-950">
          <div
            id="copy-resep-print"
            className="bg-white text-slate-900 p-6 rounded-xl border border-slate-300 shadow-sm space-y-4 text-xs"
          >
            {/* Kop Apotek Resmi */}
            <div className="text-center border-b-2 border-red-800 pb-3 space-y-0.5">
              <div className="font-display font-bold text-base text-red-800 uppercase tracking-wider">
                {header.pharmacyName}
              </div>
              <div className="text-[11px] text-slate-700">
                {header.address} · Telp: {header.phone}
              </div>
              <div className="text-[11px] text-slate-700">
                Apoteker Penanggung Jawab: <span className="font-semibold">{header.apaName}</span>
              </div>
              <div className="text-[11px] text-slate-600">
                SIPA: {header.sipaNumber} · SIA: {header.siaNumber}
              </div>
            </div>

            <div className="text-center">
              <div className="font-display font-bold text-sm underline tracking-widest uppercase">
                SALINAN RESEP (APOGRAPH)
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                No. Resep: {prescription.rxNumber} · {prescription.iterFlag}
              </div>
            </div>

            {/* Inscriptio */}
            <div className="grid grid-cols-2 gap-2 border-y border-dashed border-slate-300 py-2.5 text-[11px] tabular-nums">
              <div className="space-y-0.5">
                <div>
                  Dari Dokter: <span className="font-semibold">{prescription.doctorName}</span>
                </div>
                <div>SIP Dokter: {prescription.doctorSip || '-'}</div>
                <div>Asal Klinik/RS: {prescription.clinicName || '-'}</div>
              </div>
              <div className="text-right space-y-0.5">
                <div>Tgl Resep: {formatDateID(prescription.rxDate)}</div>
                <div>Tgl Salinan: {formatDateID(copyDate)}</div>
                <div>Status: {prescription.status}</div>
              </div>
            </div>

            {/* Praescriptio / R/ Bahasa Latin */}
            <div className="space-y-3 py-2 font-mono text-xs min-h-[120px]">
              {prescription.items.map((item, idx) => (
                <div
                  key={idx}
                  className="pb-2 border-b border-dotted border-slate-200 flex items-start justify-between gap-4"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-slate-900">{item.latinFormatted}</div>
                    {item.signaIndonesian && (
                      <div className="font-sans text-[11px] text-slate-500">
                        Etiket: {item.signaIndonesian}
                      </div>
                    )}
                  </div>
                  <div className="italic font-bold text-red-800 shrink-0 whitespace-nowrap">
                    {item.deturStatus || 'det'}
                  </div>
                </div>
              ))}
            </div>

            {/* Pro (Identitas Pasien) */}
            <div className="border-t border-dashed border-slate-300 pt-3 space-y-1 text-[11px] tabular-nums">
              <div className="flex justify-between">
                <div>
                  <strong className="text-red-800">Pro:</strong>{' '}
                  <span className="font-bold text-xs">{prescription.patientName}</span>
                </div>
                <div>
                  BB: <strong>{prescription.weightKg ? `${prescription.weightKg} kg` : '-'}</strong>
                </div>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>
                  Umur: {prescription.ageLabel || (prescription.ageYears ? `${prescription.ageYears} Thn` : '-')}
                </span>
                <span>Tgl Lahir: {prescription.birthDate ? formatDateID(prescription.birthDate) : '-'}</span>
              </div>
              <div className="text-slate-600">
                Alamat: {prescription.patientAddress || '-'} · Telp: {prescription.patientPhone || '-'}
              </div>
              <div className="text-slate-600">Alergi: {prescription.allergies || '-'}</div>
            </div>

            {prescription.notes && (
              <div className="p-2 rounded bg-slate-50 border border-slate-200 text-[11px] text-slate-700">
                <strong>Catatan Apoteker:</strong> {prescription.notes}
              </div>
            )}

            {/* p.c.c & Tanda Tangan */}
            <div className="pt-4 flex items-end justify-between text-[11px]">
              <div className="border border-red-800 px-3 py-1.5 rounded text-red-800 font-bold tracking-wide">
                p.c.c. (Pro Copie Conform)
                <div className="font-normal text-[10px] text-slate-600">
                  Sesuai dengan resep asli
                </div>
              </div>
              <div className="text-center">
                <div>Apoteker Penanggung Jawab,</div>
                <div className="h-12" />
                <div className="font-bold underline">
                  {prescription.pharmacistName || header.apaName}
                </div>
                <div className="text-slate-600">SIPA: {header.sipaNumber}</div>
              </div>
            </div>
          </div>
        </div>

        {printNotice && (
          <div className="px-5 py-3 bg-emerald-50 dark:bg-emerald-950/50 border-t border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{printNotice}</span>
            </div>
            {isSandboxedIframe() && (
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-red-700 dark:text-red-400 hover:underline shrink-0"
              >
                <span>Buka Aplikasi di Tab Baru</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}

        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setPrintNotice(null);
              onClose();
            }}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={handlePrintCopyResep}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-red-700 hover:bg-red-800 text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak Copy Resep</span>
          </button>
        </div>
      </div>
    </div>
  );
}
