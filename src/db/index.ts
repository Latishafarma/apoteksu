import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
  var _pgliteClient: PGlite | undefined;
  var _pgliteSchemaReady: Promise<void> | undefined;
}

const hasExternalSql = Boolean(process.env.SQL_HOST);

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const createPgliteClient = () => {
  if (!global._pgliteClient) {
    const dataDir = path.resolve(process.cwd(), '.pgdata');
    const pidFile = path.join(dataDir, 'postmaster.pid');
    if (fs.existsSync(pidFile)) {
      try {
        fs.rmSync(pidFile, { force: true });
      } catch {
        // ignore
      }
    }
    let client: PGlite;
    try {
      client = new PGlite(dataDir);
    } catch (err) {
      console.warn('PGlite init failed on existing .pgdata, recreating clean directory:', err);
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
      client = new PGlite(dataDir);
    }
    global._pgliteClient = client;

    let closing = false;
    const shutdown = async () => {
      if (closing) return;
      closing = true;
      try {
        await client.close();
      } catch {
        // ignore close errors on shutdown
      }
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
  return global._pgliteClient;
};

const EMBEDDED_SCHEMA_DDL = `
DROP TABLE IF EXISTS license_check_logs CASCADE;
DROP TABLE IF EXISTS tenant_subscription_history CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TABLE IF EXISTS managed_applications CASCADE;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Apoteker Latisha',
  role TEXT NOT NULL DEFAULT 'apoteker',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drug_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medicines (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  generic_name TEXT NOT NULL DEFAULT '',
  category_id INTEGER REFERENCES drug_categories(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL DEFAULT 'Umum',
  classification TEXT NOT NULL DEFAULT 'Bebas',
  indication TEXT NOT NULL DEFAULT '',
  contraindication TEXT NOT NULL DEFAULT '',
  side_effects TEXT NOT NULL DEFAULT '',
  dosage_instructions TEXT NOT NULL DEFAULT '',
  icd10_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  seasonal_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  hpp_mode TEXT NOT NULL DEFAULT 'hna_ppn',
  hna INTEGER NOT NULL DEFAULT 0,
  ppn_percent NUMERIC(5,2) NOT NULL DEFAULT '11.00',
  hpp INTEGER NOT NULL DEFAULT 0,
  margin_reguler NUMERIC(6,2) NOT NULL DEFAULT '25.00',
  price_reguler INTEGER NOT NULL DEFAULT 0,
  margin_klinik NUMERIC(6,2) NOT NULL DEFAULT '15.00',
  price_klinik INTEGER NOT NULL DEFAULT 0,
  margin_mitra NUMERIC(6,2) NOT NULL DEFAULT '10.00',
  price_mitra INTEGER NOT NULL DEFAULT 0,
  unit_base TEXT NOT NULL DEFAULT 'Tablet',
  unit_strip TEXT NOT NULL DEFAULT 'Strip',
  pcs_per_strip INTEGER NOT NULL DEFAULT 10,
  unit_box TEXT NOT NULL DEFAULT 'Box',
  strips_per_box INTEGER NOT NULL DEFAULT 10,
  stock_base INTEGER NOT NULL DEFAULT 0,
  min_stock_base INTEGER NOT NULL DEFAULT 30,
  expiry_date TEXT NOT NULL DEFAULT '2027-12-31',
  is_slow_moving BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  mrn TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '1990-01-01',
  gender TEXT NOT NULL DEFAULT 'Laki-laki',
  address TEXT NOT NULL DEFAULT '',
  member_tier TEXT NOT NULL DEFAULT 'Reguler',
  allergies TEXT NOT NULL DEFAULT 'Tidak ada riwayat alergi',
  chronic_conditions TEXT NOT NULL DEFAULT '-',
  points INTEGER NOT NULL DEFAULT 0,
  receivable_limit INTEGER NOT NULL DEFAULT 0,
  receivable_balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rx_bundles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  diagnosis_icd10 TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  bundle_discount_percent NUMERIC(5,2) NOT NULL DEFAULT '5.00',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  invoice_no TEXT NOT NULL UNIQUE,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL DEFAULT 'Pasien Umum',
  price_tier TEXT NOT NULL DEFAULT 'reguler',
  payment_method TEXT NOT NULL DEFAULT 'Tunai',
  payment_status TEXT NOT NULL DEFAULT 'Lunas',
  due_date TEXT,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  remaining_balance INTEGER NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL DEFAULT 0,
  total_hpp INTEGER NOT NULL DEFAULT 0,
  gross_profit INTEGER NOT NULL DEFAULT 0,
  diagnosis_icd10 TEXT NOT NULL DEFAULT 'Z00.0 - Umum',
  prescription_type TEXT NOT NULL DEFAULT 'Non-Resep',
  doctor_name TEXT NOT NULL DEFAULT '-',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  cashier_name TEXT NOT NULL DEFAULT 'Apt. Latisha',
  notes TEXT NOT NULL DEFAULT '',
  transaction_date TEXT NOT NULL DEFAULT '2026-11-18',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinical_care_records (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  pharmacist_name TEXT NOT NULL DEFAULT 'Apt. Latisha, S.Farm',
  visit_date TEXT NOT NULL,
  subjective TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT '',
  assessment TEXT NOT NULL,
  drp_details TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL,
  intervention_target TEXT NOT NULL DEFAULT 'Pasien',
  e_prescription_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  adherence_score INTEGER NOT NULL DEFAULT 100,
  follow_up_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Selesai',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS swamedikasi_logs (
  id SERIAL PRIMARY KEY,
  patient_name TEXT NOT NULL DEFAULT 'Pasien Walk-in',
  symptom_category TEXT NOT NULL,
  triage_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  red_flags_detected BOOLEAN NOT NULL DEFAULT FALSE,
  recommendation_summary TEXT NOT NULL,
  recommended_medicines JSONB NOT NULL DEFAULT '[]'::jsonb,
  converted_to_pos BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drug_interactions (
  id SERIAL PRIMARY KEY,
  drug_a_keyword TEXT NOT NULL,
  drug_b_keyword TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'Moderate',
  mechanism TEXT NOT NULL,
  clinical_effect TEXT NOT NULL,
  management_advice TEXT NOT NULL,
  evidence_level TEXT NOT NULL DEFAULT 'Established',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'PBF Resmi',
  contact_person TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  payment_terms TEXT NOT NULL DEFAULT 'Net 30',
  npwp TEXT NOT NULL DEFAULT '-',
  status TEXT NOT NULL DEFAULT 'Aktif',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  nip TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Tenaga Teknis Kefarmasian (TTK)',
  sipa_str_number TEXT NOT NULL DEFAULT '-',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  shift TEXT NOT NULL DEFAULT 'Pagi (07:00-14:00)',
  status TEXT NOT NULL DEFAULT 'Aktif',
  join_date TEXT NOT NULL DEFAULT '2025-01-10',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS obat_batches (
  id SERIAL PRIMARY KEY,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  medicine_sku TEXT NOT NULL,
  medicine_name TEXT NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL DEFAULT 'PBF Resmi',
  batch_number TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  qty_received INTEGER NOT NULL DEFAULT 0,
  qty_remaining INTEGER NOT NULL DEFAULT 0,
  rack_location TEXT NOT NULL DEFAULT 'Rak A-1',
  hpp_unit INTEGER NOT NULL DEFAULT 0,
  received_date TEXT NOT NULL DEFAULT '2026-11-18',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_audit_logs (
  id SERIAL PRIMARY KEY,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  batch_id INTEGER REFERENCES obat_batches(id) ON DELETE SET NULL,
  medicine_name TEXT NOT NULL,
  batch_number TEXT NOT NULL DEFAULT '-',
  system_qty INTEGER NOT NULL DEFAULT 0,
  physical_qty INTEGER NOT NULL DEFAULT 0,
  variance INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'Koreksi Opname',
  auditor_name TEXT NOT NULL DEFAULT 'Apt. Latisha',
  notes TEXT NOT NULL DEFAULT '',
  audit_date TEXT NOT NULL DEFAULT '2026-11-18',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_total INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT 'Apt. Latisha',
  order_date TEXT NOT NULL DEFAULT '2026-11-18',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id SERIAL PRIMARY KEY,
  rx_number TEXT NOT NULL UNIQUE,
  rx_date TEXT NOT NULL,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  weight_kg TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '',
  age_years INTEGER NOT NULL DEFAULT 0,
  age_label TEXT NOT NULL DEFAULT '',
  patient_phone TEXT NOT NULL DEFAULT '',
  patient_address TEXT NOT NULL DEFAULT '',
  allergies TEXT NOT NULL DEFAULT 'Tidak ada riwayat alergi',
  doctor_name TEXT NOT NULL DEFAULT '',
  doctor_sip TEXT NOT NULL DEFAULT '',
  clinic_name TEXT NOT NULL DEFAULT '',
  iter_flag TEXT NOT NULL DEFAULT 'Non-Iter',
  pharmacy_header JSONB NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  pharmacist_name TEXT NOT NULL DEFAULT 'Apt. Latisha Rahma, S.Farm',
  status TEXT NOT NULL DEFAULT 'Diserahkan',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

export async function checkpointEmbeddedDb(): Promise<void> {
  if (hasExternalSql || !global._pgliteClient) return;
  try {
    await global._pgliteClient.exec('CHECKPOINT;');
  } catch {
    // non-fatal checkpoint failure
  }
}

export let db: NodePgDatabase<typeof schema> = hasExternalSql
  ? drizzle(createPool(), { schema })
  : (drizzlePglite(createPgliteClient(), { schema }) as unknown as NodePgDatabase<typeof schema>);

export async function ensureDatabaseReady(): Promise<void> {
  if (hasExternalSql) {
    return;
  }
  if (!global._pgliteSchemaReady) {
    global._pgliteSchemaReady = (async () => {
      const client = createPgliteClient();
      try {
        await client.exec(EMBEDDED_SCHEMA_DDL);
        await client.exec('CHECKPOINT;');
      } catch (err) {
        console.warn('Embedded PGlite schema init failed, rebuilding clean local .pgdata:', err);
        try {
          await client.close();
        } catch {
          // ignore close error
        }
        const dataDir = path.resolve(process.cwd(), '.pgdata');
        fs.rmSync(dataDir, { recursive: true, force: true });
        global._pgliteClient = undefined;
        const freshClient = createPgliteClient();
        db = drizzlePglite(freshClient, { schema }) as unknown as NodePgDatabase<typeof schema>;
        await freshClient.exec(EMBEDDED_SCHEMA_DDL);
        await freshClient.exec('CHECKPOINT;');
      }
    })();
  }
  await global._pgliteSchemaReady;
}
