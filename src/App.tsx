import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Building2,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  ShoppingBag,
  ShoppingCart,
  Stethoscope,
  Sun,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { auth } from './lib/firebase';
import pharmacistAvatarImg from './assets/images/pharmacist_avatar_1795004725785.jpg';
import {
  apiRequest,
  getStoredTenantSession,
  setStoredTenantSession,
  type StoredTenantSession,
} from './lib/apiClient';
import type { DetectedInteractionAlert } from './lib/drugInteractions';
import type {
  ActiveModule,
  BootstrapPayload,
  ClinicalCareRecord,
  DrugCategory,
  DrugInteractionRule,
  Employee,
  MasterSubMenu,
  Medicine,
  ObatBatch,
  Patient,
  PrescriptionRecord,
  PurchaseOrder,
  StockAuditLog,
  Supplier,
  SwamedikasiLog,
  TransactionRecord,
  TransactionSubMenu,
} from './types/pharmacy';
import { AuthGate } from './components/AuthGate';
import { DashboardModule } from './components/DashboardModule';
import { PosModule } from './components/PosModule';
import { TransactionModule } from './components/TransactionModule';
import { ClinicalModule } from './components/ClinicalModule';
import { MasterDataModule } from './components/MasterDataModule';
import { InventorySupplyChainModule } from './components/InventorySupplyChainModule';
import { AnalyticsModule } from './components/AnalyticsModule';
import { SupabaseBackupModule } from './components/SupabaseBackupModule';

const NAV_ITEMS: {
  id: ActiveModule;
  label: string;
  icon: typeof ShoppingCart;
}[] = [
  { id: 'dashboard', label: 'Dasbor', icon: LayoutDashboard },
  { id: 'pos', label: 'Kasir & POS Cerdas', icon: ShoppingCart },
  { id: 'transactions', label: 'Transaksi', icon: ReceiptText },
  { id: 'clinical', label: 'Pharmaceutical Care', icon: Stethoscope },
  { id: 'master', label: 'Master Data', icon: Package },
  { id: 'inventory', label: 'Stok & Rantai Pasok', icon: Boxes },
  { id: 'analytics', label: 'Analitik & Intelijen', icon: BarChart3 },
  { id: 'supabase', label: 'Supabase & Backup', icon: Database },
];

const TRANSACTION_SUBMENUS: {
  id: TransactionSubMenu;
  label: string;
  icon: typeof ShoppingCart;
}[] = [
  { id: 'penjualan', label: 'Penjualan', icon: ShoppingCart },
  { id: 'pembelian', label: 'Pembelian', icon: ShoppingBag },
];

