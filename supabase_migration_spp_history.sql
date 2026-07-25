-- ═══════════════════════════════════════════════════════════════
-- SiPay · Migrasi tambahan — Riwayat SPP Tahun Ajaran Sebelumnya
-- Jalankan di: Supabase Dashboard → SQL Editor → Run
-- AMAN: hanya menambah kolom baru, tidak menghapus/menimpa data apa pun.
-- ═══════════════════════════════════════════════════════════════
--
-- Kolom students.spp_history menyimpan snapshot SPP tiap tahun ajaran yang
-- sudah lewat, dengan bentuk:
--   { "2024/2025": { "spp": 100000, "spp_paid_months": ["Jul","Agt"] }, ... }
--
-- Snapshot ini dibuat otomatis oleh aplikasi saat "Promosi Kelas" (pindah
-- tahun ajaran), tepat sebelum spp_paid_months tahun berjalan direset.
-- Dengan begitu, bulan SPP yang belum dibayar di tahun ajaran sebelumnya
-- tetap tercatat sebagai tunggakan dan bisa dibayar di tahun ajaran baru.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS spp_history jsonb NOT NULL DEFAULT '{}';
