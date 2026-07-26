# SiPay — Sistem Pembayaran Santri
## Struktur Proyek (Hasil Refactoring)

```
sipay/
├── index.html              # Shell HTML: head, semua halaman & modals
├── css/
│   └── main.css            # Semua styling (440 baris)
├── js/
│   ├── config.js           # Konstanta, state awal, Supabase config
│   ├── database.js         # Layer database: REST helper, CRUD siswa/transaksi/settings
│   ├── tahun-ajaran.js     # Manajemen tahun ajaran & wizard pindah TA
│   ├── helpers.js          # Utility, navigasi, fuzzy-matching nama siswa
│   ├── dashboard.js        # Render halaman dashboard & statistik
│   ├── input.js            # Input pembayaran (pilih siswa, SPP, kalkulasi)
│   ├── siswa.js            # Halaman data siswa & log riwayat
│   ├── tunggakan.js        # Halaman rekapitulasi tunggakan
│   ├── items.js            # Manajemen item pembayaran & modal detail
│   ├── cetak.js            # Cetak surat pernyataan & PDF rekapitulasi
│   ├── profil.js           # Profil madrasah (nama, alamat, logo)
│   ├── manajemen-siswa.js  # Tambah/edit/hapus/bulk siswa
│   ├── import.js           # Import siswa dari Excel/CSV
│   ├── import-tunggakan.js # Import tunggakan lama lintas tahun ajaran
│   ├── auth.js             # Login admin via Supabase Auth
│   ├── guest.js            # Modal logout (sisa mode wali telah dihapus)
│   ├── kuitansi.js         # Modal kuitansi, hapus, cetak, riwayat
│   ├── koreksi.js          # Alur koreksi pembayaran (multi-step)
│   ├── template-kuitansi.js# Builder & preview template kuitansi
│   └── init.js             # DOMContentLoaded & inisialisasi app
└── README.md
```

## Perubahan dari Versi Sebelumnya

| Sebelum | Sesudah |
|---------|---------|
| 1 file `index.html` (7.005 baris) | `index.html` (1.703 baris) + 23 JS module + 1 CSS |
| CSS inline di `<style>` | `css/main.css` (440 baris) |
| 2 blok `<script>` monolitik | 23 file JS modular |
| Sulit di-debug & di-maintain | Setiap modul punya tanggung jawab jelas |

## Buku Induk — Arsip Pembayaran Lama

Menu **Buku Induk** dipakai untuk memasukkan pembayaran dari angkatan / tahun
ajaran sebelumnya sebagai **arsip / catatan induk**. Karakteristik:

- Data disimpan ke tabel `kuitansi` yang sama, bernomor **`BI-…`** (berbeda dari
  kuitansi berjalan `KWT-…`), sehingga otomatis **bisa dicari & dibuka detailnya**
  di halaman **Riwayat Kuitansi**.
- **Tidak** menyentuh tabel `tagihan` / statistik tahun berjalan (murni arsip).
- Dua cara input: **Input Manual** (satu per satu) dan **Upload Massal** (Excel/CSV,
  kolom: `TAHUN_AJARAN, NAMA, KELAS, NISN, ITEM, NOMINAL, BULAN, TANGGAL, CATATAN`).
- **Data tidak lengkap tetap boleh disimpan**: entri ditandai otomatis (catatan
  diawali `[DATA TIDAK LENGKAP]` + alasan) dan ditampilkan sebagai peringatan di
  modal detail serta badge di Riwayat Kuitansi — sehingga tidak salah dibaca
  sebagai tunggakan. Tidak perlu perubahan skema database.

## Import Tunggakan Lintas Tahun Ajaran

Menu **Tunggakan → 📥 Import Tunggakan** memasukkan tunggakan lama (SPP per bulan
dari beberapa tahun ajaran sekaligus, uang pangkal, uang pembangunan, dll) dari
file rekap. Setelah diimport, **semua tunggakan seorang santri langsung muncul**
saat namanya dipilih di **Input Pembayaran** — tidak peduli tunggakan itu berasal
dari tahun ajaran yang mana.

**Format file yang didukung**

| Format | Isi |
|--------|-----|
| `.json` per santri | Array objek: `nama`, `status`, `kelas_terakhir`, `ta_masuk`, `ta_terakhir`, `tunggakan_pangkal`, `tunggakan_pembangunan`, `tagihan_spp[]` |
| `.csv` / `.xlsx` / `.json` baris-per-bulan | Kolom `nama_santri`, `tahun_ajaran`, `kelas`, `bulan` (atau `periode`), `nominal`, `dibayar`, `sisa` |

