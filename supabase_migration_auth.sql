-- ═══════════════════════════════════════════════════════════════
-- SiPay · Migrasi Keamanan: RLS + Supabase Auth
-- Jalankan di: Supabase Dashboard → SQL Editor → Run
--
-- APA YANG DILAKUKAN:
--   Mengganti kebijakan lama "anon_all" (siapa pun bisa baca+tulis+hapus)
--   dengan kebijakan berbasis peran:
--     • anon (publik/wali)  : HANYA BOLEH BACA data + KIRIM laporan
--     • authenticated (admin): akses penuh (baca/tulis/hapus)
--
--   Setelah migrasi ini, operasi tulis (simpan siswa, input pembayaran,
--   hapus, dll) HANYA berhasil bila dilakukan admin yang login lewat
--   Supabase Auth. Data tidak lagi bisa diubah/dihapus sembarang orang.
--
-- CATATAN: migrasi ini AMAN untuk data — tidak menghapus tabel/baris,
--          hanya mengganti kebijakan akses.
-- ═══════════════════════════════════════════════════════════════

-- ── Helper: buang policy lama di tiap tabel ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'students','tagihan','transactions','kuitansi',
    'settings','payment_reports','kuitansi_template'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_all" ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "public_read" ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "public_insert" ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_all" ON %I;', t);
    -- Pastikan RLS aktif
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- ══════════════════════════════════════════
-- TABEL DATA UMUM
--   anon          : SELECT (agar wali/tamu bisa melihat tagihan)
--   authenticated : ALL    (admin)
-- ══════════════════════════════════════════
-- students
CREATE POLICY "public_read" ON students        FOR SELECT TO anon          USING (true);
CREATE POLICY "admin_all"   ON students        FOR ALL    TO authenticated USING (true) WITH CHECK (true);
-- tagihan
CREATE POLICY "public_read" ON tagihan         FOR SELECT TO anon          USING (true);
CREATE POLICY "admin_all"   ON tagihan         FOR ALL    TO authenticated USING (true) WITH CHECK (true);
-- transactions
CREATE POLICY "public_read" ON transactions    FOR SELECT TO anon          USING (true);
CREATE POLICY "admin_all"   ON transactions    FOR ALL    TO authenticated USING (true) WITH CHECK (true);
-- kuitansi
CREATE POLICY "public_read" ON kuitansi         FOR SELECT TO anon          USING (true);
CREATE POLICY "admin_all"   ON kuitansi         FOR ALL    TO authenticated USING (true) WITH CHECK (true);
-- settings (profil, logo, item bayar — perlu dibaca publik untuk tampilan)
CREATE POLICY "public_read" ON settings         FOR SELECT TO anon          USING (true);
CREATE POLICY "admin_all"   ON settings         FOR ALL    TO authenticated USING (true) WITH CHECK (true);
-- kuitansi_template
CREATE POLICY "public_read" ON kuitansi_template FOR SELECT TO anon          USING (true);
CREATE POLICY "admin_all"   ON kuitansi_template FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════
-- PAYMENT REPORTS (laporan wali)
--   anon          : SELECT + INSERT (wali kirim laporan, lihat status)
--   authenticated : ALL            (admin verifikasi/hapus)
--   -> anon TIDAK boleh UPDATE/DELETE (wali tak bisa ubah status sendiri)
-- ══════════════════════════════════════════
CREATE POLICY "public_read"   ON payment_reports FOR SELECT TO anon          USING (true);
CREATE POLICY "public_insert" ON payment_reports FOR INSERT TO anon          WITH CHECK (true);
CREATE POLICY "admin_all"     ON payment_reports FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════
-- STORAGE: bucket 'bukti-pembayaran'
--   Wali (anon) perlu meng-upload bukti; publik boleh membaca.
--   Jalankan HANYA jika bucket 'bukti-pembayaran' sudah dibuat.
--   (Storage → Create bucket → nama: bukti-pembayaran, Public: ON)
-- ══════════════════════════════════════════
DROP POLICY IF EXISTS "bukti_insert" ON storage.objects;
DROP POLICY IF EXISTS "bukti_read"   ON storage.objects;
CREATE POLICY "bukti_insert" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'bukti-pembayaran');
CREATE POLICY "bukti_read"   ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'bukti-pembayaran');

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
-- 3) (Opsional) Hapus sisa password lama yang pernah tersimpan di settings:
--    UPDATE settings SET value = value - 'pass' WHERE key = 'akun';
--    -- atau kosongkan sekalian: DELETE FROM settings WHERE key = 'akun';
--
-- 4) Buka aplikasi → login dengan email & password dari langkah (1).
-- ═══════════════════════════════════════════════════════════════
