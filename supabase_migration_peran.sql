-- ═══════════════════════════════════════════════════════════════
-- SiPay · Migrasi Peran Akun — ADMIN dan PETUGAS
-- Jalankan di: Supabase Dashboard → SQL Editor → New query → tempel → Run
-- Aman dijalankan ulang. Tidak menghapus data.
-- Syarat: supabase_migration_admin.sql sudah pernah dijalankan.
-- ═══════════════════════════════════════════════════════════════
--
-- PERAN:
--   admin   : semua fitur (tambah/edit/hapus santri, SPMB, import & input
--             tunggakan, promosi kelas, item bayar, template, profil).
--   petugas : input pembayaran, hapus/koreksi/cetak kuitansi, lihat Buku Induk,
--             lihat data, cetak & export, ganti password sendiri.
--             (menambah arsip Buku Induk — Input Manual/Upload Massal — admin saja)
--
-- SESUDAH MIGRASI semua akun yang sudah terdaftar tetap ADMIN (tidak ada yang
-- terkunci). Jadikan seseorang PETUGAS dengan:
--   UPDATE admin_users SET peran = 'petugas' WHERE email = 'petugas@contoh.com';
-- Kembalikan jadi admin:
--   UPDATE admin_users SET peran = 'admin'   WHERE email = 'petugas@contoh.com';
-- Akun BARU (Authentication → Users → Add user, centang Auto Confirm User):
--   INSERT INTO admin_users (user_id, email, peran)
--     SELECT id, email, 'petugas' FROM auth.users WHERE email = 'petugas.baru@contoh.com';
-- Lihat daftar:  SELECT email, peran FROM admin_users ORDER BY peran, email;
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS peran text NOT NULL DEFAULT 'admin';
ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_peran_check;
ALTER TABLE admin_users ADD CONSTRAINT admin_users_peran_check CHECK (peran IN ('admin', 'petugas'));

-- is_admin() TIDAK diubah: tetap berarti "akun terdaftar" (admin ATAU petugas)
-- dan tetap menjadi syarat membaca data.

-- Admin penuh?
CREATE OR REPLACE FUNCTION is_admin_penuh() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND peran = 'admin');
$$;
REVOKE ALL ON FUNCTION is_admin_penuh() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin_penuh() TO authenticated;

-- Peran akun yang sedang login (dipakai aplikasi untuk menyesuaikan menu).
CREATE OR REPLACE FUNCTION peran_saya() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT peran FROM admin_users WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION peran_saya() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION peran_saya() TO authenticated;

-- ── Aturan per tabel ──
-- Baca: semua akun terdaftar. Tambah/hapus: admin saja. Ubah: semua akun
-- terdaftar, tetapi trigger di bawah membatasi KOLOM yang boleh diubah petugas.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students', 'tagihan'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS "admin_all" ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "baca" ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "tambah_admin" ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "ubah" ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "hapus_admin" ON %I;', t);
    EXECUTE format('CREATE POLICY "baca" ON %I FOR SELECT TO authenticated USING (is_admin());', t);
    EXECUTE format('CREATE POLICY "tambah_admin" ON %I FOR INSERT TO authenticated WITH CHECK (is_admin_penuh());', t);
    EXECUTE format('CREATE POLICY "ubah" ON %I FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());', t);
    EXECUTE format('CREATE POLICY "hapus_admin" ON %I FOR DELETE TO authenticated USING (is_admin_penuh());', t);
  END LOOP;

  -- Pengaturan (item bayar, profil, logo, akun) & template kuitansi: baca semua
  -- akun terdaftar, ubah admin saja. Policy "public_brand" (anon membaca profil
  -- untuk layar login) tidak disentuh.
  FOREACH t IN ARRAY ARRAY['settings', 'kuitansi_template'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS "admin_all" ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "baca" ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "tulis_admin" ON %I;', t);
    EXECUTE format('CREATE POLICY "baca" ON %I FOR SELECT TO authenticated USING (is_admin());', t);
    EXECUTE format('CREATE POLICY "tulis_admin" ON %I FOR ALL TO authenticated USING (is_admin_penuh()) WITH CHECK (is_admin_penuh());', t);
  END LOOP;
END $$;
-- transactions tetap "admin_all" (semua akun terdaftar).
-- kuitansi: input pembayaran, cetak, hapus & koreksi kuitansi untuk semua akun;
-- MENAMBAH arsip Buku Induk (nomor berawalan "BI-") khusus admin.
-- Catatan: jangan pakai "BI" sebagai prefix nomor kuitansi di Template Kuitansi.
DO $$
BEGIN
  IF to_regclass('public.kuitansi') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "admin_all"   ON kuitansi;
  DROP POLICY IF EXISTS "baca"        ON kuitansi;
  DROP POLICY IF EXISTS "tambah"      ON kuitansi;
  DROP POLICY IF EXISTS "ubah"        ON kuitansi;
  DROP POLICY IF EXISTS "hapus"       ON kuitansi;
  CREATE POLICY "baca"   ON kuitansi FOR SELECT TO authenticated USING (is_admin());
  CREATE POLICY "tambah" ON kuitansi FOR INSERT TO authenticated
    WITH CHECK (is_admin_penuh() OR (is_admin() AND no_kuitansi NOT LIKE 'BI-%'));
  CREATE POLICY "ubah"   ON kuitansi FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  CREATE POLICY "hapus"  ON kuitansi FOR DELETE TO authenticated USING (is_admin());
END $$;

-- ── Petugas hanya boleh mengubah kolom PEMBAYARAN ──
-- Berlaku untuk permintaan dari aplikasi (auth.uid() terisi). Perubahan lewat
-- SQL Editor tidak dibatasi.
CREATE OR REPLACE FUNCTION jaga_kolom_petugas() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE boleh text[] := TG_ARGV;   -- kolom yang boleh diubah petugas
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_admin_penuh()
     AND (to_jsonb(NEW) - boleh) IS DISTINCT FROM (to_jsonb(OLD) - boleh) THEN
    RAISE EXCEPTION 'Hanya admin yang boleh mengubah data ini' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS students_jaga_petugas ON students;
CREATE TRIGGER students_jaga_petugas BEFORE UPDATE ON students FOR EACH ROW
  EXECUTE FUNCTION jaga_kolom_petugas('spp_paid_months', 'spp_angsur', 'spp_history', 'versi_baris');

DROP TRIGGER IF EXISTS tagihan_jaga_petugas ON tagihan;
CREATE TRIGGER tagihan_jaga_petugas BEFORE UPDATE ON tagihan FOR EACH ROW
  EXECUTE FUNCTION jaga_kolom_petugas('paid_amount');

NOTIFY pgrst, 'reload schema';

-- ── Verifikasi (opsional) ──
--   SELECT email, peran FROM admin_users;
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('students','tagihan','settings','kuitansi_template') ORDER BY 1, 2;