Setiap field/kolom bernama `tunggakan_<item>` otomatis menjadi tagihan item
dengan id `<item>` (mis. `tunggakan_pembangunan` → item `pembangunan`). Definisi
item yang belum ada ditambahkan otomatis ke *Kelola Item Bayar*.

**Ke mana data masuk**

- Tahun ajaran **berjalan** (bisa dipilih di layar pratinjau; default = TA terbaru
  di file) → kolom SPP normal: `students.spp` + `spp_paid_months`.
- Tahun ajaran **lainnya** → `students.spp_history[TA]` sebagai tunggakan tahun lalu.
- `tunggakan_<item>` → tabel `tagihan` (nominal disetel agar sisanya sama dengan
  angka di file).

**Pengaman yang perlu diketahui**

- **Import ulang aman.** Bulan yang sudah dilunasi lewat aplikasi tidak akan
  dijadikan tunggakan lagi. Nominal tagihan item yang sudah ada juga tidak
  ditimpa kecuali kotak *"Timpa nominal tagihan item yang sudah ada"* dicentang.
- **Nama kembar.** Bila file memuat dua santri berbeda dengan nama persis sama,
  layar pratinjau memberi peringatan dan (secara default) memisahkannya dengan
  menambahkan keterangan angkatan pada nama — karena satu nama = satu baris di
  database.
- **Pencocokan nama mirip** dipakai untuk menyambung ke santri yang sudah
  terdaftar, tapi satu santri lama hanya bisa diklaim satu baris file. Daftar
  hasil pencocokan mirip ditampilkan di pratinjau untuk diperiksa.
- **Angsuran pada TA berjalan.** Alur SPP tahun berjalan hanya mengenal
  lunas/belum per bulan, jadi bulan yang baru terbayar sebagian dicatat *belum
  lunas* (nominal penuh) dan dilaporkan di pratinjau.
- **Nilai tunggakan negatif** (kelebihan bayar) dianggap **0** dan dilaporkan.

## Tunggakan SPP Tahun Ajaran Sebelumnya

Saat **Promosi Kelas** (pindah tahun ajaran), `spp_paid_months` tahun berjalan
direset. Agar tunggakan SPP tahun lalu tidak hilang, sistem menyimpan **snapshot**
tahun yang ditutup ke kolom `students.spp_history`:

```json
{ "2024/2025": { "spp": 100000, "spp_paid_months": ["Jul","Agt"] } }
```

Entri juga bisa berbentuk **rinci** — dipakai bila nominal SPP berubah di tengah
tahun atau ada bulan yang baru diangsur sebagian (`n` = nominal bulan itu,
`d` = sudah dibayar). Bulan yang tidak ada di `months` berarti tidak ditagih:

```json
{ "2024/2025": {
    "spp": 700000, "spp_paid_months": ["Jul"], "kelas": "7",
    "months": { "Jul": { "n": 700000, "d": 700000 },
                "Agt": { "n": 700000, "d": 200000 } } } }
```

Dampaknya:

- **Input Pembayaran** menampilkan kartu **"⚠️ Tunggakan SPP Tahun Ajaran
  Sebelumnya"** berisi chip bulan yang belum dibayar per tahun ajaran (bisa dipilih
  sebagian atau semua), lengkap dengan sisa per bulan bila nominalnya berbeda-beda.
  Pembayaran dicatat balik ke `spp_history` tahun terkait (tidak mengubah SPP tahun
  berjalan) dan tetap tercetak di kuitansi dengan nominal asli tiap bulan.
- **Tunggakan** (dashboard, tabel santri, detail, halaman Tunggakan) kini menghitung
  tunggakan SPP tahun lalu ke dalam total, dengan rincian terpisah per tahun ajaran.

**Migrasi database:** jalankan `supabase_migration_spp_history.sql` (menambah kolom
`spp_history jsonb` — aman, tidak menghapus data). Bila migrasi belum dijalankan,
aplikasi tetap berfungsi normal (fitur riwayat SPP nonaktif otomatis) sampai kolom
tersedia. Bentuk `months` di atas hanya menambah isi JSON — **tidak** perlu migrasi
tambahan.

### Panel "Semua Tunggakan" di Input Pembayaran

Begitu nama santri dipilih, di atas daftar item muncul panel ringkas berisi
**seluruh kewajiban** santri tersebut — SPP tahun berjalan, SPP tiap tahun ajaran
sebelumnya, dan setiap item tagihan yang masih bersisa (uang pangkal, pembangunan,
dll) — beserta tombol **"✔️ Centang semua tunggakan"** untuk melunasi semuanya
sekaligus. Tunggakan item dari item yang sudah dinonaktifkan tetap ikut muncul
(ditandai badge *tunggakan lama*), termasuk untuk santri lulus/pindah/keluar.