const MASTER_SUBMENUS: { id: MasterSubMenu; label: string; icon: typeof Package }[] = [
  { id: 'produk', label: 'Data Produk', icon: Package },
  { id: 'pelanggan', label: 'Data Pasien & Member', icon: Users },
  { id: 'supplier', label: 'Data Supplier', icon: Building2 },
  { id: 'karyawan', label: 'Data Karyawan', icon: UserCheck },
];

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [tenantSession, setTenantSession] = useState<StoredTenantSession | null>(() =>
    getStoredTenantSession()
  );
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<ActiveModule>('dashboard');
  const [transactionSubMenu, setTransactionSubMenu] = useState<TransactionSubMenu>('penjualan');
  const [masterSubMenu, setMasterSubMenu] = useState<MasterSubMenu>('produk');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [fieldDarkMode, setFieldDarkMode] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Cross-module bridges
  const [queuedPosItems, setQueuedPosItems] = useState<
    { medicineId: number; qty: number; unitType: 'Box' | 'Strip' | 'Pcs'; isCrossSell: boolean }[]
  >([]);
  const [escalatedDraft, setEscalatedDraft] = useState<{
    alert: DetectedInteractionAlert;
    patientId: number | null;
  } | null>(null);

  // Sync Tailwind v4 dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (fieldDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [fieldDarkMode]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (!user && !getStoredTenantSession()) {
        setData(null);
      }
    });
    return () => unsub();
  }, []);

  const fetchBootstrap = useCallback(async () => {
    setLoadingData(true);
    setLoadError(null);
    try {
      const payload = await apiRequest<BootstrapPayload>('/api/bootstrap');
      setData(payload);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal memuat data operasional.';
      if (
        message.includes('Unauthorized') ||
        message.includes('tidak valid atau kedaluwarsa') ||
        message.includes('Sesi autentikasi berakhir')
      ) {
        setStoredTenantSession(null);
        setTenantSession(null);
        setData(null);
        return;
      }
      setLoadError(message);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (authReady && (authUser || tenantSession)) {
      fetchBootstrap();
    }
  }, [authReady, authUser, tenantSession, fetchBootstrap]);

  const handleLogout = useCallback(async () => {
    setStoredTenantSession(null);
    setTenantSession(null);
    setData(null);
    setActiveModule('dashboard');
    if (auth.currentUser) {
      await signOut(auth);
    }
  }, []);

  const handleTransactionCreated = useCallback(
    (tx: TransactionRecord, options?: { allowNegativeStock?: boolean }) => {
      const allowNeg = Boolean(options?.allowNegativeStock);
      setData((prev) => {
        if (!prev) return prev;
        const updatedMedicines = prev.medicines.map((med) => {
          const deducted = tx.items
            .filter((i) => i.medicineId === med.id)
            .reduce((sum, i) => sum + i.baseQtyDeducted, 0);
          if (deducted <= 0) return med;
          return {
            ...med,
            stockBase: allowNeg ? med.stockBase - deducted : Math.max(0, med.stockBase - deducted),
          };
        });

        // Mirror backend batch deduction locally (pinned batchId first, then FEFO fallback)
        const specificBatchDeductions = new Map<number, number>();
        const fefoNeedByMed = new Map<number, number>();

        for (const it of tx.items) {
          if (!it.medicineId || it.baseQtyDeducted <= 0) continue;
          if (it.batchId) {
            specificBatchDeductions.set(
              it.batchId,
              (specificBatchDeductions.get(it.batchId) ?? 0) + it.baseQtyDeducted
            );
          } else {
            fefoNeedByMed.set(
              it.medicineId,
              (fefoNeedByMed.get(it.medicineId) ?? 0) + it.baseQtyDeducted
            );
          }
        }

        const afterSpecificBatches = prev.batches.map((b) => {
          const specificNeed = specificBatchDeductions.get(b.id) ?? 0;
          if (specificNeed <= 0) return b;
          if (allowNeg) {
            return { ...b, qtyRemaining: b.qtyRemaining - specificNeed };
          }
          const take = Math.min(Math.max(0, b.qtyRemaining), specificNeed);
          const unfulfilled = specificNeed - take;
          if (unfulfilled > 0) {
            fefoNeedByMed.set(b.medicineId, (fefoNeedByMed.get(b.medicineId) ?? 0) + unfulfilled);
          }
          return { ...b, qtyRemaining: b.qtyRemaining - take };
        });

        const sortedBatches = [...afterSpecificBatches].sort(
          (a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.id - b.id
        );
        const updatedBatches = sortedBatches.map((b) => {
          const remNeed = fefoNeedByMed.get(b.medicineId) ?? 0;
          if (remNeed <= 0 || b.qtyRemaining <= 0) return b;
          const take = Math.min(b.qtyRemaining, remNeed);
          fefoNeedByMed.set(b.medicineId, remNeed - take);
          return { ...b, qtyRemaining: b.qtyRemaining - take };
        });

        const earnedPoints = Math.floor(tx.totalAmount / 10000);
        const updatedPatients = prev.patients.map((p) =>
          p.id === tx.patientId
            ? {
                ...p,
                points: p.points + earnedPoints,
                receivableBalance: p.receivableBalance + tx.remainingBalance,
              }
            : p
        );
        return {
          ...prev,
          medicines: updatedMedicines,
          batches: updatedBatches,
          patients: updatedPatients,
          transactions: [tx, ...prev.transactions],
        };
      });
    },
    []
  );

  const handleReceivablePaid = useCallback((updatedTx: TransactionRecord) => {
    setData((prev) => {
      if (!prev) return prev;
      const oldTx = prev.transactions.find((t) => t.id === updatedTx.id);
      const paidDelta = oldTx
        ? Math.max(0, oldTx.remainingBalance - updatedTx.remainingBalance)
        : 0;
      return {
        ...prev,
        transactions: prev.transactions.map((t) =>
          t.id === updatedTx.id ? updatedTx : t
        ),
        patients: prev.patients.map((p) =>
          p.id === updatedTx.patientId
            ? { ...p, receivableBalance: Math.max(0, p.receivableBalance - paidDelta) }
            : p
        ),
      };
    });
  }, []);

  const handlePatientCreated = useCallback((patient: Patient) => {
    setData((prev) =>
      prev ? { ...prev, patients: [...prev.patients, patient] } : prev
    );
  }, []);

  const handlePatientSaved = useCallback((patient: Patient, isEdit: boolean) => {
    setData((prev) => {
      if (!prev) return prev;
      const patients = isEdit
        ? prev.patients.map((p) => (p.id === patient.id ? patient : p))
        : [...prev.patients, patient];
      return { ...prev, patients };
    });
  }, []);

  const handlePatientDeleted = useCallback((id: number) => {
    setData((prev) =>
      prev ? { ...prev, patients: prev.patients.filter((p) => p.id !== id) } : prev
    );
  }, []);

  const handleSupplierSaved = useCallback((supplier: Supplier, isEdit: boolean) => {
    setData((prev) => {
      if (!prev) return prev;
      const suppliers = isEdit
        ? prev.suppliers.map((s) => (s.id === supplier.id ? supplier : s))
        : [...prev.suppliers, supplier];
      return { ...prev, suppliers };
    });
  }, []);

  const handleSupplierDeleted = useCallback((id: number) => {
    setData((prev) =>
      prev ? { ...prev, suppliers: prev.suppliers.filter((s) => s.id !== id) } : prev
    );
  }, []);

  const handleEmployeeSaved = useCallback((employee: Employee, isEdit: boolean) => {
    setData((prev) => {
      if (!prev) return prev;
      const employees = isEdit
        ? prev.employees.map((e) => (e.id === employee.id ? employee : e))
        : [...prev.employees, employee];
      return { ...prev, employees };
    });
  }, []);

  const handleEmployeeDeleted = useCallback((id: number) => {
    setData((prev) =>
      prev ? { ...prev, employees: prev.employees.filter((e) => e.id !== id) } : prev
    );
  }, []);

  const handleMedicineSaved = useCallback((med: Medicine, isEdit: boolean) => {
    setData((prev) => {
      if (!prev) return prev;
      const medicines = isEdit
        ? prev.medicines.map((m) => (m.id === med.id ? med : m))
        : [...prev.medicines, med];
      return { ...prev, medicines };
    });
  }, []);

  const handleMedicineDeleted = useCallback((id: number) => {
    setData((prev) =>
      prev
        ? { ...prev, medicines: prev.medicines.filter((m) => m.id !== id) }
        : prev
    );
  }, []);

  const handleCategoryCreated = useCallback((cat: DrugCategory) => {
    setData((prev) =>
      prev ? { ...prev, categories: [...prev.categories, cat] } : prev
    );
  }, []);

  const handleCategoryDeleted = useCallback((id: number) => {
    setData((prev) =>
      prev
        ? { ...prev, categories: prev.categories.filter((c) => c.id !== id) }
        : prev
    );
  }, []);

  const handleClinicalRecordCreated = useCallback((rec: ClinicalCareRecord) => {
    setData((prev) =>
      prev ? { ...prev, clinicalRecords: [rec, ...prev.clinicalRecords] } : prev
    );
  }, []);

  const handleClinicalRecordUpdated = useCallback((rec: ClinicalCareRecord) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            clinicalRecords: prev.clinicalRecords.map((r) =>
              r.id === rec.id ? rec : r
            ),
          }
        : prev
    );
  }, []);

  const handleSwamedikasiCreated = useCallback((log: SwamedikasiLog) => {
    setData((prev) =>
      prev ? { ...prev, swamedikasiLogs: [log, ...prev.swamedikasiLogs] } : prev
    );
  }, []);

  const handleInteractionRuleCreated = useCallback((rule: DrugInteractionRule) => {
    setData((prev) =>
      prev
        ? { ...prev, drugInteractions: [rule, ...prev.drugInteractions] }
        : prev
    );
  }, []);

  const handleGoodsReceiptRecorded = useCallback(
    (res: { batch: ObatBatch; medicine: Medicine; auditLog: StockAuditLog }) => {
      setData((prev) =>
        prev
          ? {
              ...prev,
              batches: [...prev.batches, res.batch].sort((a, b) =>
                a.expiryDate.localeCompare(b.expiryDate)
              ),
              medicines: prev.medicines.map((m) =>
                m.id === res.medicine.id ? res.medicine : m
              ),
              stockAuditLogs: [res.auditLog, ...prev.stockAuditLogs],
            }
          : prev
      );
    },
    []
  );

  const handleStockOpnameRecorded = useCallback(
    (res: { batch: ObatBatch; medicine: Medicine; auditLog: StockAuditLog }) => {
      setData((prev) =>
        prev
          ? {
              ...prev,
              batches: prev.batches.map((b) =>
                b.id === res.batch.id ? res.batch : b
              ),
              medicines: prev.medicines.map((m) =>
                m.id === res.medicine.id ? res.medicine : m
              ),
              stockAuditLogs: [res.auditLog, ...prev.stockAuditLogs],
            }
          : prev
      );
    },
    []
  );

  const handlePurchaseOrderCreated = useCallback((po: PurchaseOrder) => {
    setData((prev) =>
      prev ? { ...prev, purchaseOrders: [po, ...prev.purchaseOrders] } : prev
    );
  }, []);

  const handlePurchaseOrderUpdated = useCallback((po: PurchaseOrder) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            purchaseOrders: prev.purchaseOrders.map((p) => (p.id === po.id ? po : p)),
          }
        : prev
    );
  }, []);

  const handlePrescriptionSaved = useCallback((rx: PrescriptionRecord, isEdit: boolean) => {
    setData((prev) => {
      if (!prev) return prev;
      const prescriptions = isEdit
        ? (prev.prescriptions || []).map((r) => (r.id === rx.id ? rx : r))
        : [rx, ...(prev.prescriptions || [])];
      return { ...prev, prescriptions };
    });
  }, []);

  const handlePrescriptionDeleted = useCallback((id: number) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            prescriptions: (prev.prescriptions || []).filter((r) => r.id !== id),
          }
        : prev
    );
  }, []);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-xs text-slate-600 dark:text-slate-300">
        Memuat sesi autentikasi ApotekSu...
      </div>
    );
  }

  if (!authUser && !tenantSession) {
    return (
      <AuthGate
        onLoginSuccess={(session) => {
          setStoredTenantSession(session);
          setTenantSession(session);
        }}
      />
    );
  }

  const visibleNavItems = NAV_ITEMS;

  const activeNavLabel =
    visibleNavItems.find((n) => n.id === activeModule)?.label || 'Dasbor';
  const activeSubLabel =
    activeModule === 'transactions'
      ? TRANSACTION_SUBMENUS.find((s) => s.id === transactionSubMenu)?.label || 'Penjualan'
      : MASTER_SUBMENUS.find((s) => s.id === masterSubMenu)?.label || 'Data Produk';
  const displayName =
    data?.user?.name || authUser?.displayName || tenantSession?.user.name || 'Apt. Latisha';
  const displayNip = data?.user?.nip || tenantSession?.user.nip;
  const displayEmail = displayNip
    ? `ID: ${displayNip}`
    : data?.user?.email || authUser?.email || tenantSession?.user.email || '';
  const displaySubtitle =
    data?.user?.jobTitle ||
    tenantSession?.user.jobTitle ||
    'Apoteker Operasional';

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-red-50/45 to-rose-100/50 dark:from-slate-950 dark:via-slate-950 dark:to-red-950/25 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      {!sidebarCollapsed && (
        <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-white dark:bg-slate-900 border-r border-red-100 dark:border-slate-800 sticky top-0 h-screen">
          <div className="px-5 py-5 border-b border-red-100 dark:border-slate-800 bg-gradient-to-r from-red-700 to-rose-700 text-white flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 font-display font-bold text-base">
                <Stethoscope className="w-5 h-5 shrink-0" />
                <span className="truncate">Latisha Farma</span>
              </div>
              <p className="mt-1 text-xs text-red-100">
                Clinical &amp; Retail Pharmacy
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="p-1.5 rounded-lg text-red-100 hover:text-white hover:bg-white/15 transition-colors cursor-pointer shrink-0"
              aria-label="Sembunyikan sidebar navigasi"
              title="Sembunyikan Sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = activeModule === item.id;
              return (
                <div key={item.id} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setActiveModule(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-red-700 text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                  {item.id === 'transactions' && active && (
                    <div className="pl-5 space-y-0.5">
                      {TRANSACTION_SUBMENUS.map((sub) => {
                        const SubIcon = sub.icon;
                        const subActive = transactionSubMenu === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => {
                              setActiveModule('transactions');
                              setTransactionSubMenu(sub.id);
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                              subActive
                                ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <SubIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>{sub.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Pharmacist Account Footer */}
          <div className="p-4 border-t border-red-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-3">
              {!avatarFailed ? (
                <img
                  src={pharmacistAvatarImg}
                  alt="Foto Apoteker Penanggung Jawab"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="w-9 h-9 rounded-full object-cover border border-red-200 dark:border-slate-700 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-bold text-xs flex items-center justify-center shrink-0">
                  LF
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {displayName}
                </div>
                <div className="text-[11px] text-slate-500 truncate">{displayEmail}</div>
                <div className="text-[10px] font-medium text-red-700 dark:text-red-400 truncate">
                  {displaySubtitle}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="w-full py-2 px-3 rounded-lg border border-red-200 dark:border-slate-800 hover:bg-red-50 dark:hover:bg-slate-800 text-xs font-medium flex items-center justify-center gap-2 cursor-pointer text-red-700 dark:text-red-300"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar Sesi</span>
            </button>
          </div>
        </aside>
      )}

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 h-full p-4 flex flex-col justify-between z-10">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-red-100 dark:border-slate-800">
                <span className="font-display font-bold text-base text-red-700 dark:text-red-400">
                  Latisha Farma
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="mt-4 space-y-1 overflow-y-auto max-h-[75vh]">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeModule === item.id;
                  return (
                    <div key={item.id} className="space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveModule(item.id);
                          if (item.id !== 'transactions') {
                            setMobileMenuOpen(false);
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium cursor-pointer ${
                          active
                            ? 'bg-red-700 text-white'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-red-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </button>
                      {item.id === 'transactions' && active && (
                        <div className="pl-5 space-y-0.5">
                          {TRANSACTION_SUBMENUS.map((sub) => {
                            const SubIcon = sub.icon;
                            const subActive = transactionSubMenu === sub.id;
                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => {
                                  setActiveModule('transactions');
                                  setTransactionSubMenu(sub.id);
                                  setMobileMenuOpen(false);
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer ${
                                  subActive
                                    ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              >
                                <SubIcon className="w-3.5 h-3.5" />
                                <span>{sub.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            </div>
            <div className="space-y-2 pt-3 border-t border-red-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2.5 px-3 rounded-xl border border-red-200 dark:border-slate-800 text-xs font-medium flex items-center justify-center gap-2 cursor-pointer text-red-700 dark:text-red-300"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar Sesi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean Top Header Bar (Strict 3-zone SaaS contract) */}
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-red-100 dark:border-slate-800 px-4 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-red-200 dark:border-slate-800 cursor-pointer"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-4 h-4 text-red-700 dark:text-red-400" />
            </button>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-slate-800 hover:bg-red-50 dark:hover:bg-slate-800 text-xs font-medium text-red-700 dark:text-red-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              aria-label={sidebarCollapsed ? 'Tampilkan sidebar navigasi' : 'Sembunyikan sidebar navigasi'}
              title={sidebarCollapsed ? 'Tampilkan Sidebar' : 'Sembunyikan Sidebar'}
            >
              {sidebarCollapsed ? (
                <>
                  <PanelLeftOpen className="w-4 h-4" />
                  <span>Menu</span>
                </>
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
            <div className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 truncate">
              <span className="text-red-700 dark:text-red-400 font-semibold">Latisha Farma</span>
              <span className="mx-2" aria-hidden="true">/</span>
              <span
                className={
                  activeModule === 'master' || activeModule === 'transactions'
                    ? 'text-slate-600 dark:text-slate-300'
                    : 'text-slate-900 dark:text-white font-semibold'
                }
              >
                {activeNavLabel}
              </span>
              {(activeModule === 'master' || activeModule === 'transactions') && (
                <>
                  <span className="mx-2" aria-hidden="true">/</span>
                  <span className="text-slate-900 dark:text-white font-semibold">
                    {activeSubLabel}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setFieldDarkMode((v) => !v)}
              className="px-3.5 py-2 rounded-xl border border-red-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {fieldDarkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Mode Siang Klinik</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-red-700" />
                  <span>Mode Operasional Lapangan</span>
                </>
              )}
            </button>
          </div>
        </header>

        <main
          className={`flex-1 p-4 lg:p-8 w-full mx-auto transition-all ${
            sidebarCollapsed || activeModule === 'pos' ? 'max-w-full' : 'max-w-[1440px]'
          }`}
        >
          {loadingData && !data && (
            <div className="space-y-4">
              <div className="h-12 bg-red-100/60 dark:bg-slate-800/70 rounded-xl animate-pulse" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="h-64 bg-red-100/60 dark:bg-slate-800/70 rounded-xl animate-pulse lg:col-span-2" />
                <div className="h-64 bg-red-100/60 dark:bg-slate-800/70 rounded-xl animate-pulse" />
              </div>
            </div>
          )}

          {loadError && (
            <div className="p-6 rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-sm space-y-3">
              <p className="font-semibold">Gagal Memuat Basis Data Apotek</p>
              <p className="text-xs">{loadError}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={fetchBootstrap}
                  className="px-4 py-2 rounded-lg bg-rose-700 text-white text-xs font-medium cursor-pointer"
                >
                  Muat Ulang Data
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-lg border border-rose-300 dark:border-rose-700 text-xs font-medium cursor-pointer"
                >
                  Keluar Sesi
                </button>
              </div>
            </div>
          )}

          {data && (
            <>
              {data.license?.configured &&
                data.license.reachable &&
                !data.license.allowed ? (
                <div className="max-w-xl mx-auto my-10 p-6 rounded-2xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 space-y-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                        Akses Lisensi ApotekSu Ditangguhkan ({data.license.status})
                      </h2>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {data.license.message}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest('/api/license/verify-now', { method: 'POST' });
                        await fetchBootstrap();
                      }}
                      className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      Periksa Ulang Status Lisensi
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                    >
                      Keluar Sesi
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {data.license?.configured &&
                    data.license.accessLevel === 'grace_warning' && (
                      <div className="mb-5 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>
                            <strong>Status Lisensi: {data.license.status}.</strong>{' '}
                            {data.license.message}
                          </span>
                        </div>
                      </div>
                    )}

                  {activeModule === 'dashboard' && (
                    <DashboardModule
                      transactions={data.transactions}
                      prescriptions={data.prescriptions || []}
                      medicines={data.medicines}
                      onNavigate={setActiveModule}
                    />
                  )}

              {activeModule === 'pos' && (
                <PosModule
                  medicines={data.medicines}
                  categories={data.categories}
                  patients={data.patients}
                  batches={data.batches}
                  prescriptions={data.prescriptions || []}
                  rxBundles={data.rxBundles}
                  transactions={data.transactions}
                  clinicalRecords={data.clinicalRecords}
                  interactionRules={data.drugInteractions}
                  cashierName={data.user.name || 'Apt. Latisha'}
                  queuedItems={queuedPosItems}
                  onClearQueuedItems={() => setQueuedPosItems([])}
                  onTransactionCreated={handleTransactionCreated}
                  onReceivablePaid={handleReceivablePaid}
                  onPatientCreated={handlePatientCreated}
                  onPrescriptionSaved={handlePrescriptionSaved}
                  onPrescriptionDeleted={handlePrescriptionDeleted}
                  onClinicalRecordCreated={handleClinicalRecordCreated}
                  onEscalateInteraction={(alert, patientId) => {
                    setEscalatedDraft({ alert, patientId });
                    setActiveModule('clinical');
                  }}
                />
              )}

              {activeModule === 'transactions' && (
                <TransactionModule
                  activeSubMenu={transactionSubMenu}
                  onChangeSubMenu={setTransactionSubMenu}
                  transactions={data.transactions}
                  purchaseOrders={data.purchaseOrders}
                  medicines={data.medicines}
                  patients={data.patients}
                  suppliers={data.suppliers}
                  operatorName={data.user.name || 'Apt. Latisha'}
                  onRefreshData={fetchBootstrap}
                />
              )}

              {activeModule === 'clinical' && (
                <ClinicalModule
                  patients={data.patients}
                  medicines={data.medicines}
                  clinicalRecords={data.clinicalRecords}
                  transactions={data.transactions}
                  swamedikasiLogs={data.swamedikasiLogs}
                  interactionRules={data.drugInteractions}
                  pharmacistName={data.user.name || 'Apt. Latisha, S.Farm'}
                  escalatedDraft={escalatedDraft}
                  onClearEscalatedDraft={() => setEscalatedDraft(null)}
                  onClinicalRecordCreated={handleClinicalRecordCreated}
                  onClinicalRecordUpdated={handleClinicalRecordUpdated}
                  onSwamedikasiCreated={handleSwamedikasiCreated}
                  onInteractionRuleCreated={handleInteractionRuleCreated}
                  onSendSwamedikasiToPos={(items) => {
                    setQueuedPosItems(items);
                    setActiveModule('pos');
                  }}
                />
              )}

              {activeModule === 'master' && (
                <MasterDataModule
                  activeSubMenu={masterSubMenu}
                  onChangeSubMenu={setMasterSubMenu}
                  medicines={data.medicines}
                  categories={data.categories}
                  patients={data.patients}
                  suppliers={data.suppliers}
                  employees={data.employees}
                  onMedicineSaved={handleMedicineSaved}
                  onMedicineDeleted={handleMedicineDeleted}
                  onCategoryCreated={handleCategoryCreated}
                  onCategoryDeleted={handleCategoryDeleted}
                  onPatientSaved={handlePatientSaved}
                  onPatientDeleted={handlePatientDeleted}
                  onSupplierSaved={handleSupplierSaved}
                  onSupplierDeleted={handleSupplierDeleted}
                  onEmployeeSaved={handleEmployeeSaved}
                  onEmployeeDeleted={handleEmployeeDeleted}
                />
              )}

              {activeModule === 'inventory' && (
                <InventorySupplyChainModule
                  medicines={data.medicines}
                  suppliers={data.suppliers}
                  batches={data.batches}
                  stockAuditLogs={data.stockAuditLogs}
                  purchaseOrders={data.purchaseOrders}
                  pharmacistName={data.user.name || 'Apt. Latisha, S.Farm'}
                  onGoodsReceiptRecorded={handleGoodsReceiptRecorded}
                  onStockOpnameRecorded={handleStockOpnameRecorded}
                  onPurchaseOrderCreated={handlePurchaseOrderCreated}
                  onPurchaseOrderUpdated={handlePurchaseOrderUpdated}
                />
              )}

              {activeModule === 'analytics' && (
                <AnalyticsModule
                  transactions={data.transactions}
                  medicines={data.medicines}
                />
              )}

                  {activeModule === 'supabase' && (
                    <SupabaseBackupModule
                      data={data}
                      onRefreshData={fetchBootstrap}
                    />
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
