-- ═══════════════════════════════════════════════════════════════
-- SiPay · Migrasi tambahan — Metadata Pembayaran
-- Jalankan di: Supabase Dashboard → SQL Editor → Run
-- AMAN: hanya menambah kolom baru, tidak menghapus/menimpa data apa pun.
-- ═══════════════════════════════════════════════════════════════
--
-- Menyimpan detail pembayaran yang diisi di form Input Pembayaran:
--   - metode        : 'tunai' | 'transfer'
--   - dibayar_oleh  : nama penyetor / pembayar
--   - tgl_bayar     : tanggal & jam pembayaran yang dipilih admin (bisa beda
--                     dari created_at server), disimpan sebagai teks tampilan
--                     "DD/MM/YYYY HH:MM" agar kuitansi cetak-ulang konsisten.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS metode       text NOT NULL DEFAULT '';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dibayar_oleh text NOT NULL DEFAULT '';

ALTER TABLE kuitansi     ADD COLUMN IF NOT EXISTS metode       text NOT NULL DEFAULT '';
ALTER TABLE kuitansi     ADD COLUMN IF NOT EXISTS dibayar_oleh text NOT NULL DEFAULT '';
ALTER TABLE kuitansi     ADD COLUMN IF NOT EXISTS tgl_bayar    text NOT NULL DEFAULT '';
