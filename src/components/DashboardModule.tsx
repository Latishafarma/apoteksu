import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  FileText,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDateID, formatIDR } from '../lib/formatters';
import type {
  ActiveModule,
  Medicine,
  PrescriptionRecord,
  TransactionRecord,
} from '../types/pharmacy';

interface DashboardModuleProps {
  transactions: TransactionRecord[];
  prescriptions: PrescriptionRecord[];
  medicines: Medicine[];
  onNavigate: (module: ActiveModule) => void;
}

type PeriodKey = 'today' | 'week' | 'month';
type ChartViewMode = 'summary' | 'daily7';

function getLocalIsoDate(dateObj: Date): string {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysIso(baseDateStr: string, deltaDays: number): string {
  const dt = new Date(`${baseDateStr}T00:00:00`);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalIsoDate(dt);
}

function formatShortDay(isoDate: string): string {
  const dt = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return isoDate;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

function formatCompactRp(value: number): string {
  if (value >= 1_000_000) {
    return `Rp ${(value / 1_000_000).toFixed(1).replace('.0', '')} jt`;
  }
  if (value >= 1_000) {
    return `Rp ${Math.round(value / 1_000)} rb`;
  }
  return `Rp ${value}`;
}

export function DashboardModule({
  transactions,
  prescriptions,
  medicines,
  onNavigate,
}: DashboardModuleProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('month');
  const [chartView, setChartView] = useState<ChartViewMode>('summary');

  const todayStr = useMemo(() => getLocalIsoDate(new Date()), []);
  const weekStartStr = useMemo(() => addDaysIso(todayStr, -6), [todayStr]);
  const currentMonthPrefix = useMemo(() => todayStr.slice(0, 7), [todayStr]);

  // Deduplicated prescription count per date combining `prescriptions` & `Resep Dokter` POS transactions
  const getPrescriptionsServedCount = (
    txList: TransactionRecord[],
    rxList: PrescriptionRecord[]
  ): number => {
    const byDate = new Map<string, { rxTable: number; rxTx: number }>();

    rxList.forEach((rx) => {
      if (rx.status === 'Menunggu') return;
      const d = rx.rxDate || todayStr;
      const cur = byDate.get(d) ?? { rxTable: 0, rxTx: 0 };
      cur.rxTable += 1;
      byDate.set(d, cur);
    });

    txList.forEach((tx) => {
      if (tx.prescriptionType !== 'Resep Dokter') return;
      const d = tx.transactionDate || todayStr;
      const cur = byDate.get(d) ?? { rxTable: 0, rxTx: 0 };
      cur.rxTx += 1;
      byDate.set(d, cur);
    });

    let total = 0;
    byDate.forEach((v) => {
      total += Math.max(v.rxTable, v.rxTx);
    });
    return total;
  };

  const periodStats = useMemo(() => {
    const compute = (
      label: string,
      txFilter: (t: TransactionRecord) => boolean,
      rxFilter: (r: PrescriptionRecord) => boolean
    ) => {
      const txs = transactions.filter(txFilter);
      const rxs = prescriptions.filter(rxFilter);
      const netRevenue = txs.reduce((sum, t) => sum + t.totalAmount, 0);
      const grossProfit = txs.reduce((sum, t) => sum + t.grossProfit, 0);
      const txCount = txs.length;
      const rxServed = getPrescriptionsServedCount(txs, rxs);
      const avgBasket = txCount > 0 ? Math.round(netRevenue / txCount) : 0;

      return {
        label,
        txCount,
        netRevenue,
        grossProfit,
        rxServed,
        avgBasket,
      };
    };

    const today = compute(
      'Hari Ini',
      (t) => t.transactionDate === todayStr,
      (r) => r.rxDate === todayStr
    );

    const week = compute(
      'Minggu Ini',
      (t) => t.transactionDate >= weekStartStr && t.transactionDate <= todayStr,
      (r) => r.rxDate >= weekStartStr && r.rxDate <= todayStr
    );

    const month = compute(
      'Bulan Ini',
      (t) => (t.transactionDate || '').startsWith(currentMonthPrefix),
      (r) => (r.rxDate || '').startsWith(currentMonthPrefix)
    );

    return { today, week, month };
  }, [transactions, prescriptions, todayStr, weekStartStr, currentMonthPrefix]);

  const activeStats = periodStats[selectedPeriod];

  const periodComparisonChartData = useMemo(
    () => [
      {
        periode: 'Hari Ini',
        transaksi: periodStats.today.txCount,
        resep: periodStats.today.rxServed,
        omzet: periodStats.today.netRevenue,
      },
      {
        periode: 'Minggu Ini',
        transaksi: periodStats.week.txCount,
        resep: periodStats.week.rxServed,
        omzet: periodStats.week.netRevenue,
      },
      {
        periode: 'Bulan Ini',
        transaksi: periodStats.month.txCount,
        resep: periodStats.month.rxServed,
        omzet: periodStats.month.netRevenue,
      },
    ],
    [periodStats]
  );

  const daily7ChartData = useMemo(() => {
    const days: { periode: string; transaksi: number; resep: number; omzet: number }[] = [];
    for (let offset = -6; offset <= 0; offset++) {
      const dateStr = addDaysIso(todayStr, offset);
      const dayTxs = transactions.filter((t) => t.transactionDate === dateStr);
      const dayRxs = prescriptions.filter((r) => r.rxDate === dateStr);
      days.push({
        periode: formatShortDay(dateStr),
        transaksi: dayTxs.length,
        resep: getPrescriptionsServedCount(dayTxs, dayRxs),
        omzet: dayTxs.reduce((sum, t) => sum + t.totalAmount, 0),
      });
    }
    return days;
  }, [todayStr, transactions, prescriptions]);

  const activeChartData =
    chartView === 'summary' ? periodComparisonChartData : daily7ChartData;

  const lowStockCount = useMemo(
    () => medicines.filter((m) => m.stockBase <= m.minStockBase).length,
    [medicines]
  );

  const recentTransactions = useMemo(
    () => transactions.slice(0, 5),
    [transactions]
  );

  return (
    <div className="space-y-6">
      {/* Page Header & Period Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Dasbor Ringkasan Operasional Apotek
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ringkasan transaksi, omzet bersih, dan pelayanan resep · Tanggal acuan{' '}
            {formatDateID(todayStr)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
            {(
              [
                { key: 'today', label: 'Hari Ini' },
                { key: 'week', label: 'Minggu Ini' },
                { key: 'month', label: 'Bulan Ini' },
              ] as const
            ).map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setSelectedPeriod(p.key)}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedPeriod === p.key
                    ? 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onNavigate('pos')}
            className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Buka Kasir POS</span>
          </button>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Total Transaksi ({activeStats.label})
          </div>
          <div className="mt-1.5 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {activeStats.txCount}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Hari ini: {periodStats.today.txCount} · Minggu: {periodStats.week.txCount} · Bulan:{' '}
            {periodStats.month.txCount}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Omzet Bersih ({activeStats.label})
          </div>
          <div className="mt-1.5 font-display text-2xl font-bold text-red-700 dark:text-red-400 tabular-nums">
            {formatIDR(activeStats.netRevenue)}
          </div>
          <div className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400 tabular-nums">
            Laba kotor: {formatIDR(activeStats.grossProfit)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Resep Dilayani ({activeStats.label})
          </div>
          <div className="mt-1.5 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {activeStats.rxServed} Resep
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Hari ini: {periodStats.today.rxServed} · Minggu: {periodStats.week.rxServed} · Bulan:{' '}
            {periodStats.month.rxServed}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Rata-Rata Keranjang ({activeStats.label})
          </div>
          <div className="mt-1.5 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {formatIDR(activeStats.avgBasket)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Item stok menipis: {lowStockCount} produk
          </div>
        </div>
      </div>

      {/* Chart Mode Switcher + Two Recharts Bar Charts */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-red-700 dark:text-red-400" />
            <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
              Visualisasi Grafik Batang Kinerja Apotek
            </h3>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
            <button
              type="button"
              onClick={() => setChartView('summary')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                chartView === 'summary'
                  ? 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Hari Ini / Minggu / Bulan
            </button>
            <button
              type="button"
              onClick={() => setChartView('daily7')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                chartView === 'daily7'
                  ? 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Tren 7 Hari Terakhir
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart 1: Total Transaksi & Jumlah Resep Dilayani */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                  Total Transaksi &amp; Resep Dilayani
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {chartView === 'summary'
                    ? 'Perbandingan periode Hari Ini, Minggu Ini, dan Bulan Ini'
                    : 'Volume harian transaksi & resep 7 hari terakhir'}
                </p>
              </div>
              <FileText className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            </div>

            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activeChartData}
                  margin={{ top: 12, right: 12, left: -12, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="periode"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '0.75rem',
                      border: '1px solid #fecaca',
                      fontSize: '12px',
                    }}
                    formatter={(value, name) => [
                      `${Number(value ?? 0)}`,
                      name === 'transaksi' ? 'Total Transaksi' : 'Resep Dilayani',
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                    formatter={(value) =>
                      value === 'transaksi' ? 'Total Transaksi' : 'Resep Dilayani'
                    }
                  />
                  <Bar
                    dataKey="transaksi"
                    name="transaksi"
                    fill="#b91c1c"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                  />
                  <Bar
                    dataKey="resep"
                    name="resep"
                    fill="#059669"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar Chart 2: Omzet Bersih */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                  Grafik Omzet Bersih (IDR)
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {chartView === 'summary'
                    ? 'Akumulasi omzet bersih Hari Ini, Minggu Ini, dan Bulan Ini'
                    : 'Pergerakan omzet bersih harian 7 hari terakhir'}
                </p>
              </div>
              <TrendingUp className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            </div>

            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activeChartData}
                  margin={{ top: 12, right: 12, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="periode"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(val) => formatCompactRp(Number(val))}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '0.75rem',
                      border: '1px solid #fecaca',
                      fontSize: '12px',
                    }}
                    formatter={(value) => [formatIDR(Number(value ?? 0)), 'Omzet Bersih']}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                    formatter={() => 'Omzet Bersih (Rp)'}
                  />
                  <Bar
                    dataKey="omzet"
                    name="omzet"
                    fill="#dc2626"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={52}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Period Summary Table + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h4 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
              Rekap Periode Berjalan
            </h4>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="text-xs font-medium text-red-700 dark:text-red-400 hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span>Analitik Detail</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4 font-semibold">Periode</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Transaksi</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Resep</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Omzet Bersih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                {[periodStats.today, periodStats.week, periodStats.month].map((row) => (
                  <tr key={row.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                      {row.label}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold">{row.txCount}</td>
                    <td className="py-3 px-3 text-right text-emerald-700 dark:text-emerald-400 font-semibold">
                      {row.rxServed}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-red-700 dark:text-red-400">
                      {formatIDR(row.netRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h4 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
              Transaksi Terakhir di Kasir
            </h4>
            <button
              type="button"
              onClick={() => onNavigate('pos')}
              className="text-xs font-medium text-red-700 dark:text-red-400 hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span>Semua Transaksi</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4 font-semibold">Invoice</th>
                  <th className="py-2.5 px-3 font-semibold">Tanggal</th>
                  <th className="py-2.5 px-3 font-semibold">Pasien / Layanan</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                {recentTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-mono font-medium text-red-700 dark:text-red-400">
                      {tx.invoiceNo}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                      {formatDateID(tx.transactionDate)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-medium text-slate-900 dark:text-white">
                        {tx.patientName}
                      </span>
                      <span className="text-slate-400 mx-1.5" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {tx.prescriptionType}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-semibold text-slate-900 dark:text-white">
                      {formatIDR(tx.totalAmount)}
                    </td>
                  </tr>
                ))}
                {recentTransactions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      Belum ada transaksi tercatat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
