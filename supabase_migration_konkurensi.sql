-- ═══════════════════════════════════════════════════════════════
-- SiPay · Migrasi tambahan — Aman dipakai beberapa admin bersamaan
-- Jalankan di: Supabase Dashboard → SQL Editor → Run
-- Aman dijalankan ulang. Tidak menghapus data. Satu-satunya data yang diubah:
-- nomor kuitansi yang KEMBAR (lihat bagian 1).
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Nomor kuitansi tidak boleh kembar ───────────────────────────────────
-- Dua admin yang menyimpan di detik yang sama dulu bisa mendapat nomor sama.
-- Sebelum indeks unik dipasang, nomor kembar yang SUDAH ada dirapikan: kuitansi
-- tertua tetap memakai nomornya, yang lebih baru diberi akhiran huruf
-- (KWT-112026-0012 → KWT-112026-0012B, C, ...). Daftarnya tampil di tab
-- "Messages" sebagai NOTICE — catat bila kuitansinya sudah tercetak.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id, no_kuitansi,
           row_number() OVER (PARTITION BY no_kuitansi ORDER BY created_at, id) AS urut
      FROM kuitansi
     WHERE no_kuitansi <> ''
  LOOP
    IF r.urut > 1 THEN
      UPDATE kuitansi SET no_kuitansi = r.no_kuitansi || chr(64 + r.urut::int) WHERE id = r.id;
      RAISE NOTICE 'Nomor kembar % diganti jadi %', r.no_kuitansi, r.no_kuitansi || chr(64 + r.urut::int);
    END IF;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS kuitansi_no_kuitansi_unique
  ON kuitansi (no_kuitansi) WHERE no_kuitansi <> '';

-- ── 2. Versi baris santri ──────────────────────────────────────────────────
-- Naik otomatis setiap baris santri diubah (oleh siapa pun). Aplikasi hanya
-- menyimpan pembayaran SPP bila versinya masih sama dengan saat dibaca; bila
-- perangkat lain mengubahnya di antara itu, aplikasi membaca ulang lalu
-- mengulang, sehingga tidak ada pembayaran yang tertimpa.
ALTER TABLE students ADD COLUMN IF NOT EXISTS versi_baris bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION naikkan_versi_baris() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.versi_baris := OLD.versi_baris + 1;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS students_versi_baris ON students;
CREATE TRIGGER students_versi_baris BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION naikkan_versi_baris();

-- ── 3. Tambah pembayaran tagihan dalam SATU perintah ───────────────────────
-- Menggantikan "baca nilai → tambah di aplikasi → tulis", yang bisa saling
-- menimpa bila dua perangkat membayar tagihan yang sama bersamaan.
-- SECURITY INVOKER (bawaan): tetap tunduk pada RLS tabel tagihan.
CREATE OR REPLACE FUNCTION tambah_tagihan_paid(p_id uuid, p_delta numeric)
RETURNS numeric LANGUAGE sql AS $$
  UPDATE tagihan SET paid_amount = GREATEST(0, paid_amount + p_delta)
   WHERE id = p_id
  RETURNING paid_amount;
$$;
REVOKE ALL ON FUNCTION tambah_tagihan_paid(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tambah_tagihan_paid(uuid, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
