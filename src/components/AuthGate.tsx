import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  IdCard,
  Info,
  Stethoscope,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { publicApiRequest, type StoredTenantSession } from '../lib/apiClient';

interface DetectedEmployeeMatch {
  id: number;
  name: string;
  role: string;
}

interface AuthGateProps {
  onLoginSuccess: (session: StoredTenantSession) => void;
}

export function AuthGate({ onLoginSuccess }: AuthGateProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [showRegisterGuide, setShowRegisterGuide] = useState(false);

  // Employee login fields (Nama Karyawan & ID Karyawan)
  const [employeeName, setEmployeeName] = useState('');
  const [employeeNip, setEmployeeNip] = useState('');
  const [detectedEmployees, setDetectedEmployees] = useState<DetectedEmployeeMatch[]>([]);

  useEffect(() => {
    const query = employeeName.trim();
    if (query.length < 2) {
      setDetectedEmployees([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const matches = await publicApiRequest<DetectedEmployeeMatch[]>(
          `/api/public/employee-lookup?q=${encodeURIComponent(query)}`
        );
        if (!cancelled) {
          setDetectedEmployees(Array.isArray(matches) ? matches : []);
        }
      } catch {
        if (!cancelled) {
          setDetectedEmployees([]);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [employeeName]);

  const handleEmployeeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = await publicApiRequest<StoredTenantSession>('/api/public/employee-login', {
        method: 'POST',
        body: JSON.stringify({
          name: employeeName.trim(),
          nip: employeeNip.trim(),
        }),
      });
      onLoginSuccess(session);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal masuk. Periksa kembali Nama Karyawan dan ID Karyawan Anda.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-red-50/60 to-rose-100/70 dark:from-slate-950 dark:via-slate-950 dark:to-red-950/30 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Header Bar */}
      <header className="w-full max-w-6xl mx-auto px-4 lg:px-8 pt-6 flex items-center justify-between gap-8">
        <div className="flex items-center gap-2.5 text-red-700 dark:text-red-400 font-display font-bold text-lg tracking-tight whitespace-nowrap shrink-0">
          <Stethoscope className="w-5 h-5" />
          <span>Latisha Farma · ApotekSu</span>
        </div>

        <button
          type="button"
          onClick={() => setShowRegisterGuide(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-slate-800 text-xs font-semibold text-red-700 dark:text-red-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Daftar Akun Karyawan</span>
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center p-4 lg:p-8">
        <div className="w-full max-w-5xl bg-white dark:bg-slate-900 border border-red-200/80 dark:border-slate-800 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-6 p-8 lg:p-11 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Clinical &amp; Retail Pharmacy · Operational System
              </p>

              <h1 className="mt-4 font-display text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
                ApotekSu
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Sistem operasional harian apotek &amp; klinik untuk transaksi Kasir POS, penjualan
                &amp; pembelian, rekam medis/resep Latin, penapisan interaksi obat, Pharmaceutical
                Care SOAP/DRPs, serta manajemen stok FEFO &amp; master data.
              </p>
            </div>

            <div className="mt-8 space-y-4">
              {error && (
                <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleEmployeeLogin} className="space-y-3">
                <div>
                  <label
                    htmlFor="employee-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Nama Karyawan
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="employee-name"
                      required
                      type="text"
                      autoComplete="name"
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      placeholder="Ketik 1 kata nama karyawan (misal: Latisha)"
                      className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                    />
                  </div>
                  {detectedEmployees.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {detectedEmployees.length === 1 ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Terdeteksi: {detectedEmployees[0].name}</span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {detectedEmployees.map((emp) => (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => setEmployeeName(emp.name)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              <span>{emp.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="employee-nip"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    ID Karyawan
                  </label>
                  <div className="relative">
                    <IdCard className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="employee-nip"
                      required
                      type="text"
                      autoComplete="off"
                      value={employeeNip}
                      onChange={(e) => setEmployeeNip(e.target.value)}
                      placeholder="Contoh: ID-001"
                      className="w-full pl-10 pr-3.5 py-2.5 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Cukup ketik satu kosakata nama karyawan dan ID Karyawan yang terdaftar di sistem
                  aplikasi untuk masuk.
                </p>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-700 hover:bg-red-800 active:scale-[0.99] text-white font-medium text-xs transition-all cursor-pointer disabled:opacity-60 whitespace-nowrap"
                >
                  <span>{loading ? 'Memverifikasi Karyawan...' : 'Masuk ke Aplikasi'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {/* Registration Call-To-Action */}
              <div className="pt-4 border-t border-red-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-600 dark:text-slate-400">
                  Belum punya akun? Klik tombol daftar
                </span>
                <button
                  type="button"
                  onClick={() => setShowRegisterGuide(true)}
                  className="font-semibold text-red-700 dark:text-red-400 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Daftar &rarr;
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 relative min-h-[280px] lg:min-h-full bg-red-950">
            {!imgFailed ? (
              <img
                src="/src/assets/images/latisha_clinic_hero_1795004724363.jpg"
                alt="Interior Apotek Klinis Latisha Farma"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-red-900 via-rose-950 to-slate-900 text-white">
                <Stethoscope className="w-12 h-12 text-red-300 mb-3" />
                <p className="font-display font-semibold text-lg">Latisha Farma Clinical Hub</p>
                <p className="text-xs text-red-100 mt-1">
                  Pharmaceutical Care &amp; Enterprise POS
                </p>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-red-950/90 via-slate-950/30 to-transparent flex flex-col justify-end p-8">
              <p className="text-xs text-red-200 font-medium">
                Standar Pelayanan Kefarmasian PMK No. 73
              </p>
              <p className="mt-1 text-base font-display font-semibold text-white">
                Keamanan Terapi Pasien &amp; Akselerasi Omset Apotek Modern
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Panduan Pendaftaran Akun Karyawan */}
      {showRegisterGuide && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-red-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 text-red-700 dark:text-red-400">
                <Info className="w-5 h-5 shrink-0" />
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Pendaftaran Akun Karyawan ApotekSu
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Untuk menjaga keamanan data rekam medis dan stok obat apotek, penambahan akun karyawan
              baru dilakukan oleh <strong>Apoteker Penanggung Jawab (APA)</strong> melalui menu:
            </p>

            <div className="p-3.5 rounded-xl bg-red-50/70 dark:bg-slate-950 border border-red-100 dark:border-slate-800 text-xs space-y-1.5">
              <div className="font-semibold text-red-800 dark:text-red-300">
                Master Data &rarr; Data Karyawan &rarr; + Tambah Karyawan
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                Sistem akan otomatis memberikan nomor urut <strong>ID Karyawan</strong> berikutnya
                yang belum terpakai (contoh: <span className="font-mono">ID-001</span>,{' '}
                <span className="font-mono">ID-002</span>, dst.).
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowRegisterGuide(false)}
                className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-medium cursor-pointer"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
