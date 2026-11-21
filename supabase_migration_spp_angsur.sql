-- ═══════════════════════════════════════════════════════════════
-- SiPay · Migrasi tambahan — Angsuran SPP per bulan
-- Jalankan di: Supabase Dashboard → SQL Editor → Run
-- AMAN: hanya menambah kolom baru, tidak menghapus/menimpa data apa pun.
-- ═══════════════════════════════════════════════════════════════
--
-- Kolom students.spp_angsur mencatat bulan SPP tahun ajaran BERJALAN yang baru
-- dibayar SEBAGIAN (diangsur). Bentuknya objek { kode bulan: nominal dibayar }:
--   { "Agt": 50000 }   → SPP Agustus baru dibayar Rp 50.000 (sisanya menunggak)
--   {}                 → tidak ada bulan yang sedang diangsur (bawaan)
--
-- Begitu angsuran satu bulan mencapai nominal SPP, bulan itu otomatis pindah
-- ke spp_paid_months (lunas) dan dihapus dari kolom ini.
--
-- Angsuran tunggakan SPP tahun ajaran SEBELUMNYA tidak memakai kolom ini —
-- dicatat di spp_history (bentuk rinci: months: { Jul: { n, d } }).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS spp_angsur jsonb NOT NULL DEFAULT '{}';

-- Paksa PostgREST memuat ulang skema supaya kolom baru langsung dikenali.
NOTIFY pgrst, 'reload schema';

-- ── Verifikasi (opsional) ──────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'students' AND column_name = 'spp_angsur';
