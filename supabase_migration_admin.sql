-- ═══════════════════════════════════════════════════════════════
-- SiPay · Migrasi Keamanan — Hanya DAFTAR ADMIN yang boleh mengakses data
-- Jalankan di: Supabase Dashboard → SQL Editor → Run
-- Aman dijalankan ulang. Tidak menghapus data.
-- ═══════════════════════════════════════════════════════════════
--
-- MASALAH YANG DITUTUP:
--   Aturan lama "admin_all ... TO authenticated USING (true)" memberi akses
--   penuh ke SIAPA PUN yang punya akun login. Bila "Allow new users to sign up"
--   di Supabase lupa dimatikan, orang asing bisa mendaftar memakai kunci anon
--   (yang memang publik di js/config.js) lalu membaca/mengubah seluruh data.
--
-- SESUDAH MIGRASI:
--   Hanya akun yang tercantum di tabel admin_users yang mendapat akses.
--   Akun baru (termasuk hasil pendaftaran publik) TIDAK otomatis jadi admin.
--
-- PENGISIAN AWAL:
--   Semua akun yang SUDAH ADA saat migrasi dijalankan dimasukkan sebagai admin.
--   Periksa daftarnya di tab "Messages" (NOTICE) — bila ada akun yang tidak
--   dikenal, hapus:  DELETE FROM admin_users WHERE email = 'orang.asing@...';
--
-- MENAMBAH ADMIN BARU NANTI:
--   1) Authentication → Users → Add user (centang Auto Confirm User)
--   2) INSERT INTO admin_users (user_id, email)
--        SELECT id, email FROM auth.users WHERE email = 'admin.baru@...';
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_users (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);
-- RLS aktif tanpa policy = tak bisa dibaca/diubah lewat API; hanya lewat
-- SQL Editor atau fungsi is_admin() di bawah.
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Pengisian awal (hanya bila daftarnya masih kosong, supaya menjalankan ulang
-- migrasi tidak diam-diam menambahkan akun yang dibuat sesudahnya).
DO $$
DECLARE r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users) THEN
    FOR r IN SELECT id, email FROM auth.users ORDER BY created_at LOOP
      INSERT INTO admin_users (user_id, email) VALUES (r.id, COALESCE(r.email, ''));
      RAISE NOTICE 'Admin: %', r.email;
    END LOOP;
  END IF;
END $$;

-- SECURITY DEFINER: membaca admin_users walau tabelnya tertutup RLS.
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin() TO anon, authenticated;

-- Ganti aturan "admin_all" di setiap tabel data.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'students','tagihan','transactions','kuitansi',
    'settings','payment_reports','kuitansi_template'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_all" ON %I;', t);
    EXECUTE format('CREATE POLICY "admin_all" ON %I FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());', t);
  END LOOP;
END $$;
-- Policy "public_brand" (anon membaca profil/logo/payItems untuk layar login)
-- tidak diubah.

NOTIFY pgrst, 'reload schema';

-- ── Verifikasi (opsional) ──
--   SELECT email FROM admin_users;
--   SELECT tablename, qual FROM pg_policies WHERE policyname = 'admin_all';
