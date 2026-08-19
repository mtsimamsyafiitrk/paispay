-- ═══════════════════════════════════════════════════════════════
-- SiPay · Migrasi tambahan — Bulan Mulai Tagih SPP (santri masuk tengah TA)
-- Jalankan di: Supabase Dashboard → SQL Editor → Run
-- AMAN: hanya menambah kolom baru, tidak menghapus/menimpa data apa pun.
-- ═══════════════════════════════════════════════════════════════
--
-- Kolom students.spp_mulai menandai sejak bulan apa SPP seorang santri mulai
-- ditagih pada tahun ajaran berjalan. Bentuknya "<TA>|<kode bulan>", mis:
--   "2025/2026|Nov"  → SPP baru ditagih sejak November TA 2025/2026
--   ""               → ditagih penuh sejak Juli (santri lama, bawaan)
--
-- Diisi otomatis saat calon santri SPMB dipromosikan jadi santri aktif, memakai
-- bulan saat ia dimasukkan ke aplikasi, sehingga bulan-bulan sebelum ia masuk
-- (mis. Juli s/d Oktober) tidak ikut terhitung sebagai tunggakan.
--
-- Label TA ikut disimpan supaya penanda ini berhenti berlaku dengan sendirinya
-- pada tahun ajaran berikutnya: setelah "Promosi Kelas", santri tersebut
-- ditagih penuh 12 bulan seperti santri lain.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS spp_mulai text NOT NULL DEFAULT '';
