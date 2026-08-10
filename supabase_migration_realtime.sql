-- ═══════════════════════════════════════════════════════════════
-- SiPay · Migrasi Realtime — perubahan tampil SEKETIKA di semua device
-- Jalankan di: Supabase Dashboard → SQL Editor → Run
-- AMAN: tidak menghapus/mengubah data apa pun, hanya mendaftarkan tabel
--       ke publication `supabase_realtime`.
-- ═══════════════════════════════════════════════════════════════
--
-- KENAPA PERLU:
--   Supabase Realtime hanya mengirim event untuk tabel yang terdaftar di
--   publication `supabase_realtime`. Tanpa migrasi ini, WebSocket tetap
--   tersambung tapi TIDAK ADA event yang mengalir — aplikasi akan diam-diam
--   kembali memakai polling 2 menit (tetap jalan, hanya tidak seketika).
--
-- SETELAH DIJALANKAN:
--   Buka aplikasi, login sebagai admin. Indikator di kanan atas berubah dari
--   "🟢 Terhubung" menjadi "🟢 Realtime". Coba input pembayaran di satu
--   device — device lain ikut berubah dalam hitungan detik tanpa refresh.
--
-- ⚠️ ULANGI migrasi ini bila Anda menjalankan `supabase_migration.sql`
--    (reset penuh), karena DROP TABLE ikut mengeluarkan tabel dari
--    publication.
--
-- CATATAN KEAMANAN:
--   Realtime tetap tunduk pada RLS. Kebijakan SiPay adalah admin-only
--   (`TO authenticated`), jadi hanya sesi admin yang login yang menerima
--   event. Publication ini TIDAK membuka data ke publik.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  -- Publication bawaan Supabase; dibuat bila belum ada.
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY ARRAY['students','tagihan','transactions','kuitansi','settings'] LOOP
    -- Lewati tabel yang belum dibuat & yang sudah terdaftar (idempoten).
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
    END IF;
  END LOOP;
END $$;

-- ── Verifikasi: harus mengembalikan 5 baris ──
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
ORDER BY tablename;