## Detail Pembayaran (Tanggal, Metode, Penyetor)

Form **Input Pembayaran** mencatat detail tiap transaksi:

- **Tanggal & Jam** — default *Hari ini* (terkunci), atau pilih **Tanggal lain**
  untuk mencatat pembayaran mundur/berbeda. Jam bisa disesuaikan.
- **Metode** — **Tunai** atau **Transfer**.
- **Dibayar oleh** — nama pembayar / pengirim transfer (opsional).

Detail ini disimpan di tabel `transactions` & `kuitansi`, tampil di **kuitansi
cetak**, kolom Tanggal **Riwayat Kuitansi**, dan modal detail **Buku Induk**.
Tanggal yang dipilih (`tgl_bayar`) dipakai saat cetak-ulang, bukan waktu server.

**Migrasi database:** jalankan `supabase_migration_payment_meta.sql` (menambah
kolom `metode`, `dibayar_oleh`, `tgl_bayar` — aman, tidak menghapus data). Bila
belum dijalankan, aplikasi tetap berfungsi (detail pembayaran nonaktif otomatis).

## Deploy ke GitHub Pages

1. Push seluruh isi folder `sipay-merged/` ke repository GitHub Anda (langsung di root repo, bukan dalam subfolder).
2. Masuk ke **Settings → Pages** di repository tersebut.
3. Pada bagian *Source*, pilih branch `main` (atau `master`) dan folder `/ (root)`.
4. Klik **Save** — GitHub Pages akan otomatis meng-host `index.html` sebagai halaman utama.

```
Branch        : main
Folder        : / (root)
Build command : (none — file statis langsung)
URL hasil     : https://<username>.github.io/<repo-name>/
```

> **Catatan:** Tidak diperlukan file `_config.yml` karena tidak ada Jekyll. Jika ada masalah routing, tambahkan file kosong bernama `.nojekyll` di root repo.

## Keamanan (RLS + Supabase Auth) — Admin Only

Sejak versi ini, akses data ditegakkan **di sisi server** lewat Row Level Security,
dan aplikasi bersifat **admin-only** (mode wali/pengunjung telah dihapus):

| Peran | Hak akses |
|-------|-----------|
| Admin (Supabase Auth) | Akses penuh (baca, tulis, ubah, hapus) |
| Publik (anon) | **Tidak ada** — kecuali membaca branding layar login (nama madrasah, logo, item bayar) |

Login admin memakai **email + password terverifikasi Supabase Auth** — bukan lagi
cek di sisi klien. Password admin **tidak lagi disimpan** di database/localStorage.
Seluruh data santri tertutup dari publik.

> ⚙️ **Setup wajib sekali jalan:** jalankan `supabase_migration_auth.sql` di
> Supabase SQL Editor, lalu buat 1 akun admin di *Authentication → Users* dan
> **matikan pendaftaran publik**. Langkah lengkap ada di komentar file SQL tersebut.

## Status Koneksi Supabase

SiPay menggunakan **Supabase REST API** (bukan Realtime WebSocket). Artinya:

| Fitur | Status |
|-------|--------|
| Simpan/muat data (CRUD) | ✅ Berfungsi |
| Auto-refresh jika ada perubahan dari perangkat lain | ❌ Tidak otomatis |
| Indikator 🟢 Terhubung / 🔴 Offline | ✅ Berfungsi (dicek saat load) |

Data **tidak diperbarui otomatis secara realtime** — jika dua perangkat membuka SiPay bersamaan, perubahan dari satu perangkat tidak langsung terlihat di perangkat lain tanpa refresh manual. Untuk mengaktifkan realtime sejati, perlu mengintegrasikan Supabase Realtime (WebSocket) di masa mendatang.

## Urutan Load JS

File JS di-load secara berurutan (bukan ES modules). Urutan penting karena modul belakang bergantung pada variabel/fungsi dari modul sebelumnya:

1. `config.js` — harus pertama (state global, konstanta)
2. `database.js` — bergantung pada SB_URL, SB_KEY dari config
3. `tahun-ajaran.js` — bergantung pada database layer
4. `helpers.js` — utility & nav
5. Halaman-halaman (`dashboard`, `input`, `siswa`, dst.)
6. `auth.js`, `guest.js` — auth layer
7. `init.js` — harus terakhir (DOMContentLoaded)
