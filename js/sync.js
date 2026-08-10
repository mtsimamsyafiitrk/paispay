// ── SiPay · Auto-Sync Lintas Device ──
// ══════════════════════════════════════════
// Semua data (santri, tagihan, transaksi, kuitansi, settings) tersimpan di
// Supabase — satu sumber data untuk semua device. Masalahnya dulu data itu
// HANYA ditarik satu kali, yaitu saat halaman dibuka. Akibatnya tab di device B
// tetap menampilkan kondisi lama walau device A sudah menginput.
//
// Modul ini menjaga semua device berada pada kondisi data terakhir, dengan dua
// jalur yang saling melengkapi:
//
//   1. REALTIME (js/realtime.js) — jalur utama. Perubahan dari device lain
//      masuk seketika lewat WebSocket, lalu memanggil syncNow() di sini.
//   2. POLLING — jaring pengaman. Tetap berjalan walau realtime aktif, hanya
//      dengan jeda yang jauh lebih longgar (2 menit vs 20 detik). Ini yang
//      menyelamatkan keadaan ketika WebSocket diblokir jaringan sekolah,
//      publication `supabase_realtime` belum diaktifkan, atau koneksi putus
//      diam-diam tanpa event error.
//
// Ditambah pemicu langsung: tab kembali aktif, jendela di-fokus, koneksi pulih,
// dan tombol 🔄 di topbar.
//
// Sinkron sengaja DILEWATI saat ada modal terbuka atau saat proses panjang
// berjalan (import, promosi kelas — lihat pauseAutoSync/resumeAutoSync), supaya
// isian yang sedang dikerjakan tidak ter-render ulang di tengah jalan. Yang
// dilewati tidak hilang: penanda "dirty" membuatnya dicoba lagi tak lama
// kemudian.
// ══════════════════════════════════════════

const SYNC_INTERVAL_MS    = 20000;   // jeda polling saat realtime TIDAK aktif
const SYNC_INTERVAL_RT_MS = 120000;  // jeda polling saat realtime aktif (jaring pengaman)
const SYNC_DIRTY_RETRY_MS = 1200;    // coba lagi cepat bila sinkron tertunda
const SYNC_MIN_GAP_MS     = 1000;    // jarak minimum antar sinkron (anti-spam)

let _syncTimer   = null;
let _syncRunning = false;
let _syncPaused  = 0;      // penghitung: >0 berarti sinkron otomatis ditahan
let _syncDirty   = false;  // ada perubahan yang belum sempat ditarik
let _lastSyncAt  = 0;

// Tahan/lanjutkan sinkron otomatis. Dipakai mengapit proses panjang (import,
// promosi kelas) agar datanya tidak ditarik ulang di tengah proses.
function pauseAutoSync()  { _syncPaused++; }
function resumeAutoSync() {
  if (_syncPaused > 0) _syncPaused--;
  if (_syncPaused === 0 && _syncDirty) rescheduleAutoSync();
}

// Jalankan fn dengan sinkron otomatis ditahan (selalu dilepas walau fn gagal).
async function withSyncPaused(fn) {
  pauseAutoSync();
  try { return await fn(); }
  finally { resumeAutoSync(); }
}

// Tandai ada perubahan yang perlu ditarik — dipakai saat sinkron dilewati.
function markSyncDirty() { _syncDirty = true; }

// Baru saja tersinkron? Dipakai realtime.js agar tidak menarik ulang data yang
// sudah ditarik startAutoSync() beberapa ratus milidetik sebelumnya.
function syncedRecently(ms = 3000) { return Date.now() - _lastSyncAt < ms; }

function _anyModalOpen() {
  return !!document.querySelector('.modal-overlay.open');
}

function _canAutoSync() {
  if (_syncPaused > 0) return false;
  if (document.hidden) return false;
  if (navigator.onLine === false) return false;
  if (typeof isLoggedIn === 'function' && !isLoggedIn()) return false;
  if (_anyModalOpen()) return false;
  return true;
}

// Label status koneksi di topbar (dipakai juga oleh loadDataForTA).
function connStatusLabel() {
  return (typeof isRealtimeActive === 'function' && isRealtimeActive()) ? 'Realtime' : 'Terhubung';
}

// Tarik ulang data dari Supabase.
//   manual = true → abaikan seluruh penjagaan (dipakai tombol 🔄).
// Return true bila data berhasil diperbarui.
async function syncNow(manual = false) {
  // Setiap kali sinkron dilewati, tandai "tertunda" DAN jadwalkan ulang timer —
  // supaya _nextDelay() memakai jeda pendek dan perubahannya segera menyusul.
  const skip = () => { _syncDirty = true; rescheduleAutoSync(); return false; };
  if (_syncRunning) return skip();
  if (!manual && !_canAutoSync()) return skip();
  if (!manual && Date.now() - _lastSyncAt < SYNC_MIN_GAP_MS) return skip();

  _syncRunning = true;
  const btn = document.getElementById('syncNowBtn');
  if (btn) btn.classList.add('spinning');
  try {
    await loadDataForTA({ silent: !manual });
    _lastSyncAt = Date.now();
    _syncDirty  = false;
    return true;
  } catch(e) {
    console.warn('syncNow:', e.message);
    _syncDirty = true;   // gagal → coba lagi pada kesempatan berikutnya
    return false;
  } finally {
    _syncRunning = false;
    if (btn) btn.classList.remove('spinning');
    rescheduleAutoSync();
  }
}

// Dipanggil tombol 🔄 di topbar.
async function manualSync() {
  const ok = await syncNow(true);
  if (typeof toast === 'function') {
    toast(ok ? '🔄 Data disinkronkan dari server' : '⚠️ Gagal menyinkronkan — cek koneksi');
  }
}

// Jeda tik berikutnya: cepat bila ada perubahan tertunda, longgar bila realtime
// sedang aktif (polling cuma jadi jaring pengaman).
function _nextDelay() {
  if (_syncDirty) return SYNC_DIRTY_RETRY_MS;
  return (typeof isRealtimeActive === 'function' && isRealtimeActive())
    ? SYNC_INTERVAL_RT_MS : SYNC_INTERVAL_MS;
}

// Timer menjadwal ulang dirinya sendiri supaya jedanya bisa berubah mengikuti
// status realtime / penanda dirty.
function rescheduleAutoSync() {
  if (!_syncStarted) return;   // belum dinyalakan / sudah dihentikan
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    _syncTimer = null;
    await syncNow();
    if (_syncStarted && !_syncTimer) rescheduleAutoSync();
  }, _nextDelay());
}

let _syncStarted = false;
function startAutoSync() {
  _syncStarted = true;
  clearTimeout(_syncTimer);
  _syncTimer = null;
  rescheduleAutoSync();
  syncNow();
  // Realtime dinyalakan setelahnya; kalau gagal, polling di atas tetap jalan.
  if (typeof startRealtime === 'function') startRealtime();
}

function stopAutoSync() {
  _syncStarted = false;
  clearTimeout(_syncTimer);
  _syncTimer = null;
  if (typeof stopRealtime === 'function') stopRealtime();
}

// Pemicu tambahan: tab kembali terlihat, jendela di-fokus, koneksi pulih.
// Ini yang membuat "buka lagi di device B" langsung menampilkan data terakhir
// tanpa perlu reload halaman — juga saat realtime kebetulan sedang putus.
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
window.addEventListener('focus',  () => { syncNow(); });
window.addEventListener('online', () => { syncNow(); });
