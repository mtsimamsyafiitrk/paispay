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
│   ├── realtime.js         # Langganan Supabase Realtime (WebSocket)
│   ├── sync.js             # Auto-sync lintas device (polling + on-focus)
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

## Tunggakan SPP Tahun Berjalan (dihitung s/d bulan aktif)

Tunggakan SPP tahun ajaran berjalan dihitung **berjalan**, bukan langsung satu
tahun penuh: yang dianggap menunggak hanya bulan yang **sudah tiba**, yaitu dari
Juli (awal tahun ajaran) sampai **bulan aktif saat ini**. Bulan yang belum tiba
tidak menambah tunggakan.

> Contoh: TA 2025/2026, hari ini Oktober 2025, santri belum bayar sama sekali →
> tunggakan = **4 bulan** (Jul–Okt), bukan 12 bulan.

- Awal tahun ajaran diambil dari **Profil Madrasah → Tahun Ajaran** (mis.
  `2025/2026` → mulai Juli 2025). Bila profil kosong/tidak terbaca, tahun ajaran
  disimpulkan dari tanggal hari ini (Juli sebagai awal tahun).
- Bila tanggal hari ini sudah **melewati** tahun ajaran di profil, seluruh 12
  bulan dihitung jatuh tempo (perilaku lama) — jadi tunggakan tahun yang sudah
  selesai tetap utuh sampai promosi kelas dijalankan.
- **Bayar di muka tetap bisa.** Di form Input Pembayaran, bulan dipisah menjadi
  dua kelompok: *Tunggakan* (jatuh tempo, chip merah) dan *Bayar di muka* (belum
  jatuh tempo, chip abu-abu). Tombol **"✔️ Centang semua tunggakan"** hanya
  mencentang bulan yang sudah jatuh tempo.
- Penanda status bulan di tabel santri, detail santri, dan modal detail: hijau =
  lunas, merah = menunggak (jatuh tempo), abu-abu/garis putus-putus = belum jatuh
  tempo.
- **Surat tagihan** ikut menyesuaikan: kolom tagihan/terbayar SPP dihitung
  sebatas bulan yang sudah jatuh tempo, dan bulan yang dibayar di muka
  dicantumkan terpisah pada keterangan.

Fungsi terkait ada di `js/helpers.js`: `sppDueMonths()`, `isSppDue()`,
`sppUnpaidDueMonths()`, `sppUpcomingMonths()`, `sppDueMonthLabel()`.

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

## Sinkronisasi Multi-Device

SiPay memakai Supabase sebagai satu-satunya sumber data — semua device (HP
bendahara, laptop TU, komputer kantor) membaca dan menulis ke database yang
sama. Yang dulu bermasalah adalah **kapan** data itu ditarik ulang: data hanya
dimuat **satu kali saat halaman dibuka**, sehingga tab yang dibiarkan terbuka
di device B tetap menampilkan kondisi lama walau device A sudah menginput — dan
penyimpanan berikutnya dari device B bisa **menimpa** hasil input device A.

Sekarang ada dua lapis pengaman.

### 1. Realtime (WebSocket) + polling sebagai jaring pengaman

**Jalur utama — `js/realtime.js`.** Satu channel Supabase Realtime mendengarkan
perubahan pada tabel `students`, `tagihan`, `transactions`, `kuitansi`, dan
`settings`. Begitu ada perubahan dari device mana pun, device lain menarik
ulang data — dalam pengujian **±0,4 detik**, tanpa refresh halaman.

> ⚠️ **Wajib dijalankan sekali:** `supabase_migration_realtime.sql` di Supabase
> Dashboard → SQL Editor. Tanpa itu tabel belum terdaftar di publication
> `supabase_realtime` dan tidak ada event yang mengalir. Ulangi juga setiap
> kali `supabase_migration.sql` (reset penuh) dijalankan.

Cek berhasil atau tidak lewat indikator di kanan atas:

| Tampilan | Artinya |
|----------|---------|
| 🟢 **Realtime** | WebSocket aktif — perubahan masuk seketika |
| 🟢 **Terhubung** | Realtime tidak tersedia — memakai polling berkala |
| 🔴 **Offline** | Server tidak terjangkau |

**Jalur cadangan — `js/sync.js`.** Polling tetap berjalan sebagai jaring
pengaman, hanya jedanya menyesuaikan:

| Kondisi | Jeda polling |
|---------|--------------|
| Realtime aktif | 2 menit |
| Realtime tidak aktif | 20 detik |
| Ada perubahan tertunda | 1,2 detik |

