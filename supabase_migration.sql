-- ═══════════════════════════════════════════════════════════════
-- SiPay v2 · Supabase Full Reset Migration
-- Jalankan di: Supabase Dashboard → SQL Editor → Run
-- PERINGATAN: Ini akan menghapus SEMUA data yang ada!
--
-- KEAMANAN: file ini memasang kebijakan ADMIN-ONLY sejak awal — sama dengan
-- hasil `supabase_migration_auth.sql`, jadi reset penuh TIDAK lagi membuka
-- data ke publik walau file auth belum sempat dijalankan.
--   • authenticated (admin) : akses penuh
--   • anon (publik)         : hanya membaca branding layar login
--                             (nama madrasah, logo, daftar item bayar)
--
-- Sebelumnya file ini memasang `anon_all … USING (true)` untuk setiap tabel —
-- siapa pun yang tahu URL & anon key (keduanya terbaca di js/config.js dan
-- memang publik) bisa membaca, mengubah, dan menghapus seluruh data santri.
-- Jangan pernah kembalikan pola itu.
--
-- ⚠️ Setelah menjalankan file ini, WAJIB lakukan LANGKAH MANUAL di bagian
--    bawah — tanpa itu belum ada satu pun akun yang bisa masuk, dan
--    pendaftaran publik yang masih terbuka membuat orang asing otomatis
--    mendapat hak admin penuh.
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
  -- Riwayat SPP tahun ajaran sebelumnya: { "2024/2025": { spp, spp_paid_months }, ... }
  -- Diisi otomatis saat promosi kelas agar tunggakan SPP tahun lalu tetap tercatat.
  spp_history      jsonb       NOT NULL DEFAULT '{}',
  -- Bulan mulai tagih SPP bagi santri yang masuk di tengah tahun ajaran:
  -- "<TA>|<kode bulan>" mis. "2025/2026|Nov"; kosong = ditagih penuh dari Juli.
  spp_mulai        text        NOT NULL DEFAULT '',
  status_kelulusan text        NOT NULL DEFAULT '',
  created_at       timestamptz DEFAULT now(),
  CONSTRAINT students_nama_unique UNIQUE (nama)
);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON students FOR ALL TO authenticated USING (true) WITH CHECK (true);

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
CREATE POLICY "admin_all" ON tagihan FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════
-- 4. TABEL TRANSACTIONS (log ringkas)
-- ══════════════════════════════════════════
CREATE TABLE transactions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nama         text        NOT NULL,
  kelas        text        NOT NULL DEFAULT '',
  jenis        text        NOT NULL DEFAULT '',
  nominal      numeric     NOT NULL DEFAULT 0,
  time         text        NOT NULL DEFAULT '',
  catatan      text        NOT NULL DEFAULT '',
  metode       text        NOT NULL DEFAULT '',
  dibayar_oleh text        NOT NULL DEFAULT '',
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

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
  metode           text        NOT NULL DEFAULT '',
  dibayar_oleh     text        NOT NULL DEFAULT '',
  tgl_bayar        text        NOT NULL DEFAULT '',
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE kuitansi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON kuitansi FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════
-- 6. TABEL SETTINGS
-- ══════════════════════════════════════════
CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all"    ON settings FOR ALL    TO authenticated USING (true) WITH CHECK (true);
-- anon hanya boleh membaca branding layar login. Baris 'akun' (email & HP
-- admin) sengaja TIDAK ikut, supaya tidak terbaca publik.
CREATE POLICY "public_brand" ON settings FOR SELECT TO anon
  USING (key IN ('profil', 'logo', 'payItems'));

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
CREATE POLICY "admin_all" ON payment_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════
-- 8. TABEL KUITANSI TEMPLATE
-- ══════════════════════════════════════════
CREATE TABLE kuitansi_template (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  data       jsonb       NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE kuitansi_template ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON kuitansi_template FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════
-- 9. REALTIME — daftarkan tabel ke publication `supabase_realtime`
--    Supaya perubahan dari satu device langsung tampil di device lain.
--    (Sama isinya dengan supabase_migration_realtime.sql — disertakan di sini
--     agar reset penuh langsung ikut mengaktifkan realtime.)
-- ══════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH t IN ARRAY ARRAY['students','tagihan','transactions','kuitansi','settings'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- LANGKAH MANUAL WAJIB SETELAH MENJALANKAN SQL DI ATAS
-- ═══════════════════════════════════════════════════════════════
-- 1) BUAT AKUN ADMIN
--    Authentication → Users → "Add user" → isi Email & Password →
--    centang "Auto Confirm User" → Create.
--    Tanpa langkah ini tidak ada satu pun akun yang bisa masuk.
--
-- 2) MATIKAN PENDAFTARAN PUBLIK  ⚠️ PALING PENTING
--    Authentication → Providers/Sign In → Email → NONAKTIFKAN
--    "Allow new users to sign up".
--    Tanpa ini, orang asing bisa mendaftar sendiri dan otomatis mendapat
--    peran 'authenticated' = akses admin penuh ke seluruh data santri.
--
-- 3) VERIFIKASI — buka di jendela penyamaran (ganti <ANON_KEY> dengan nilai
--    SB_KEY di js/config.js). Keduanya harus GAGAL/tertutup:
--      <SB_URL>/rest/v1/students?select=nama&limit=1&apikey=<ANON_KEY>
--        → harus membalas "permission denied", BUKAN daftar nama santri.
--      <SB_URL>/auth/v1/settings?apikey=<ANON_KEY>
--        → harus memuat "disable_signup": true
--
-- ══════════════════════════════════════════
-- SELESAI — lanjutkan di aplikasi:
-- 1. Refresh aplikasi lalu login dengan akun dari langkah (1)
-- 2. Masuk ke "Kelola Item Bayar" — aktifkan item yang diinginkan
-- 3. Sistem akan otomatis membuat tagihan untuk semua santri
-- ══════════════════════════════════════════
