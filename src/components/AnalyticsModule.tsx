import { useMemo, useState } from 'react';
import { BarChart3, CalendarRange, TrendingDown, TrendingUp } from 'lucide-react';
import { formatIDR, formatMultiUnitStock, getBaseHpp } from '../lib/formatters';
import type { Medicine, TransactionRecord } from '../types/pharmacy';

interface AnalyticsModuleProps {
  transactions: TransactionRecord[];
  medicines: Medicine[];
}

const SEASONAL_PROFILES = [
  {
    key: 'Musim Hujan',
    label: 'Musim Hujan (Nov – Feb)',
    demandIndex: 138,
    focusSummary:
      'Lonjakan kasus ISPA, demam, rinitis alergi, dan infeksi saluran cerna. Tingkatkan buffer stok antibiotik oral, mukolitik, paracetamol, dan vitamin C + zinc sebesar +35%.',
    monthlyCurve: [105, 112, 128, 138, 132, 118],
    months: ['Sep', 'Okt', 'Nov', 'Des', 'Jan', 'Feb'],
  },
  {
    key: 'Pancaroba',
    label: 'Musim Pancaroba (Mar – Apr & Sep – Okt)',
    demandIndex: 126,
    focusSummary:
      'Fluktuasi suhu memicu alergi pernapasan, batuk pilek berulang, dan kelelahan. Optimalkan paket bundling OTC + suplemen daya tahan tubuh di meja kasir.',
    monthlyCurve: [100, 115, 126, 122, 108, 119],
    months: ['Feb', 'Mar', 'Apr', 'Mei', 'Agu', 'Sep'],
  },
  {
    key: 'Ramadhan',
    label: 'Ramadhan & Idul Fitri',
    demandIndex: 134,
    focusSummary:
      'Kenaikan tajam permintaan obat GERD/maag (Omeprazole), penyesuaian jadwal obat kronis (hipertensi/diabetes), dan vitamin neurotropik.',
    monthlyCurve: [98, 106, 124, 134, 129, 104],
    months: ['H-60', 'H-30', 'Mgg-1', 'Mgg-3', 'Lebaran', 'H+14'],
  },
  {
    key: 'Liburan',
    label: 'Musim Liburan & Akhir Tahun',
    demandIndex: 118,
    focusSummary:
      'Permintaan obat P3K perjalanan, analgesik nyeri otot, diare akut (probiotik + oralit), dan multivitamin keluarga.',
    monthlyCurve: [96, 102, 110, 118, 115, 101],
    months: ['Okt', 'Nov', 'Des-1', 'Des-3', 'Jan-1', 'Jan-3'],
  },
];

