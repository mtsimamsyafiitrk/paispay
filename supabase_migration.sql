-- ═══════════════════════════════════════════════════════════════
-- SiPay · Supabase Migration
-- Cara menjalankan:
--   Buka Supabase Dashboard → pilih project →
--   klik SQL Editor → paste query di bawah → klik Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Tambahkan UNIQUE constraint pada kolom nama di tabel students
--    (wajib agar upsert dengan on_conflict=nama bisa berfungsi)
ALTER TABLE students
  ADD CONSTRAINT students_nama_unique UNIQUE (nama);

-- 2. Tambahkan kolom status_kelulusan jika belum ada
--    (untuk fitur bulk update status: lulus / pindah / keluar)
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS status_kelulusan text NOT NULL DEFAULT '';

-- 3. Tambahkan kolom SPMB untuk fitur Penerimaan Murid Baru
--    uang_pendaftaran  = nominal uang pendaftaran yang harus dibayar calon santri
--    uang_pendaftaran_paid = total yang sudah dibayarkan
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS uang_pendaftaran numeric NOT NULL DEFAULT 0;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS uang_pendaftaran_paid numeric NOT NULL DEFAULT 0;

-- 4. Verifikasi constraint sudah terbuat:
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'students'
  AND constraint_type = 'UNIQUE';
