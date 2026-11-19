import { useMemo, useState } from 'react';
import {
  Building2,
  Calculator,
  Edit3,
  FolderPlus,
  Info,
  Package,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/apiClient';
import { formatDateID, formatIDR, formatMultiUnitStock } from '../lib/formatters';
import type {
  DrugCategory,
  Employee,
  MasterSubMenu,
  Medicine,
  Patient,
  Supplier,
} from '../types/pharmacy';

interface MasterDataModuleProps {
  activeSubMenu: MasterSubMenu;
  onChangeSubMenu: (sub: MasterSubMenu) => void;
  medicines: Medicine[];
  categories: DrugCategory[];
  patients: Patient[];
  suppliers: Supplier[];
  employees: Employee[];
  onMedicineSaved: (med: Medicine, isEdit: boolean) => void;
  onMedicineDeleted: (id: number) => void;
  onCategoryCreated: (cat: DrugCategory) => void;
  onCategoryDeleted: (id: number) => void;
  onPatientSaved: (patient: Patient, isEdit: boolean) => void;
  onPatientDeleted: (id: number) => void;
  onSupplierSaved: (supplier: Supplier, isEdit: boolean) => void;
  onSupplierDeleted: (id: number) => void;
  onEmployeeSaved: (employee: Employee, isEdit: boolean) => void;
  onEmployeeDeleted: (id: number) => void;
}

interface MedicineFormState {
  id: number | null;
  sku: string;
  barcode: string;
  name: string;
  genericName: string;
  categoryName: string;
  classification: string;
  indication: string;
  contraindication: string;
  sideEffects: string;
  dosageInstructions: string;
  icd10TagsText: string;
  seasonalTagsText: string;
  hppMode: 'manual' | 'hna_ppn';
  hna: number;
  ppnPercent: number;
  hpp: number;
  marginReguler: number;
  marginKlinik: number;
  marginMitra: number;
  unitBase: string;
  unitStrip: string;
  pcsPerStrip: number;
  unitBox: string;
  stripsPerBox: number;
  stockBase: number;
  minStockBase: number;
  expiryDate: string;
  isSlowMoving: boolean;
}

interface PatientFormState {
  id: number | null;
  mrn: string;
  name: string;
  phone: string;
  birthDate: string;
  gender: string;
  address: string;
  memberTier: string;
  allergies: string;
  chronicConditions: string;
  receivableLimit: number;
}

interface SupplierFormState {
  id: number | null;
  code: string;
  name: string;
  category: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  paymentTerms: string;
  npwp: string;
  status: string;
}

interface EmployeeFormState {
  id: number | null;
  nip: string;
  name: string;
  role: string;
  sipaStrNumber: string;
  phone: string;
  email: string;
  shift: string;
  status: string;
  joinDate: string;
}

const emptyMedicineForm = (defaultCat = 'Analgesik & Antipiretik'): MedicineFormState => ({
  id: null,
  sku: `LF-OBT-${Math.floor(100 + Math.random() * 899)}`,
  barcode: `899100100${Math.floor(200 + Math.random() * 799)}`,
  name: '',
  genericName: '',
  categoryName: defaultCat,
  classification: 'Bebas',
  indication: '',
  contraindication: '',
  sideEffects: '',
  dosageInstructions: '',
  icd10TagsText: 'J06.9',
  seasonalTagsText: 'Musim Hujan',
  hppMode: 'hna_ppn',
  hna: 100000,
  ppnPercent: 11,
  hpp: 111000,
  marginReguler: 35,
  marginKlinik: 20,
  marginMitra: 12,
  unitBase: 'Tablet',
  unitStrip: 'Strip',
  pcsPerStrip: 10,
  unitBox: 'Box',
  stripsPerBox: 10,
  stockBase: 100,
  minStockBase: 30,
  expiryDate: '2028-06-30',
  isSlowMoving: false,
});

const emptyPatientForm = (): PatientFormState => ({
  id: null,
  mrn: `RM-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 899)}`,
  name: '',
  phone: '',
  birthDate: '1990-01-01',
  gender: 'Perempuan',
  address: '',
  memberTier: 'Reguler',
  allergies: 'Tidak ada',
  chronicConditions: 'Tidak ada',
  receivableLimit: 500000,
});

const emptySupplierForm = (): SupplierFormState => ({
  id: null,
  code: `PBF-${Math.floor(100 + Math.random() * 899)}`,
  name: '',
  category: 'Obat Ethical & OTC',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  paymentTerms: 'Net 30',
  npwp: '',
  status: 'Aktif',
});

const getNextEmployeeId = (existingEmployees: Employee[]): string => {
  const usedIds = new Set(existingEmployees.map((e) => e.nip.trim().toUpperCase()));
  let maxNum = 0;
  for (const emp of existingEmployees) {
    const match = /^ID-(\d+)$/i.exec(emp.nip.trim());
    if (match) {
      const num = Number.parseInt(match[1], 10);
      if (Number.isFinite(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  let nextNum = maxNum + 1;
  let candidate = `ID-${String(nextNum).padStart(3, '0')}`;
  while (usedIds.has(candidate)) {
    nextNum += 1;
    candidate = `ID-${String(nextNum).padStart(3, '0')}`;
  }
  return candidate;
};

const emptyEmployeeForm = (existingEmployees: Employee[] = []): EmployeeFormState => ({
  id: null,
  nip: getNextEmployeeId(existingEmployees),
  name: '',
  role: 'Tenaga Teknis Kefarmasian (TTK)',
  sipaStrNumber: '',
  phone: '',
  email: '',
  shift: 'Shift Pagi',
  status: 'Aktif',
  joinDate: new Date().toISOString().slice(0, 10),
});

export function MasterDataModule({
  activeSubMenu,
  onChangeSubMenu,
  medicines,
  categories,
  patients,
  suppliers,
  employees,
  onMedicineSaved,
  onMedicineDeleted,
  onCategoryCreated,
  onCategoryDeleted,
  onPatientSaved,
  onPatientDeleted,
  onSupplierSaved,
  onSupplierDeleted,
  onEmployeeSaved,
  onEmployeeDeleted,
}: MasterDataModuleProps) {
  // Medicine states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('Semua');
  const [filterClass, setFilterClass] = useState('Semua');
  const [clinicalDetailMed, setClinicalDetailMed] = useState<Medicine | null>(null);
  const [showMedModal, setShowMedModal] = useState(false);
  const [form, setForm] = useState<MedicineFormState>(() => emptyMedicineForm());
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  // Patient states
  const [patientSearch, setPatientSearch] = useState('');
  const [filterTier, setFilterTier] = useState('Semua');
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [patientForm, setPatientForm] = useState<PatientFormState>(() => emptyPatientForm());

  // Supplier states
  const [supplierSearch, setSupplierSearch] = useState('');
  const [filterTerms, setFilterTerms] = useState('Semua');
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(() => emptySupplierForm());

  // Employee states
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [filterShift, setFilterShift] = useState('Semua');
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [employeeForm, setEmployeeForm] = useState<EmployeeFormState>(() =>
    emptyEmployeeForm(employees)
  );

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const boxMultiplier = useMemo(
    () =>
      Math.max(
        1,
        Math.max(1, Number(form.pcsPerStrip) || 1) *
          Math.max(1, Number(form.stripsPerBox) || 1)
      ),
    [form.pcsPerStrip, form.stripsPerBox]
  );

  const computedHna = useMemo(() => {
    const ppn = Number(form.ppnPercent) > 0 ? Number(form.ppnPercent) : 11;
    if (form.hppMode === 'manual') {
      return Math.round(form.hpp / (1 + ppn / 100));
    }
    return Math.round(form.hna);
  }, [form.hppMode, form.hna, form.ppnPercent, form.hpp]);

  const computedHpp = useMemo(() => {
    const ppn = Number(form.ppnPercent) >= 0 ? Number(form.ppnPercent) : 11;
    if (form.hppMode === 'hna_ppn') {
      return Math.round(form.hna * (1 + ppn / 100));
    }
    return Math.round(form.hpp);
  }, [form.hppMode, form.hna, form.ppnPercent, form.hpp]);

  const computedPrices = useMemo(() => {
    const hppPerBase = computedHpp / boxMultiplier;
    const calcBase = (margin: number) => Math.max(1, Math.round(hppPerBase * (1 + margin / 100)));
    const calcBesar = (margin: number) => Math.round(computedHpp * (1 + margin / 100));
    return {
      reguler: calcBase(form.marginReguler),
      regulerBesar: calcBesar(form.marginReguler),
      klinik: calcBase(form.marginKlinik),
      klinikBesar: calcBesar(form.marginKlinik),
      mitra: calcBesar(form.marginMitra),
      mitraBase: calcBase(form.marginMitra),
    };
  }, [computedHpp, boxMultiplier, form.marginReguler, form.marginKlinik, form.marginMitra]);

  const filteredMedicines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return medicines.filter((m) => {
      if (filterCategory !== 'Semua' && m.categoryName !== filterCategory) return false;
      if (filterClass !== 'Semua' && m.classification !== filterClass) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.genericName.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        m.indication.toLowerCase().includes(q)
      );
    });
  }, [medicines, searchQuery, filterCategory, filterClass]);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    return patients.filter((p) => {
      if (filterTier !== 'Semua' && p.memberTier !== filterTier) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.mrn.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.allergies.toLowerCase().includes(q) ||
        p.chronicConditions.toLowerCase().includes(q)
      );
    });
  }, [patients, patientSearch, filterTier]);

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (filterTerms !== 'Semua' && s.paymentTerms !== filterTerms) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.contactPerson.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q)
      );
    });
  }, [suppliers, supplierSearch, filterTerms]);

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    return employees.filter((e) => {
      if (filterShift !== 'Semua' && e.shift !== filterShift) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.nip.toLowerCase().includes(q) ||
        e.role.toLowerCase().includes(q) ||
        e.sipaStrNumber.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q)
      );
    });
  }, [employees, employeeSearch, filterShift]);

  // --- Medicine Handlers ---
  const openEditMedicine = (med: Medicine) => {
    const boxMult = Math.max(1, (med.pcsPerStrip || 1) * (med.stripsPerBox || 1));
    const isLegacyBase = boxMult > 1 && med.hpp <= med.priceReguler * 2;
    const ppn = Number(med.ppnPercent) || 11;
    const rawHppBesar = isLegacyBase ? Math.round(med.hpp * boxMult) : med.hpp;
    const rawHnaBesar = isLegacyBase
      ? Math.round(med.hna * boxMult)
      : med.hna || Math.round(rawHppBesar / (1 + ppn / 100));
    const mode = med.hppMode === 'manual' ? 'manual' : 'hna_ppn';
    const syncedHnaBesar =
      mode === 'manual' ? Math.round(rawHppBesar / (1 + ppn / 100)) : rawHnaBesar;
    const syncedHppBesar =
      mode === 'manual' ? rawHppBesar : Math.round(syncedHnaBesar * (1 + ppn / 100));

    setForm({
      id: med.id,
      sku: med.sku,
      barcode: med.barcode,
      name: med.name,
      genericName: med.genericName,
      categoryName: med.categoryName,
      classification: med.classification,
      indication: med.indication,
      contraindication: med.contraindication,
      sideEffects: med.sideEffects,
      dosageInstructions: med.dosageInstructions,
      icd10TagsText: (med.icd10Tags || []).join(', '),
      seasonalTagsText: (med.seasonalTags || []).join(', '),
      hppMode: mode,
      hna: syncedHnaBesar,
      ppnPercent: ppn,
      hpp: syncedHppBesar,
      marginReguler: Number(med.marginReguler) || 30,
      marginKlinik: Number(med.marginKlinik) || 18,
      marginMitra: Number(med.marginMitra) || 10,
      unitBase: med.unitBase,
      unitStrip: med.unitStrip,
      pcsPerStrip: med.pcsPerStrip,
      unitBox: med.unitBox,
      stripsPerBox: med.stripsPerBox,
      stockBase: med.stockBase,
      minStockBase: med.minStockBase,
      expiryDate: med.expiryDate,
      isSlowMoving: med.isSlowMoving,
    });
    setShowMedModal(true);
  };

  const handleSaveMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      const cat = categories.find((c) => c.name === form.categoryName);
      const payload = {
        sku: form.sku.trim(),
        barcode: form.barcode.trim(),
        name: form.name.trim(),
        genericName: form.genericName.trim(),
        categoryId: cat?.id ?? null,
        categoryName: form.categoryName,
        classification: form.classification,
        indication: form.indication.trim(),
        contraindication: form.contraindication.trim(),
        sideEffects: form.sideEffects.trim(),
        dosageInstructions: form.dosageInstructions.trim(),
        icd10Tags: form.icd10TagsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        seasonalTags: form.seasonalTagsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        hppMode: form.hppMode,
        hna: computedHna,
        ppnPercent: form.ppnPercent.toFixed(2),
        hpp: computedHpp,
        marginReguler: form.marginReguler.toFixed(2),
        priceReguler: computedPrices.reguler,
        marginKlinik: form.marginKlinik.toFixed(2),
        priceKlinik: computedPrices.klinik,
        marginMitra: form.marginMitra.toFixed(2),
        priceMitra: computedPrices.mitra,
        unitBase: form.unitBase,
        unitStrip: form.unitStrip,
        pcsPerStrip: Math.max(1, form.pcsPerStrip),
        unitBox: form.unitBox,
        stripsPerBox: Math.max(1, form.stripsPerBox),
        stockBase: Math.max(0, form.stockBase),
        minStockBase: Math.max(0, form.minStockBase),
        expiryDate: form.expiryDate,
        isSlowMoving: form.isSlowMoving,
      };

      const saved = form.id
        ? await apiRequest<Medicine>(`/api/medicines/${form.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiRequest<Medicine>('/api/medicines', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      onMedicineSaved(saved, Boolean(form.id));
      setShowMedModal(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan data produk.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMedicine = async (id: number) => {
    try {
      await apiRequest(`/api/medicines/${id}`, { method: 'DELETE' });
      onMedicineDeleted(id);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus produk.');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      const created = await apiRequest<DrugCategory>('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCatName, description: newCatDesc }),
      });
      onCategoryCreated(created);
      setNewCatName('');
      setNewCatDesc('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah kategori.');
    }
  };

  const handleDeleteCategory = async (id: number) => {
    try {
      await apiRequest(`/api/categories/${id}`, { method: 'DELETE' });
      onCategoryDeleted(id);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus kategori.');
    }
  };

  // --- Patient Handlers ---
  const openEditPatient = (p: Patient) => {
    setPatientForm({
      id: p.id,
      mrn: p.mrn,
      name: p.name,
      phone: p.phone,
      birthDate: p.birthDate || '1990-01-01',
      gender: p.gender || 'Perempuan',
      address: p.address || '',
      memberTier: p.memberTier || 'Reguler',
      allergies: p.allergies || 'Tidak ada',
      chronicConditions: p.chronicConditions || 'Tidak ada',
      receivableLimit: p.receivableLimit ?? 500000,
    });
    setShowPatientModal(true);
  };

  const handleSavePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload = {
        mrn: patientForm.mrn.trim(),
        name: patientForm.name.trim(),
        phone: patientForm.phone.trim(),
        birthDate: patientForm.birthDate,
        gender: patientForm.gender,
        address: patientForm.address.trim(),
        memberTier: patientForm.memberTier,
        allergies: patientForm.allergies.trim() || 'Tidak ada',
        chronicConditions: patientForm.chronicConditions.trim() || 'Tidak ada',
        receivableLimit: Math.max(0, Number(patientForm.receivableLimit) || 0),
      };
      const saved = patientForm.id
        ? await apiRequest<Patient>(`/api/patients/${patientForm.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiRequest<Patient>('/api/patients', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      onPatientSaved(saved, Boolean(patientForm.id));
      setShowPatientModal(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan data pelanggan/pasien.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePatient = async (id: number) => {
    try {
      await apiRequest(`/api/patients/${id}`, { method: 'DELETE' });
      onPatientDeleted(id);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus data pelanggan/pasien.');
    }
  };

  // --- Supplier Handlers ---
  const openEditSupplier = (s: Supplier) => {
    setSupplierForm({
      id: s.id,
      code: s.code,
      name: s.name,
      category: s.category,
      contactPerson: s.contactPerson,
      phone: s.phone,
      email: s.email,
      address: s.address,
      paymentTerms: s.paymentTerms,
      npwp: s.npwp,
      status: s.status,
    });
    setShowSupplierModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload = {
        code: supplierForm.code.trim(),
        name: supplierForm.name.trim(),
        category: supplierForm.category.trim(),
        contactPerson: supplierForm.contactPerson.trim(),
        phone: supplierForm.phone.trim(),
        email: supplierForm.email.trim(),
        address: supplierForm.address.trim(),
        paymentTerms: supplierForm.paymentTerms,
        npwp: supplierForm.npwp.trim(),
        status: supplierForm.status,
      };
      const saved = supplierForm.id
        ? await apiRequest<Supplier>(`/api/suppliers/${supplierForm.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiRequest<Supplier>('/api/suppliers', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      onSupplierSaved(saved, Boolean(supplierForm.id));
      setShowSupplierModal(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan data supplier.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSupplier = async (id: number) => {
    try {
      await apiRequest(`/api/suppliers/${id}`, { method: 'DELETE' });
      onSupplierDeleted(id);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus data supplier.');
    }
  };

  // --- Employee Handlers ---
  const openEditEmployee = (emp: Employee) => {
    setEmployeeForm({
      id: emp.id,
      nip: emp.nip,
      name: emp.name,
      role: emp.role,
      sipaStrNumber: emp.sipaStrNumber,
      phone: emp.phone,
      email: emp.email,
      shift: emp.shift,
      status: emp.status,
      joinDate: emp.joinDate,
    });
    setShowEmployeeModal(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload = {
        nip: employeeForm.nip.trim(),
        name: employeeForm.name.trim(),
        role: employeeForm.role,
        sipaStrNumber: employeeForm.sipaStrNumber.trim(),
        phone: employeeForm.phone.trim(),
        email: employeeForm.email.trim(),
        shift: employeeForm.shift,
        status: employeeForm.status,
        joinDate: employeeForm.joinDate,
      };
      const saved = employeeForm.id
        ? await apiRequest<Employee>(`/api/employees/${employeeForm.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiRequest<Employee>('/api/employees', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      onEmployeeSaved(saved, Boolean(employeeForm.id));
      setShowEmployeeModal(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan data karyawan.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEmployee = async (id: number) => {
    try {
      await apiRequest(`/api/employees/${id}`, { method: 'DELETE' });
      onEmployeeDeleted(id);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus data karyawan.');
    }
  };

  const subMenuMeta: Record<MasterSubMenu, { title: string; subtitle: string }> = {
    produk: {
      title: 'Master Data — Data Produk',
      subtitle:
        'Kalkulator HPP (HNA + PPN 11%) · Harga berjenjang 3 tier · Stok multi-satuan & informasi klinis',
    },
    pelanggan: {
      title: 'Master Data — Data Pasien & Member',
      subtitle:
        'Rekam medis ringkas (MRN), profil alergi obat, tier member, poin loyalitas & plafon piutang',
    },
    supplier: {
      title: 'Master Data — Data Supplier',
      subtitle:
        'Direktori Pedagang Besar Farmasi (PBF) resmi, kontak PIC, termin pembayaran & NPWP',
    },
    karyawan: {
      title: 'Master Data — Data Karyawan',
      subtitle:
        'Manajemen Apoteker Penanggung Jawab (APA), TTK, kasir, nomor SIPA/STRTTK & jadwal shift',
    },
  };

  const tabs: { id: MasterSubMenu; label: string; count: number; icon: typeof Package }[] = [
    { id: 'produk', label: 'Data Produk', count: medicines.length, icon: Package },
    { id: 'pelanggan', label: 'Data Pasien & Member', count: patients.length, icon: Users },
    { id: 'supplier', label: 'Data Supplier', count: suppliers.length, icon: Building2 },
    { id: 'karyawan', label: 'Data Karyawan', count: employees.length, icon: UserCheck },
  ];

  return (
    <div className="space-y-6">
      {/* Submenu Switcher Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 border border-red-100 dark:border-slate-800 rounded-xl p-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubMenu === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeSubMenu(tab.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-red-700 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
              <span
                className={`text-[11px] tabular-nums ${
                  isActive ? 'text-red-100' : 'text-slate-400'
                }`}
              >
                ({tab.count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Header & Contextual Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            {subMenuMeta[activeSubMenu].title}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {subMenuMeta[activeSubMenu].subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeSubMenu === 'produk' && (
            <>
              <button
                type="button"
                onClick={() => setShowCatModal(true)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Kelola Kategori ({categories.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(emptyMedicineForm(categories[0]?.name || 'Analgesik & Antipiretik'));
                  setShowMedModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Produk</span>
              </button>
            </>
          )}

          {activeSubMenu === 'pelanggan' && (
            <button
              type="button"
              onClick={() => {
                setPatientForm(emptyPatientForm());
                setShowPatientModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Pasien / Member</span>
            </button>
          )}

          {activeSubMenu === 'supplier' && (
            <button
              type="button"
              onClick={() => {
                setSupplierForm(emptySupplierForm());
                setShowSupplierModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Supplier</span>
            </button>
          )}

          {activeSubMenu === 'karyawan' && (
            <button
              type="button"
              onClick={() => {
                setEmployeeForm(emptyEmployeeForm(employees));
                setShowEmployeeModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Karyawan</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs flex justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="cursor-pointer">
            Tutup
          </button>
        </div>
      )}

      {/* ==================== 1. DATA PRODUK ==================== */}
      {activeSubMenu === 'produk' && (
        <>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-6 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari SKU, nama dagang, zat aktif, atau indikasi klinis..."
                className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>
            <div className="md:col-span-3">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="Semua">Semua Kategori Obat</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="Semua">Semua Golongan</option>
                <option value="Bebas">Obat Bebas</option>
                <option value="Bebas Terbatas">Obat Bebas Terbatas</option>
                <option value="Keras">Obat Keras</option>
                <option value="Psikotropika">Psikotropika</option>
                <option value="Narkotika">Narkotika</option>
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500">
                    <th className="py-3 px-4 font-semibold">Obat &amp; Zat Aktif</th>
                    <th className="py-3 px-4 font-semibold">Kategori / Golongan</th>
                    <th className="py-3 px-4 font-semibold text-right">HNA &amp; HPP Besar</th>
                    <th className="py-3 px-4 font-semibold text-right">Reguler</th>
                    <th className="py-3 px-4 font-semibold text-right">Klinik/Dokter</th>
                    <th className="py-3 px-4 font-semibold text-right">Mitra/Grosir (Besar)</th>
                    <th className="py-3 px-4 font-semibold">Stok Multi-Satuan</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredMedicines.map((med) => {
                    const medBoxMult = Math.max(
                      1,
                      (med.pcsPerStrip || 1) * (med.stripsPerBox || 1)
                    );
                    const isLegacyBase = medBoxMult > 1 && med.hpp <= med.priceReguler * 2;
                    const medPpn = Number(med.ppnPercent) || 11;
                    const medHppBesar = isLegacyBase
                      ? Math.round(med.hpp * medBoxMult)
                      : med.hpp;
                    const medHnaBesar = isLegacyBase
                      ? Math.round(med.hna * medBoxMult)
                      : med.hna || Math.round(medHppBesar / (1 + medPpn / 100));
                    const medPriceMitraBesar = isLegacyBase
                      ? Math.round(medHppBesar * (1 + (Number(med.marginMitra) || 12) / 100))
                      : med.priceMitra;

                    return (
                    <tr key={med.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{med.name}</div>
                        <div className="text-slate-500">
                          {med.genericName} · <span className="font-mono">{med.sku}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-800 dark:text-slate-200">{med.categoryName}</div>
                        <div
                          className={
                            med.classification === 'Keras'
                              ? 'text-rose-600 dark:text-rose-400 font-medium'
                              : 'text-emerald-700 dark:text-emerald-400 font-medium'
                          }
                        >
                          Gol. {med.classification}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          HPP: {formatIDR(medHppBesar)} / {med.unitBox}
                        </div>
                        <div className="text-slate-500">
                          HNA Besar: {formatIDR(medHnaBesar)} (+{medPpn}% PPN)
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {formatIDR(med.priceReguler)} / {med.unitBase}
                        </div>
                        <div className="text-emerald-600">+{Number(med.marginReguler)}%</div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        <div className="font-medium">
                          {formatIDR(med.priceKlinik)} / {med.unitBase}
                        </div>
                        <div className="text-slate-400">+{Number(med.marginKlinik)}%</div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {formatIDR(medPriceMitraBesar)} / {med.unitBox}
                        </div>
                        <div className="text-slate-400">
                          +{Number(med.marginMitra)}% · Satuan Besar
                        </div>
                      </td>
                      <td className="py-3 px-4 tabular-nums">
                        <div
                          className={
                            med.stockBase <= med.minStockBase
                              ? 'font-semibold text-amber-600'
                              : 'text-slate-800 dark:text-slate-200'
                          }
                        >
                          {formatMultiUnitStock(med)}
                        </div>
                        <div className="text-slate-400">ED: {formatDateID(med.expiryDate)}</div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setClinicalDetailMed(med)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Info Klinis"
                          >
                            <Info className="w-3.5 h-3.5 text-red-600" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditMedicine(med)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Edit Produk"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMedicine(med.id)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            title="Hapus Produk"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {filteredMedicines.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        Tidak ada produk yang cocok dengan filter pencarian.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ==================== 2. DATA PELANGGAN / PASIEN ==================== */}
      {activeSubMenu === 'pelanggan' && (
        <>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-8 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                placeholder="Cari No. RM (MRN), nama pasien/pelanggan, telepon, alergi, atau diagnosa kronis..."
                className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>
            <div className="md:col-span-4">
              <select
                value={filterTier}
                onChange={(e) => setFilterTier(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="Semua">Semua Tier Member</option>
                <option value="Reguler">Reguler</option>
                <option value="Gold">Gold</option>
                <option value="Klinik/Dokter">Klinik/Dokter</option>
                <option value="Mitra/Instansi">Mitra/Instansi</option>
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500">
                    <th className="py-3 px-4 font-semibold">Pasien &amp; No. RM</th>
                    <th className="py-3 px-4 font-semibold">Kontak &amp; Alamat</th>
                    <th className="py-3 px-4 font-semibold">Tier Member</th>
                    <th className="py-3 px-4 font-semibold">Riwayat Alergi &amp; Kondisi</th>
                    <th className="py-3 px-4 font-semibold text-right">Poin</th>
                    <th className="py-3 px-4 font-semibold text-right">Piutang / Plafon</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredPatients.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{p.name}</div>
                        <div className="text-slate-500 font-mono tabular-nums">
                          {p.mrn} · {p.gender}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-800 dark:text-slate-200 tabular-nums">{p.phone || '-'}</div>
                        <div className="text-slate-400 truncate max-w-[220px]">{p.address || '-'}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-red-700 dark:text-red-400">
                        {p.memberTier}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-rose-700 dark:text-rose-400">
                          Alergi: {p.allergies || 'Tidak ada'}
                        </div>
                        <div className="text-slate-500">
                          Kondisi: {p.chronicConditions || 'Tidak ada'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold">
                        {p.points.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        <div
                          className={
                            p.receivableBalance > 0
                              ? 'font-semibold text-rose-600'
                              : 'text-slate-700 dark:text-slate-300'
                          }
                        >
                          {formatIDR(p.receivableBalance)}
                        </div>
                        <div className="text-slate-400">Plafon {formatIDR(p.receivableLimit)}</div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditPatient(p)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Edit Pasien / Member"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePatient(p.id)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            title="Hapus Pasien / Member"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredPatients.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Belum ada data pelanggan/pasien yang cocok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ==================== 3. DATA SUPPLIER ==================== */}
      {activeSubMenu === 'supplier' && (
        <>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-8 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                placeholder="Cari kode PBF, nama supplier, kategori pasokan, atau nama PIC..."
                className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>
            <div className="md:col-span-4">
              <select
                value={filterTerms}
                onChange={(e) => setFilterTerms(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="Semua">Semua Termin Pembayaran</option>
                <option value="COD">COD</option>
                <option value="Net 14">Net 14</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500">
                    <th className="py-3 px-4 font-semibold">Kode &amp; Nama Supplier (PBF)</th>
                    <th className="py-3 px-4 font-semibold">Kategori Supply</th>
                    <th className="py-3 px-4 font-semibold">PIC &amp; Kontak</th>
                    <th className="py-3 px-4 font-semibold">Termin &amp; NPWP</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSuppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{s.name}</div>
                        <div className="text-slate-500 font-mono">
                          {s.code} · {s.address || '-'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                        {s.category}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {s.contactPerson || '-'}
                        </div>
                        <div className="text-slate-400 tabular-nums">
                          {s.phone || '-'} {s.email ? `· ${s.email}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 tabular-nums">
                        <div className="font-medium text-red-700 dark:text-red-400">
                          {s.paymentTerms}
                        </div>
                        <div className="text-slate-400 font-mono">NPWP: {s.npwp || '-'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={
                            s.status === 'Aktif'
                              ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                              : 'text-slate-500 font-medium'
                          }
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditSupplier(s)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Edit Supplier"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSupplier(s.id)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            title="Hapus Supplier"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredSuppliers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Belum ada data supplier yang cocok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ==================== 4. DATA KARYAWAN ==================== */}
      {activeSubMenu === 'karyawan' && (
        <>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-8 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                placeholder="Cari ID Karyawan, nama karyawan, jabatan, atau nomor SIPA / STRTTK..."
                className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>
            <div className="md:col-span-4">
              <select
                value={filterShift}
                onChange={(e) => setFilterShift(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="Semua">Semua Shift Kerja</option>
                <option value="Shift Pagi">Shift Pagi</option>
                <option value="Shift Siang">Shift Siang</option>
                <option value="Shift Malam">Shift Malam</option>
                <option value="Full Time">Full Time</option>
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500">
                    <th className="py-3 px-4 font-semibold">ID &amp; Nama Karyawan</th>
                    <th className="py-3 px-4 font-semibold">Jabatan &amp; Legalitas (SIPA/STR)</th>
                    <th className="py-3 px-4 font-semibold">Kontak</th>
                    <th className="py-3 px-4 font-semibold">Shift &amp; Tgl Bergabung</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{emp.name}</div>
                        <div className="text-slate-500 font-mono">{emp.nip}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-red-700 dark:text-red-400">{emp.role}</div>
                        <div className="text-slate-400 font-mono">
                          {emp.sipaStrNumber || 'Non-Izin Praktek'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-800 dark:text-slate-200 tabular-nums">
                          {emp.phone || '-'}
                        </div>
                        <div className="text-slate-400">{emp.email || '-'}</div>
                      </td>
                      <td className="py-3 px-4 tabular-nums">
                        <div className="font-medium">{emp.shift}</div>
                        <div className="text-slate-400">Sejak {formatDateID(emp.joinDate)}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={
                            emp.status === 'Aktif'
                              ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                              : 'text-slate-500 font-medium'
                          }
                        >
                          {emp.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditEmployee(emp)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Edit Karyawan"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEmployee(emp.id)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            title="Hapus Karyawan"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Belum ada data karyawan yang cocok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ==================== MODALS ==================== */}

      {/* Clinical Info Modal */}
      {clinicalDetailMed && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  {clinicalDetailMed.name}
                </h4>
                <p className="text-slate-500">
                  Zat Aktif: {clinicalDetailMed.genericName} · Gol. {clinicalDetailMed.classification}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setClinicalDetailMed(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2.5 border-t border-slate-100 dark:border-slate-800 pt-3">
              <div>
                <strong className="block text-slate-700 dark:text-slate-200">Indikasi Utama:</strong>
                <p className="text-slate-600 dark:text-slate-300">{clinicalDetailMed.indication}</p>
              </div>
              <div>
                <strong className="block text-rose-700 dark:text-rose-400">Kontraindikasi:</strong>
                <p className="text-slate-600 dark:text-slate-300">
                  {clinicalDetailMed.contraindication}
                </p>
              </div>
              <div>
                <strong className="block text-slate-700 dark:text-slate-200">Efek Samping:</strong>
                <p className="text-slate-600 dark:text-slate-300">
                  {clinicalDetailMed.sideEffects}
                </p>
              </div>
              <div>
                <strong className="block text-emerald-700 dark:text-emerald-400">
                  Aturan Pakai &amp; Edukasi:
                </strong>
                <p className="text-slate-600 dark:text-slate-300">
                  {clinicalDetailMed.dosageInstructions}
                </p>
              </div>
              <div className="pt-1 text-slate-500">
                Tag ICD-10: {(clinicalDetailMed.icd10Tags || []).join(', ') || '-'} · Tag Musiman:{' '}
                {(clinicalDetailMed.seasonalTags || []).join(', ') || '-'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Medicine Modal */}
      {showMedModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveMedicine}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-5 text-xs my-8"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-display font-bold text-base">
                <Package className="w-4 h-4 text-red-600" />
                <span>{form.id ? 'Edit Data Produk' : 'Tambah Data Produk Baru'}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowMedModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium mb-1">Nama Obat (Dagang)</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Zat Aktif (Generik)</label>
                <input
                  required
                  type="text"
                  value={form.genericName}
                  onChange={(e) => setForm((f) => ({ ...f, genericName: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium mb-1">SKU</label>
                  <input
                    required
                    type="text"
                    value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Barcode</label>
                  <input
                    required
                    type="text"
                    value={form.barcode}
                    onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                    className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium mb-1">Kategori</label>
                <select
                  value={form.categoryName}
                  onChange={(e) => setForm((f) => ({ ...f, categoryName: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Golongan Obat</label>
                <select
                  value={form.classification}
                  onChange={(e) => setForm((f) => ({ ...f, classification: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="Bebas">Bebas</option>
                  <option value="Bebas Terbatas">Bebas Terbatas</option>
                  <option value="Keras">Keras</option>
                  <option value="Psikotropika">Psikotropika</option>
                  <option value="Narkotika">Narkotika</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Expired Date</label>
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
            </div>

            {/* Pricing Engine Box */}
            <div className="p-4 rounded-xl bg-red-50/60 dark:bg-red-950/30 border border-red-200 dark:border-red-900 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-red-900 dark:text-red-200 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4" />
                  <span>
                    Kalkulator HNA Besar, HPP Besar &amp; Harga Jual (Satuan Besar: 1{' '}
                    {form.unitBox || 'Box'} = {boxMultiplier} {form.unitBase || 'Pcs'})
                  </span>
                </div>
                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-red-200 dark:border-red-800">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => {
                        const ppn = Number(f.ppnPercent) > 0 ? Number(f.ppnPercent) : 11;
                        return {
                          ...f,
                          hppMode: 'hna_ppn',
                          ppnPercent: ppn,
                          hpp: Math.round(f.hna * (1 + ppn / 100)),
                        };
                      })
                    }
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      form.hppMode === 'hna_ppn'
                        ? 'bg-red-700 text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Otomatis (HNA Besar + PPN 11%)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => {
                        const ppn = Number(f.ppnPercent) > 0 ? Number(f.ppnPercent) : 11;
                        const currentHpp =
                          f.hppMode === 'hna_ppn'
                            ? Math.round(f.hna * (1 + ppn / 100))
                            : Math.round(f.hpp);
                        return {
                          ...f,
                          hppMode: 'manual',
                          ppnPercent: ppn,
                          hpp: currentHpp,
                          hna: Math.round(currentHpp / (1 + ppn / 100)),
                        };
                      })
                    }
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      form.hppMode === 'manual'
                        ? 'bg-red-700 text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Input HPP Besar Manual
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium mb-1">
                    HNA Besar (Rp / {form.unitBox || 'Box'})
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.hppMode === 'manual' ? computedHna : form.hna}
                    onChange={(e) => {
                      const nextHna = Math.max(0, Number(e.target.value) || 0);
                      setForm((f) => {
                        const ppn = Number(f.ppnPercent) >= 0 ? Number(f.ppnPercent) : 11;
                        return {
                          ...f,
                          hppMode: 'hna_ppn',
                          hna: nextHna,
                          hpp: Math.round(nextHna * (1 + ppn / 100)),
                        };
                      });
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                  />
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    Otomatis sesuai PPN {form.ppnPercent || 11}% · Setara{' '}
                    {formatIDR(Math.round(computedHna / boxMultiplier))}/{form.unitBase || 'Pcs'}
                  </p>
                </div>
                <div>
                  <label className="block font-medium mb-1">PPN (%)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.ppnPercent}
                    onChange={(e) => {
                      const nextPpn = Math.max(0, Number(e.target.value) || 0);
                      setForm((f) => {
                        if (f.hppMode === 'manual') {
                          return {
                            ...f,
                            ppnPercent: nextPpn,
                            hna: Math.round(f.hpp / (1 + nextPpn / 100)),
                          };
                        }
                        return {
                          ...f,
                          ppnPercent: nextPpn,
                          hpp: Math.round(f.hna * (1 + nextPpn / 100)),
                        };
                      });
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                  />
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Standar PPN PBF 11%
                  </p>
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    HPP Besar (Rp / {form.unitBox || 'Box'})
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.hppMode === 'hna_ppn' ? computedHpp : form.hpp}
                    onChange={(e) => {
                      const nextHpp = Math.max(0, Number(e.target.value) || 0);
                      setForm((f) => {
                        const ppn = Number(f.ppnPercent) > 0 ? Number(f.ppnPercent) : 11;
                        return {
                          ...f,
                          hppMode: 'manual',
                          ppnPercent: ppn,
                          hpp: nextHpp,
                          hna: Math.round(nextHpp / (1 + ppn / 100)),
                        };
                      });
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-red-300 dark:border-red-700 rounded-lg font-bold tabular-nums"
                  />
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    Satuan Besar ({form.unitBox || 'Box'}) · Setara{' '}
                    {formatIDR(Math.round(computedHpp / boxMultiplier))}/{form.unitBase || 'Pcs'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block mb-1">Margin Reguler (%)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.marginReguler}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, marginReguler: Number(e.target.value) || 0 }))
                    }
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                  />
                  <div className="mt-1 font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    Jual: {formatIDR(computedPrices.reguler)} / {form.unitBase || 'Pcs'}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    ({formatIDR(computedPrices.regulerBesar)} / {form.unitBox || 'Box'})
                  </div>
                </div>
                <div>
                  <label className="block mb-1">Margin Klinik/Dokter (%)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.marginKlinik}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, marginKlinik: Number(e.target.value) || 0 }))
                    }
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                  />
                  <div className="mt-1 font-semibold text-red-700 dark:text-red-400 tabular-nums">
                    Jual: {formatIDR(computedPrices.klinik)} / {form.unitBase || 'Pcs'}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    ({formatIDR(computedPrices.klinikBesar)} / {form.unitBox || 'Box'})
                  </div>
                </div>
                <div>
                  <label className="block mb-1">
                    Margin Mitra/Grosir (%) · Satuan Besar
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.marginMitra}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, marginMitra: Number(e.target.value) || 0 }))
                    }
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                  />
                  <div className="mt-1 font-semibold text-slate-900 dark:text-white tabular-nums">
                    Jual Besar: {formatIDR(computedPrices.mitra)} / {form.unitBox || 'Box'}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    (Setara {formatIDR(computedPrices.mitraBase)} / {form.unitBase || 'Pcs'})
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              <div>
                <label className="block font-medium mb-1">Satuan Besar</label>
                <input
                  type="text"
                  value={form.unitBox}
                  onChange={(e) => setForm((f) => ({ ...f, unitBox: e.target.value }))}
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Satuan Dasar</label>
                <input
                  type="text"
                  value={form.unitBase}
                  onChange={(e) => setForm((f) => ({ ...f, unitBase: e.target.value }))}
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Pcs / Strip</label>
                <input
                  type="number"
                  min={1}
                  value={form.pcsPerStrip}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pcsPerStrip: Number(e.target.value) || 1 }))
                  }
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Strip / {form.unitBox || 'Box'}</label>
                <input
                  type="number"
                  min={1}
                  value={form.stripsPerBox}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, stripsPerBox: Number(e.target.value) || 1 }))
                  }
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Stok Dasar Total</label>
                <input
                  type="number"
                  min={0}
                  value={form.stockBase}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, stockBase: Number(e.target.value) || 0 }))
                  }
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Stok Minimum</label>
                <input
                  type="number"
                  min={0}
                  value={form.minStockBase}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, minStockBase: Number(e.target.value) || 0 }))
                  }
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Indikasi Utama</label>
                <input
                  type="text"
                  value={form.indication}
                  onChange={(e) => setForm((f) => ({ ...f, indication: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Kontraindikasi</label>
                <input
                  type="text"
                  value={form.contraindication}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contraindication: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Efek Samping</label>
                <input
                  type="text"
                  value={form.sideEffects}
                  onChange={(e) => setForm((f) => ({ ...f, sideEffects: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Aturan Pakai</label>
                <input
                  type="text"
                  value={form.dosageInstructions}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dosageInstructions: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowMedModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan Produk'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Dynamic Category Modal */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="font-display font-bold text-base">Kategori &amp; Golongan Dinamis</h4>
              <button
                type="button"
                onClick={() => setShowCatModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCategory} className="space-y-2">
              <input
                required
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Nama kategori baru (mis. Oftalmologi / Tetes Mata)..."
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="Deskripsi singkat..."
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white font-medium cursor-pointer"
                >
                  Tambah
                </button>
              </div>
            </form>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              {categories.map((cat) => (
                <div key={cat.id} className="p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{cat.name}</div>
                    <div className="text-slate-500">{cat.description || '-'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Patient Modal */}
      {showPatientModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSavePatient}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 text-xs my-8"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-display font-bold text-base">
                <Users className="w-4 h-4 text-red-600" />
                <span>
                  {patientForm.id ? 'Edit Data Pasien / Member' : 'Tambah Pasien / Member Baru'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPatientModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium mb-1">No. Rekam Medis (MRN)</label>
                <input
                  required
                  type="text"
                  value={patientForm.mrn}
                  onChange={(e) => setPatientForm((f) => ({ ...f, mrn: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium mb-1">Nama Lengkap</label>
                <input
                  required
                  type="text"
                  value={patientForm.name}
                  onChange={(e) => setPatientForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block font-medium mb-1">No. Telepon / WA</label>
                <input
                  type="text"
                  value={patientForm.phone}
                  onChange={(e) => setPatientForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Jenis Kelamin</label>
                <select
                  value={patientForm.gender}
                  onChange={(e) => setPatientForm((f) => ({ ...f, gender: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="Perempuan">Perempuan</option>
                  <option value="Laki-laki">Laki-laki</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Tanggal Lahir</label>
                <input
                  type="date"
                  value={patientForm.birthDate}
                  onChange={(e) => setPatientForm((f) => ({ ...f, birthDate: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Tier Member</label>
                <select
                  value={patientForm.memberTier}
                  onChange={(e) => setPatientForm((f) => ({ ...f, memberTier: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="Reguler">Reguler</option>
                  <option value="Gold">Gold</option>
                  <option value="Klinik/Dokter">Klinik/Dokter</option>
                  <option value="Mitra/Instansi">Mitra/Instansi</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-medium mb-1">Alamat Domisili</label>
              <input
                type="text"
                value={patientForm.address}
                onChange={(e) => setPatientForm((f) => ({ ...f, address: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium mb-1">Riwayat Alergi Obat</label>
                <input
                  type="text"
                  value={patientForm.allergies}
                  onChange={(e) => setPatientForm((f) => ({ ...f, allergies: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Penyakit Kronis</label>
                <input
                  type="text"
                  value={patientForm.chronicConditions}
                  onChange={(e) =>
                    setPatientForm((f) => ({ ...f, chronicConditions: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Plafon Piutang (Rp)</label>
                <input
                  type="number"
                  min={0}
                  value={patientForm.receivableLimit}
                  onChange={(e) =>
                    setPatientForm((f) => ({ ...f, receivableLimit: Number(e.target.value) || 0 }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPatientModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan Pasien / Member'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add/Edit Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveSupplier}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 text-xs my-8"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-display font-bold text-base">
                <Building2 className="w-4 h-4 text-red-600" />
                <span>{supplierForm.id ? 'Edit Data Supplier' : 'Tambah Data Supplier Baru'}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium mb-1">Kode Supplier / PBF</label>
                <input
                  required
                  type="text"
                  value={supplierForm.code}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, code: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium mb-1">Nama Perusahaan / PBF</label>
                <input
                  required
                  type="text"
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium mb-1">Kategori Supply</label>
                <input
                  type="text"
                  value={supplierForm.category}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Nama PIC / Sales</label>
                <input
                  type="text"
                  value={supplierForm.contactPerson}
                  onChange={(e) =>
                    setSupplierForm((f) => ({ ...f, contactPerson: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Telepon</label>
                <input
                  type="text"
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Termin Pembayaran</label>
                <select
                  value={supplierForm.paymentTerms}
                  onChange={(e) =>
                    setSupplierForm((f) => ({ ...f, paymentTerms: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="COD">COD</option>
                  <option value="Net 14">Net 14</option>
                  <option value="Net 30">Net 30</option>
                  <option value="Net 45">Net 45</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Status</label>
                <select
                  value={supplierForm.status}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="Aktif">Aktif</option>
                  <option value="Non-Aktif">Non-Aktif</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">NPWP</label>
                <input
                  type="text"
                  value={supplierForm.npwp}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, npwp: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Alamat Kantor / Gudang</label>
                <input
                  type="text"
                  value={supplierForm.address}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan Supplier'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add/Edit Employee Modal */}
      {showEmployeeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEmployee}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 text-xs my-8"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-display font-bold text-base">
                <UserCheck className="w-4 h-4 text-red-600" />
                <span>{employeeForm.id ? 'Edit Data Karyawan' : 'Tambah Data Karyawan Baru'}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowEmployeeModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium mb-1">ID Karyawan</label>
                <input
                  required
                  type="text"
                  value={employeeForm.nip}
                  onChange={(e) => setEmployeeForm((f) => ({ ...f, nip: e.target.value }))}
                  placeholder="ID-001"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium mb-1">Nama Lengkap &amp; Gelar</label>
                <input
                  required
                  type="text"
                  value={employeeForm.name}
                  onChange={(e) => setEmployeeForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Jabatan / Peran</label>
                <select
                  value={employeeForm.role}
                  onChange={(e) => setEmployeeForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="Apoteker Penanggung Jawab (APA)">
                    Apoteker Penanggung Jawab (APA)
                  </option>
                  <option value="Apoteker Pendamping">Apoteker Pendamping</option>
                  <option value="Tenaga Teknis Kefarmasian (TTK)">
                    Tenaga Teknis Kefarmasian (TTK)
                  </option>
                  <option value="Kasir & Administrasi">Kasir &amp; Administrasi</option>
                  <option value="Kurir & Gudang">Kurir &amp; Gudang</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">No. SIPA / STRTTK</label>
                <input
                  type="text"
                  value={employeeForm.sipaStrNumber}
                  onChange={(e) =>
                    setEmployeeForm((f) => ({ ...f, sipaStrNumber: e.target.value }))
                  }
                  placeholder="Kosongkan jika non-tenaga teknis"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium mb-1">No. Telepon</label>
                <input
                  type="text"
                  value={employeeForm.phone}
                  onChange={(e) => setEmployeeForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={employeeForm.email}
                  onChange={(e) => setEmployeeForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Tanggal Bergabung</label>
                <input
                  type="date"
                  value={employeeForm.joinDate}
                  onChange={(e) => setEmployeeForm((f) => ({ ...f, joinDate: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Shift Kerja</label>
                <select
                  value={employeeForm.shift}
                  onChange={(e) => setEmployeeForm((f) => ({ ...f, shift: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="Shift Pagi">Shift Pagi</option>
                  <option value="Shift Siang">Shift Siang</option>
                  <option value="Shift Malam">Shift Malam</option>
                  <option value="Full Time">Full Time</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Status Kepegawaian</label>
                <select
                  value={employeeForm.status}
                  onChange={(e) => setEmployeeForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="Aktif">Aktif</option>
                  <option value="Cuti">Cuti</option>
                  <option value="Non-Aktif">Non-Aktif</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowEmployeeModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan Karyawan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
