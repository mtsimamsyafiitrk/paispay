-- ═══════════════════════════════════════════════════════════════
-- SiPay · Migrasi Keamanan: RLS Admin-Only + Supabase Auth
-- Jalankan di: Supabase Dashboard → SQL Editor → Run
--
-- APA YANG DILAKUKAN:
--   Mengganti kebijakan lama "anon_all" (siapa pun bisa baca+tulis+hapus)
--   dengan model ADMIN-ONLY:
--     • authenticated (admin) : akses penuh (baca/tulis/hapus)
--     • anon (publik)         : TIDAK punya akses — kecuali membaca
--                               branding non-sensitif untuk layar login
--                               (nama madrasah, logo, item bayar).
--
--   Setelah migrasi ini, seluruh data santri hanya bisa diakses admin yang
--   login lewat Supabase Auth. Mode wali/pengunjung sudah dihapus dari app.
--
-- CATATAN: migrasi ini AMAN untuk data — tidak menghapus tabel/baris,
--          hanya mengganti kebijakan akses.
-- ═══════════════════════════════════════════════════════════════

-- ── Buang SEMUA policy lama di tiap tabel & pastikan RLS aktif ──
DO $$
DECLARE t text; p text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'students','tagihan','transactions','kuitansi',
    'settings','payment_reports','kuitansi_template'
  ] LOOP
    FOR p IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', p, t);
    END LOOP;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- ══════════════════════════════════════════
-- TABEL DATA — admin only
--   authenticated : ALL   |   anon : (tidak ada policy = ditolak)
-- ══════════════════════════════════════════
CREATE POLICY "admin_all" ON students          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON tagihan           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON transactions      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON kuitansi          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON payment_reports   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON kuitansi_template FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════
-- SETTINGS
--   authenticated : ALL
--   anon          : SELECT hanya baris branding (bukan data admin)
--   -> layar login butuh nama madrasah, logo, & daftar item; kolom 'akun'
--      (email/hp admin) TIDAK boleh terbaca publik.
-- ══════════════════════════════════════════
CREATE POLICY "admin_all"    ON settings FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public_brand" ON settings FOR SELECT TO anon
  USING (key IN ('profil', 'logo', 'payItems'));

-- ══════════════════════════════════════════
-- STORAGE: cabut akses anon ke bucket 'bukti-pembayaran'
--   (dulu dipakai wali untuk upload bukti; kini tak diperlukan)
-- ══════════════════════════════════════════
DROP POLICY IF EXISTS "bukti_insert" ON storage.objects;
DROP POLICY IF EXISTS "bukti_read"   ON storage.objects;

-- ═══════════════════════════════════════════════════════════════
-- LANGKAH MANUAL SETELAH MENJALANKAN SQL DI ATAS
-- ═══════════════════════════════════════════════════════════════
-- 1) BUAT AKUN ADMIN
--    Authentication → Users → "Add user" → isi Email & Password →
--    centang "Auto Confirm User" → Create.
--    (Email & password inilah yang dipakai login di halaman admin SiPay.)
--
-- 2) MATIKAN PENDAFTARAN PUBLIK  ⚠️ PENTING
--    Authentication → Providers/Sign In → Email → NONAKTIFKAN
--    "Allow new users to sign up".
--    Tanpa ini, orang asing bisa mendaftar sendiri dan otomatis mendapat
--    peran 'authenticated' = akses admin penuh.
--
-- 3) (Opsional) Bersihkan sisa password lama di settings:
--    UPDATE settings SET value = value - 'pass' WHERE key = 'akun';
--
-- 4) Buka aplikasi → login dengan email & password dari langkah (1).
-- ═══════════════════════════════════════════════════════════════
