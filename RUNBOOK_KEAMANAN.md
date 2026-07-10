# 🔐 Runbook Keamanan SiPay (gratis / free tier)

Perubahan ini mengganti keamanan yang tadinya **terbuka** (siapa pun bisa
baca/ubah/hapus semua data) menjadi:

- **Login admin asli** lewat **Supabase Auth** (JWT), bukan lagi dicek di browser.
- **RLS ketat**: hanya admin terautentikasi yang bisa akses data.
- **Akses wali via kode unik** per santri (lewat fungsi server, tabel tetap terkunci).
- **Password tidak pernah lagi disimpan** di localStorage/tabel `settings`.

Semua komponen di atas **gratis** pada Supabase free tier + GitHub Pages.

> ⚠️ **PENTING — urutan go-live.** Jangan deploy kode baru ini sebelum langkah
> Supabase (1–3) selesai, karena aplikasi butuh RLS + user admin agar berfungsi.

---

## Langkah 1 — Jalankan SQL keamanan
1. Buka **supabase.com → proyek Anda → SQL Editor → New query**.
2. Salin seluruh isi file [`supabase_security.sql`](./supabase_security.sql), tempel, **Run**.
3. Pastikan tidak ada error. SQL ini:
   - menambah kolom `access_code` + mengisi kode acak untuk santri lama,
   - mengganti policy `anon_all` (terbuka) menjadi `admin_all` (hanya admin),
   - membuat fungsi `guest_lookup` / `guest_submit_report` / `guest_reports` untuk wali.

## Langkah 2 — Buat user admin
1. **Authentication → Users → Add user**.
2. Isi **email** + **password** admin (mis. `admin@sekolah.sch.id`). Centang
   *Auto Confirm User* agar langsung aktif.
3. (Opsional) **Authentication → Providers → Email**: matikan *Confirm email*
   bila tidak ingin verifikasi email.

## Langkah 3 — (Opsional) Izinkan upload bukti oleh wali
Jika memakai fitur "Lapor Pembayaran" dengan lampiran bukti:
1. **Storage** → pastikan bucket **`bukti-pembayaran`** ada dan **Public**.
2. Tambah policy INSERT untuk role `anon` pada bucket tsb.
   > Bila dilewati, laporan wali tetap terkirim, hanya tanpa lampiran foto.

## Langkah 4 — Deploy kode baru
Merge PR ini lalu deploy (GitHub Pages otomatis dari branch `main`).

## Langkah 5 — Uji
- **Admin**: buka app → login pakai email+password Supabase → data tampil.
- **Wali**: menu login → tab *Pengunjung* → isi **nama santri + kode akses**.
  Kode dilihat admin di **Data Santri → 📋 (Detail) → 🔑 Kode Akses Wali**
  (bisa disalin / diganti di sana).
- **Uji negatif**: buka tab incognito, coba akses REST langsung tanpa login —
  seharusnya **ditolak** (bukti RLS bekerja).

---

## Bagi kode akses ke wali
Setiap santri punya kode 6 karakter. Admin membukanya via tombol **Detail (📋)**
di halaman Data Santri. Tombol **🔄 Ganti** membuat kode baru (kode lama langsung
tidak berlaku). Santri baru / hasil import otomatis dapat kode.

## Catatan efisiensi
- Data admin di-cache di `localStorage` (`sipay_state`) untuk load lebih cepat & mode offline.
- Halaman wali kini hanya mengambil data 1 santri (via RPC), bukan seluruh daftar —
  lebih ringan sekaligus lebih privat.

## Rollback
Bagian bawah `supabase_security.sql` berisi blok SQL untuk mengembalikan policy
terbuka (tidak disarankan, hanya darurat).