Ditambah pemicu langsung: tab kembali aktif (`visibilitychange`), jendela
di-fokus, koneksi pulih (`online`), tombol 🔄 di topbar, dan saat santri
dipilih di Input Pembayaran (`refreshStudent`).

Aplikasi **tidak rusak** bila Realtime gagal: CDN diblokir, WebSocket ditutup
jaringan sekolah, atau migrasi publication belum dijalankan — semuanya otomatis
jatuh kembali ke polling 20 detik.

**Yang dilewati tidak hilang.** Sinkron sengaja ditahan saat ada modal terbuka
atau saat proses panjang berjalan (import, promosi kelas —
`pauseAutoSync()` / `resumeAutoSync()`), dan form Input Pembayaran tidak
digambar ulang bila sudah ada centangnya. Setiap sinkron yang dilewati ditandai
"tertunda" dan otomatis dicoba lagi 1,2 detik kemudian. Bila data santri yang
sedang dikerjakan berubah di server, muncul peringatan
`🔄 Data santri ini berubah di device lain` alih-alih menghapus isian.

**Keamanan.** Realtime tunduk pada RLS yang sama (admin-only, `TO
authenticated`), jadi koneksi WebSocket memakai **access token admin**, bukan
anon key — hanya sesi admin yang login yang menerima event. Pustaka Supabase
dimuat dengan `persistSession: false` agar tidak mengganggu sesi yang dikelola
`config.js`; token diperbarui otomatis tiap kali sesi di-refresh.

### 2. Tulis-gabung (merge), bukan tulis-timpa

Penulisan tidak lagi mengirim hasil hitungan dari salinan lokal (yang bisa
usang), melainkan **membaca kondisi terbaru di server lalu menambahkan selisih**:

| Operasi | Fungsi | Cara kerja |
|---------|--------|------------|
| Bayar SPP | `commitSppPayment()` | gabungkan (union) bulan yang sudah lunas di server dengan bulan baru |
| Bayar item tetap | `addTagihanPaid(id, delta)` | `paid_amount` server **+ selisih**, bukan angka lokal |
| Hapus kuitansi / koreksi | `adjustSppPaidMonths()` | tambah/hapus bulan tertentu di atas kondisi server |
| Import, promosi kelas, ubah status massal | `saveStudentsBatch(touched)` | kirim **hanya santri yang disentuh**, bukan seluruh tabel |
| Profil / akun / logo | `saveSettings()` | tidak dikirim bila settings server belum sempat terbaca (cegah menimpa dengan nilai kosong) |

> `saveState()` (kirim seluruh `appState.students`) sengaja **tidak dipakai lagi**
> oleh alur mana pun karena berpotensi menimpa perubahan device lain.

**Efek nyata:** dua orang bisa menginput bersamaan di device berbeda. Bila
device A melunasi SPP September dan device B (yang datanya masih lama)
melunasi Oktober, hasil akhirnya **Sep + Okt keduanya tersimpan** — bukan yang
satu menghapus yang lain.

### Yang masih perlu diketahui

- Bila dua orang membayar **item yang sama** untuk santri yang sama dalam
  hitungan detik yang bersamaan, keduanya tetap tercatat sebagai dua kuitansi.
  Yang dicegah adalah **data hilang**, bukan input ganda yang disengaja.
- Indikator status dan jam "Tersinkron HH:MM" di topbar ikut diperbarui tiap
  kali sinkron berhasil.
- Realtime butuh WebSocket keluar ke `*.supabase.co`. Bila jaringan sekolah
  memblokirnya, indikator tetap "Terhubung" dan aplikasi memakai polling —
  datanya tetap benar, hanya tidak seketika.

## Urutan Load JS

File JS di-load secara berurutan (bukan ES modules). Urutan penting karena modul belakang bergantung pada variabel/fungsi dari modul sebelumnya:

1. `config.js` — harus pertama (state global, konstanta)
2. `database.js` — bergantung pada SB_URL, SB_KEY dari config
3. `tahun-ajaran.js` — bergantung pada database layer
4. `helpers.js` — utility & nav
5. Halaman-halaman (`dashboard`, `input`, `siswa`, dst.)
6. `auth.js`, `guest.js` — auth layer
7. `realtime.js` — langganan WebSocket (butuh `SB_URL`, `SB_KEY`, `sbSession`)
8. `sync.js` — auto-sync lintas device (butuh `loadDataForTA`, `isLoggedIn`, `isRealtimeActive`)
9. `init.js` — harus terakhir (DOMContentLoaded)
