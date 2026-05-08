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
│   ├── auth.js             # Login admin & reset password via OTP
│   ├── guest.js            # Mode tamu/orang tua wali
│   ├── emailjs.js          # EmailJS config, notifikasi email admin
│   ├── kuitansi.js         # Modal kuitansi, hapus, cetak, riwayat
│   ├── koreksi.js          # Alur koreksi pembayaran (multi-step)
│   ├── template-kuitansi.js# Builder & preview template kuitansi
│   ├── lapor.js            # Laporan wali & laporan masuk admin
│   └── init.js             # DOMContentLoaded & inisialisasi app
└── README.md
```

## Perubahan dari Versi Sebelumnya

| Sebelum | Sesudah |
|---------|---------|
| 1 file `index.html` (7.005 baris) | `index.html` (1.703 baris) + 21 JS module + 1 CSS |
| CSS inline di `<style>` | `css/main.css` (440 baris) |
| 2 blok `<script>` monolitik | 21 file JS modular |
| Sulit di-debug & di-maintain | Setiap modul punya tanggung jawab jelas |

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
