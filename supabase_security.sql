-- ═══════════════════════════════════════════════════════════════
-- SiPay · Migrasi KEAMANAN (RLS ketat + Supabase Auth + akses wali via kode)
-- Jalankan di: Supabase Dashboard → SQL Editor → Run
-- Aman dijalankan berulang (idempotent). TIDAK menghapus data.
-- ═══════════════════════════════════════════════════════════════
-- Setelah menjalankan file ini, lakukan juga (lihat RUNBOOK_KEAMANAN.md):
--   1. Authentication → Users → Add user  (buat email+password admin)
--   2. Authentication → Providers → Email : matikan "Confirm email" bila
--      ingin langsung bisa login tanpa verifikasi email.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Kolom kode akses wali pada tabel students ──
ALTER TABLE students ADD COLUMN IF NOT EXISTS access_code text NOT NULL DEFAULT '';

-- Isi kode acak 6 karakter untuk santri yang belum punya
UPDATE students
   SET access_code = upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))
 WHERE access_code = '';

-- ── 2. Pastikan kolom payment_reports yang dipakai aplikasi ada ──
ALTER TABLE payment_reports ADD COLUMN IF NOT EXISTS item_type  text;
ALTER TABLE payment_reports ADD COLUMN IF NOT EXISTS item_label text;
ALTER TABLE payment_reports ADD COLUMN IF NOT EXISTS bukti_url  text;
ALTER TABLE payment_reports ADD COLUMN IF NOT EXISTS admin_note text;
ALTER TABLE payment_reports ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- ── 3. RLS: hapus policy "anon_all" (terbuka untuk publik) di semua tabel ──
--     Ganti dengan akses PENUH hanya untuk user terautentikasi (admin login).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'students','tagihan','transactions','kuitansi',
    'settings','payment_reports','kuitansi_template'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS anon_all ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_all ON %I', t);
    EXECUTE format(
      'CREATE POLICY admin_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- ── 4. Info sekolah (profil & logo) boleh dibaca publik (untuk halaman wali) ──
DROP POLICY IF EXISTS anon_read_public ON settings;
CREATE POLICY anon_read_public ON settings
  FOR SELECT TO anon
  USING (key IN ('profil', 'logo'));

-- ═══════════════════════════════════════════════════════════════
-- 5. RPC akses wali — dijalankan server-side (SECURITY DEFINER),
--    memvalidasi kode rahasia sebelum mengembalikan/menyimpan data.
--    Tabel tetap TERKUNCI dari anon; wali hanya bisa lewat fungsi ini.
-- ═══════════════════════════════════════════════════════════════

-- 5a. Lihat data santri berdasarkan nama + kode
CREATE OR REPLACE FUNCTION guest_lookup(p_nama text, p_code text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student students;
  v_result  json;
BEGIN
  SELECT * INTO v_student
    FROM students
   WHERE lower(nama) = lower(trim(p_nama))
   LIMIT 1;

  IF v_student.nama IS NULL
     OR v_student.access_code = ''
     OR v_student.access_code <> upper(trim(p_code)) THEN
    RETURN NULL;  -- nama/kode salah
  END IF;

  SELECT json_build_object(
    'siswa', json_build_object(
        'nama',             v_student.nama,
        'kelas',            v_student.kelas,
        'nisn',             v_student.nisn,
        'spp',              v_student.spp,
        'spp_paid_months',  v_student.spp_paid_months,
        'status_kelulusan', v_student.status_kelulusan
    ),
    'tagihan', COALESCE(
        (SELECT json_agg(json_build_object(
            'item_id', t.item_id, 'item_name', t.item_name,
            'nominal', t.nominal, 'paid_amount', t.paid_amount))
           FROM tagihan t WHERE t.nama = v_student.nama), '[]'::json),
    'transactions', COALESCE(
        (SELECT json_agg(json_build_object(
            'jenis', x.jenis, 'nominal', x.nominal,
            'time', x.time, 'catatan', x.catatan, 'created_at', x.created_at)
            ORDER BY x.created_at DESC)
           FROM transactions x WHERE x.nama = v_student.nama), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END $$;

-- 5b. Kirim laporan pembayaran (wali) — validasi kode dulu
CREATE OR REPLACE FUNCTION guest_submit_report(
  p_nama text, p_code text,
  p_item_type text, p_item_label text,
  p_nominal numeric, p_catatan text, p_bukti_url text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_student students;
BEGIN
  SELECT * INTO v_student
    FROM students
   WHERE lower(nama) = lower(trim(p_nama))
   LIMIT 1;

  IF v_student.nama IS NULL
     OR v_student.access_code = ''
     OR v_student.access_code <> upper(trim(p_code)) THEN
    RETURN false;
  END IF;

  INSERT INTO payment_reports(nama, kelas, item_type, item_label, nominal, catatan, bukti_url, status)
  VALUES (v_student.nama, v_student.kelas, p_item_type, p_item_label,
          coalesce(p_nominal, 0), coalesce(p_catatan, ''), p_bukti_url, 'pending');
  RETURN true;
END $$;

-- 5c. Daftar laporan milik santri (wali) — validasi kode
CREATE OR REPLACE FUNCTION guest_reports(p_nama text, p_code text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_student students; v_result json;
BEGIN
  SELECT * INTO v_student
    FROM students WHERE lower(nama) = lower(trim(p_nama)) LIMIT 1;
  IF v_student.nama IS NULL OR v_student.access_code = ''
     OR v_student.access_code <> upper(trim(p_code)) THEN
    RETURN '[]'::json;
  END IF;
  SELECT COALESCE(json_agg(r ORDER BY r.created_at DESC), '[]'::json) INTO v_result
    FROM payment_reports r WHERE r.nama = v_student.nama;
  RETURN v_result;
END $$;

-- Berikan izin eksekusi ke anon (publik), CABUT akses langsung ke tabel
GRANT EXECUTE ON FUNCTION guest_lookup(text, text)                              TO anon;
GRANT EXECUTE ON FUNCTION guest_submit_report(text, text, text, text, numeric, text, text) TO anon;
GRANT EXECUTE ON FUNCTION guest_reports(text, text)                            TO anon;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK (bila perlu kembali ke mode lama yang terbuka — TIDAK disarankan):
--   DO $$ DECLARE t text; BEGIN
--     FOREACH t IN ARRAY ARRAY['students','tagihan','transactions','kuitansi',
--       'settings','payment_reports','kuitansi_template'] LOOP
--       EXECUTE format('DROP POLICY IF EXISTS admin_all ON %I', t);
--       EXECUTE format('CREATE POLICY anon_all ON %I FOR ALL TO anon USING (true) WITH CHECK (true)', t);
--     END LOOP; END $$;
-- ═══════════════════════════════════════════════════════════════