export function AnalyticsModule({ transactions, medicines }: AnalyticsModuleProps) {
  const [periodMode, setPeriodMode] = useState<'Harian' | 'Bulanan' | 'Tahunan'>('Bulanan');
  const [selectedSeason, setSelectedSeason] = useState<string>('Musim Hujan');

  const kpis = useMemo(() => {
    const totalRevenue = transactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const totalProfit = transactions.reduce((sum, t) => sum + t.grossProfit, 0);
    const totalReceivables = transactions.reduce((sum, t) => sum + t.remainingBalance, 0);
    const avgBasket = transactions.length > 0 ? totalRevenue / transactions.length : 0;

    let crossSellRevenue = 0;
    transactions.forEach((t) => {
      t.items.forEach((it) => {
        if (it.isCrossSell) crossSellRevenue += it.lineTotal;
      });
    });
    const crossSellShare = totalRevenue > 0 ? (crossSellRevenue / totalRevenue) * 100 : 0;
    const grossMarginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalProfit,
      grossMarginPct,
      avgBasket,
      crossSellRevenue,
      crossSellShare,
      totalReceivables,
    };
  }, [transactions]);

  // ICD-10 Disease-based Sales Aggregation
  const icd10Stats = useMemo(() => {
    const map = new Map<
      string,
      { diagnosis: string; revenue: number; profit: number; txCount: number; topDrugs: Map<string, number> }
    >();

    transactions.forEach((tx) => {
      const diag = tx.diagnosisIcd10 || 'Z00.0 - Umum';
      const current = map.get(diag) ?? {
        diagnosis: diag,
        revenue: 0,
        profit: 0,
        txCount: 0,
        topDrugs: new Map<string, number>(),
      };
      current.revenue += tx.totalAmount;
      current.profit += tx.grossProfit;
      current.txCount += 1;
      tx.items.forEach((it) => {
        current.topDrugs.set(it.name, (current.topDrugs.get(it.name) ?? 0) + it.qty);
      });
      map.set(diag, current);
    });

    const rows = Array.from(map.values())
      .map((r) => {
        const sortedDrugs = Array.from(r.topDrugs.entries()).sort((a, b) => b[1] - a[1]);
        return {
          diagnosis: r.diagnosis,
          revenue: r.revenue,
          profit: r.profit,
          txCount: r.txCount,
          topDrug: sortedDrugs[0]?.[0] || '-',
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const maxRevenue = Math.max(1, ...rows.map((r) => r.revenue));
    return { rows, maxRevenue };
  }, [transactions]);

  // Fast-moving vs Slow-moving
  const productMovement = useMemo(() => {
    const soldMap = new Map<number, { qtyBase: number; revenue: number; profit: number }>();
    transactions.forEach((tx) => {
      tx.items.forEach((it) => {
        const cur = soldMap.get(it.medicineId) ?? { qtyBase: 0, revenue: 0, profit: 0 };
        cur.qtyBase += it.baseQtyDeducted;
        cur.revenue += it.lineTotal;
        cur.profit += it.lineTotal - it.hppUnit * it.qty;
        soldMap.set(it.medicineId, cur);
      });
    });

    const enriched = medicines.map((m) => {
      const stats = soldMap.get(m.id) ?? { qtyBase: 0, revenue: 0, profit: 0 };
      return { medicine: m, ...stats };
    });

    const fastMoving = [...enriched]
      .filter((e) => e.qtyBase > 0)
      .sort((a, b) => b.qtyBase - a.qtyBase)
      .slice(0, 6);

    const slowMoving = enriched
      .filter((e) => e.medicine.isSlowMoving || e.qtyBase === 0)
      .sort((a, b) => a.qtyBase - b.qtyBase)
      .slice(0, 6);

    return { fastMoving, slowMoving };
  }, [medicines, transactions]);

  // Gross Profit & Loss Projection Table (Daily, Monthly, Yearly)
  const profitLossRows = useMemo(() => {
    const groups = new Map<
      string,
      { label: string; txCount: number; revenue: number; hpp: number; profit: number }
    >();

    transactions.forEach((tx) => {
      const d = tx.transactionDate || '2026-11-18';
      let key = d;
      if (periodMode === 'Bulanan') key = d.slice(0, 7);
      if (periodMode === 'Tahunan') key = d.slice(0, 4);

      const cur = groups.get(key) ?? {
        label: key,
        txCount: 0,
        revenue: 0,
        hpp: 0,
        profit: 0,
      };
      cur.txCount += 1;
      cur.revenue += tx.totalAmount;
      cur.hpp += tx.totalHpp;
      cur.profit += tx.grossProfit;
      groups.set(key, cur);
    });

    return Array.from(groups.values()).sort((a, b) => b.label.localeCompare(a.label));
  }, [transactions, periodMode]);

  const seasonProfile =
    SEASONAL_PROFILES.find((s) => s.key === selectedSeason) ?? SEASONAL_PROFILES[0];

  const seasonalMedicines = useMemo(
    () =>
      medicines.filter((m) =>
        (m.seasonalTags || []).some((tag) =>
          tag.toLowerCase().includes(selectedSeason.toLowerCase())
        )
      ),
    [medicines, selectedSeason]
  );

  // SVG points for Seasonal Trend Curve
  const svgPoints = useMemo(() => {
    const width = 460;
    const height = 140;
    const padX = 24;
    const padY = 18;
    const minVal = 85;
    const maxVal = 145;
    return seasonProfile.monthlyCurve.map((val, idx) => {
      const x =
        padX + (idx / Math.max(1, seasonProfile.monthlyCurve.length - 1)) * (width - padX * 2);
      const y =
        height - padY - ((val - minVal) / (maxVal - minVal)) * (height - padY * 2);
      return { x, y, val, label: seasonProfile.months[idx] };
    });
  }, [seasonProfile]);

  const polylineStr = svgPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Analitik Penjualan Pintar &amp; Intelijen Klinis
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Korelasi tren diagnosa ICD-10 · Proyeksi musim &amp; stok · Fast/Slow-moving · Laba-rugi kotor
          </p>
        </div>
      </div>

      {/* 4-column KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Omset Penjualan</div>
          <div className="mt-1.5 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {formatIDR(kpis.totalRevenue)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Dari {transactions.length} transaksi tercatat
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Laba Kotor (Gross Profit)</div>
          <div className="mt-1.5 font-display text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {formatIDR(kpis.totalProfit)}
          </div>
          <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-400 tabular-nums">
            Margin kotor rata-rata {kpis.grossMarginPct.toFixed(1)}%
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Rata-Rata Basket &amp; Cross-Sell</div>
          <div className="mt-1.5 font-display text-2xl font-bold text-red-700 dark:text-red-400 tabular-nums">
            {formatIDR(kpis.avgBasket)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Kontribusi Cross-Sell: {kpis.crossSellShare.toFixed(1)}% ({formatIDR(kpis.crossSellRevenue)})
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Piutang Tempo Berjalan</div>
          <div className="mt-1.5 font-display text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
            {formatIDR(kpis.totalReceivables)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Resep instansi, klinik &amp; member tempo
          </div>
        </div>
      </div>

      {/* ICD-10 Disease Analytics & Seasonal Projection */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* ICD-10 Bar Chart */}
        <div className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-red-600" />
              <h3 className="font-display font-semibold text-sm">
                Tren Penjualan Berbasis Diagnosa Penyakit (ICD-10)
              </h3>
            </div>
            <span className="text-xs text-slate-500">Omset &amp; Obat Dominan</span>
          </div>

          <div className="space-y-3.5">
            {icd10Stats.rows.map((row) => {
              const widthPct = Math.max(8, Math.round((row.revenue / icd10Stats.maxRevenue) * 100));
              return (
                <div key={row.diagnosis} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      {row.diagnosis}
                    </span>
                    <span className="font-mono font-semibold text-red-700 dark:text-red-400 tabular-nums shrink-0">
                      {formatIDR(row.revenue)}
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-red-50 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-600 dark:bg-red-500 rounded-full transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Terlaris: {row.topDrug}</span>
                    <span className="tabular-nums">
                      {row.txCount} resep · Laba {formatIDR(row.profit)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Seasonal & Trend Analysis */}
        <div className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-emerald-600" />
              <h3 className="font-display font-semibold text-sm">
                Proyeksi Tren Musiman &amp; Kesiapan Stok
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
              Indeks Permintaan: {seasonProfile.demandIndex}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SEASONAL_PROFILES.map((sp) => (
              <button
                key={sp.key}
                type="button"
                onClick={() => setSelectedSeason(sp.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  selectedSeason === sp.key
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {sp.key}
              </button>
            ))}
          </div>

          <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
            <svg viewBox="0 0 460 155" className="w-full h-36 overflow-visible">
              <line x1="24" y1="122" x2="436" y2="122" stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
              <polyline
                fill="none"
                stroke="#059669"
                strokeWidth="2.5"
                points={polylineStr}
              />
              {svgPoints.map((pt, idx) => (
                <g key={idx}>
                  <circle cx={pt.x} cy={pt.y} r="4" fill="#4F46E5" />
                  <text
                    x={pt.x}
                    y={pt.y - 8}
                    textAnchor="middle"
                    className="fill-slate-700 dark:fill-slate-300 text-[10px] font-mono"
                  >
                    {pt.val}
                  </text>
                  <text
                    x={pt.x}
                    y={144}
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px]"
                  >
                    {pt.label}
                  </text>
                </g>
              ))}
            </svg>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              {seasonProfile.focusSummary}
            </p>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="font-semibold text-slate-700 dark:text-slate-200">
              Produk Prioritas Pengadaan ({seasonProfile.label}):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {seasonalMedicines.slice(0, 4).map((m) => (
                <div
                  key={m.id}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                >
                  <span className="font-medium truncate">{m.name}</span>
                  <span className="font-mono text-slate-500 shrink-0 tabular-nums">
                    {m.stockBase} {m.unitBase}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Fast-Moving vs Slow-Moving */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <h3 className="font-display font-semibold text-sm">
              Produk Terlaris (Fast-Moving)
            </h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {productMovement.fastMoving.map((item) => (
              <div key={item.medicine.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {item.medicine.name}
                  </div>
                  <div className="text-slate-500">
                    {item.medicine.categoryName} · Stok: {formatMultiUnitStock(item.medicine)}
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div className="font-bold text-emerald-700 dark:text-emerald-400">
                    {item.qtyBase} {item.medicine.unitBase} terjual
                  </div>
                  <div className="text-slate-500">Omset {formatIDR(item.revenue)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-amber-600" />
            <h3 className="font-display font-semibold text-sm">
              Produk Mengendap (Slow-Moving &amp; Perlu Promosi)
            </h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {productMovement.slowMoving.map((item) => (
              <div key={item.medicine.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {item.medicine.name}
                  </div>
                  <div className="text-slate-500">
                    ED: {item.medicine.expiryDate} · Stok: {formatMultiUnitStock(item.medicine)}
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div className="font-semibold text-amber-700 dark:text-amber-400">
                    {item.qtyBase} terjual
                  </div>
                  <div className="text-slate-500">
                    Nilai HPP: {formatIDR(getBaseHpp(item.medicine) * item.medicine.stockBase)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Profit & Loss Projection Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display font-semibold text-sm">
            Laporan Proyeksi Laba-Rugi Kotor ({periodMode})
          </h3>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(['Harian', 'Bulanan', 'Tahunan'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPeriodMode(m)}
                className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                  periodMode === m
                    ? 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500">
                <th className="py-3 px-4 font-semibold">Periode</th>
                <th className="py-3 px-4 font-semibold text-right">Jumlah Transaksi</th>
                <th className="py-3 px-4 font-semibold text-right">Omset Penjualan</th>
                <th className="py-3 px-4 font-semibold text-right">Total HPP</th>
                <th className="py-3 px-4 font-semibold text-right">Laba Kotor</th>
                <th className="py-3 px-4 font-semibold text-right">Margin (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
              {profitLossRows.map((row) => {
                const margin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;
                return (
                  <tr key={row.label}>
                    <td className="py-3 px-4 font-mono font-semibold">{row.label}</td>
                    <td className="py-3 px-4 text-right">{row.txCount}</td>
                    <td className="py-3 px-4 text-right font-medium">{formatIDR(row.revenue)}</td>
                    <td className="py-3 px-4 text-right text-slate-500">{formatIDR(row.hpp)}</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-700 dark:text-emerald-400">
                      {formatIDR(row.profit)}
                    </td>
                    <td className="py-3 px-4 text-right">{margin.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
