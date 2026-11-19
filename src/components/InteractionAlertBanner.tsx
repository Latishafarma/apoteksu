import { AlertTriangle, Info, ShieldAlert, FileWarning } from 'lucide-react';
import type { DetectedInteractionAlert } from '../lib/drugInteractions';

interface InteractionAlertBannerProps {
  alerts: DetectedInteractionAlert[];
  contextTitle?: string;
  onEscalateToSoap?: (alert: DetectedInteractionAlert) => void;
}

export function InteractionAlertBanner({
  alerts,
  contextTitle = 'Peringatan Interaksi Obat Otomatis',
  onEscalateToSoap,
}: InteractionAlertBannerProps) {
  if (alerts.length === 0) {
    return null;
  }

  const majorCount = alerts.filter((a) => a.severity === 'Major').length;
  const moderateCount = alerts.filter((a) => a.severity === 'Moderate').length;

  return (
    <div
      role="alert"
      className={`rounded-xl border p-4 space-y-3 ${
        majorCount > 0
          ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
          : 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {majorCount > 0 ? (
            <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          )}
          <h4 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
            {contextTitle}
          </h4>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium tabular-nums">
          {majorCount > 0 && (
            <span className="text-rose-700 dark:text-rose-300">
              {majorCount} Interaksi Major
            </span>
          )}
          {majorCount > 0 && moderateCount > 0 && (
            <span className="text-slate-400" aria-hidden="true">·</span>
          )}
          {moderateCount > 0 && (
            <span className="text-amber-700 dark:text-amber-300">
              {moderateCount} Interaksi Moderate
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-200/80 dark:divide-slate-800 bg-white/80 dark:bg-slate-900/80 rounded-lg border border-slate-200/70 dark:border-slate-800">
        {alerts.map((alert, idx) => {
          const isMajor = alert.severity === 'Major';
          const isModerate = alert.severity === 'Moderate';
          return (
            <div key={`${alert.ruleId}-${idx}`} className="p-3 space-y-1.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                  {isMajor ? (
                    <FileWarning className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  ) : isModerate ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  ) : (
                    <Info className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
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
                <span className="text-slate-500 dark:text-slate-400">
                  Sumber: {alert.sourceContext} · Bukti: {alert.evidenceLevel}
                  {alert.literature ? ` · Literatur: ${alert.literature}` : ''}
                </span>
              </div>
              <p className="text-slate-700 dark:text-slate-300">
                <strong className="font-medium text-slate-900 dark:text-slate-100">Efek Klinis:</strong>{' '}
                {alert.clinicalEffect} ({alert.mechanism})
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-emerald-800 dark:text-emerald-300 font-medium">
                  Rekomendasi Apoteker: {alert.managementAdvice}
                </p>
                {onEscalateToSoap && (
                  <button
                    type="button"
                    onClick={() => onEscalateToSoap(alert)}
                    className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white font-medium text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Catat ke SOAP / DRP
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
