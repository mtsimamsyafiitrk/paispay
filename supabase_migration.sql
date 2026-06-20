-- ═══════════════════════════════════════════════════════════════
-- SiPay v2 · Supabase Full Reset Migration
-- Jalankan di: Supabase Dashboard → SQL Editor → Run
-- PERINGATAN: Ini akan menghapus SEMUA data yang ada!
-- ═══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════
-- 1. HAPUS TABEL LAMA
-- ══════════════════════════════════════════
DROP TABLE IF EXISTS tagihan          CASCADE;
DROP TABLE IF EXISTS students         CASCADE;
DROP TABLE IF EXISTS transactions     CASCADE;
DROP TABLE IF EXISTS kuitansi         CASCADE;
DROP TABLE IF EXISTS settings         CASCADE;
DROP TABLE IF EXISTS payment_reports  CASCADE;
DROP TABLE IF EXISTS kuitansi_template CASCADE;
DROP TABLE IF EXISTS tahun_ajaran     CASCADE;

-- ══════════════════════════════════════════
-- 2. TABEL STUDENTS
--    Hanya menyimpan identitas & SPP.
--    Tagihan item lain ada di tabel tagihan.
-- ══════════════════════════════════════════
CREATE TABLE students (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nama             text        NOT NULL,
  kelas            text        NOT NULL,
  nisn             text        NOT NULL DEFAULT '',
  spp              numeric     NOT NULL DEFAULT 0,
  spp_paid_months  jsonb       NOT NULL DEFAULT '[]',
  status_kelulusan text        NOT NULL DEFAULT '',
  created_at       timestamptz DEFAULT now(),
  CONSTRAINT students_nama_unique UNIQUE (nama)
);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON students FOR ALL TO anon USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════
-- 3. TABEL TAGIHAN
--    Satu record per siswa per item tetap.
--    paid_amount selalu sinkron dengan kuitansi.
-- ══════════════════════════════════════════
CREATE TABLE tagihan (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nama        text        NOT NULL,
  kelas       text        NOT NULL,
  item_id     text        NOT NULL,
  item_name   text        NOT NULL,
  nominal     numeric     NOT NULL DEFAULT 0,
  paid_amount numeric     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_tagihan_nama    ON tagihan(nama);
CREATE INDEX idx_tagihan_item_id ON tagihan(item_id);

ALTER TABLE tagihan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON tagihan FOR ALL TO anon USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════
-- 4. TABEL TRANSACTIONS (log ringkas)
-- ══════════════════════════════════════════
CREATE TABLE transactions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nama       text        NOT NULL,
  kelas      text        NOT NULL DEFAULT '',
  jenis      text        NOT NULL DEFAULT '',
  nominal    numeric     NOT NULL DEFAULT 0,
  time       text        NOT NULL DEFAULT '',
  catatan    text        NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON transactions FOR ALL TO anon USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════
-- 5. TABEL KUITANSI
--    items: jsonb array of {item_id, name, amount, bulan}
-- ══════════════════════════════════════════
CREATE TABLE kuitansi (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  no_kuitansi      text        NOT NULL DEFAULT '',
  nama             text        NOT NULL,
  kelas            text        NOT NULL DEFAULT '',
  nisn             text        NOT NULL DEFAULT '',
  items            jsonb       NOT NULL DEFAULT '[]',
  total            numeric     NOT NULL DEFAULT 0,
  catatan          text        NOT NULL DEFAULT '',
  dicetak          boolean     NOT NULL DEFAULT false,
  dicetak_at       timestamptz,
  is_koreksi       boolean     NOT NULL DEFAULT false,
  ref_no_kuitansi  text,
  dikoreksi_oleh   text,
  ta_label         text        NOT NULL DEFAULT '',
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE kuitansi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON kuitansi FOR ALL TO anon USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════
-- 6. TABEL SETTINGS
-- ══════════════════════════════════════════
CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON settings FOR ALL TO anon USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════
-- 7. TABEL PAYMENT REPORTS (laporan wali)
-- ══════════════════════════════════════════
CREATE TABLE payment_reports (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nama       text        NOT NULL,
  kelas      text        NOT NULL DEFAULT '',
  item_id    text        NOT NULL DEFAULT '',
  item_name  text        NOT NULL DEFAULT '',
  nominal    numeric     NOT NULL DEFAULT 0,
  catatan    text        NOT NULL DEFAULT '',
  status     text        NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payment_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON payment_reports FOR ALL TO anon USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════
-- 8. TABEL KUITANSI TEMPLATE
-- ══════════════════════════════════════════
CREATE TABLE kuitansi_template (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  data       jsonb       NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE kuitansi_template ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON kuitansi_template FOR ALL TO anon USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════
-- SELESAI
-- Setelah menjalankan SQL ini:
-- 1. Refresh aplikasi
-- 2. Masuk ke "Kelola Item Bayar" — aktifkan item yang diinginkan
-- 3. Sistem akan otomatis membuat tagihan untuk semua santri
-- ══════════════════════════════════════════
