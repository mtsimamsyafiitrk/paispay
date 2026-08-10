// ── SiPay · Auto-Sync Lintas Device ──
// ══════════════════════════════════════════
// Semua data (santri, tagihan, transaksi, kuitansi, settings) sudah tersimpan
// di Supabase — jadi memang satu sumber data untuk semua device. Masalahnya,
// sebelumnya data itu HANYA ditarik satu kali, yaitu saat halaman dibuka.
// Akibatnya bila tab di device B dibiarkan terbuka, layarnya tetap menampilkan
// kondisi lama walau device A sudah menginput — dan penyimpanan berikutnya dari
// device B bisa menimpa data device A.
//
// Modul ini menjaga semua device selalu berada pada kondisi data terakhir:
//   • polling berkala selama tab terlihat (default 20 detik)
//   • tarik ulang saat tab kembali aktif / jendela di-fokus / koneksi pulih
//   • tombol 🔄 di topbar untuk sinkron manual
//
// Sinkron latar belakang sengaja DILEWATI saat ada modal terbuka atau saat
// proses panjang (import, promosi kelas, wizard) sedang berjalan, supaya isian
// yang sedang dikerjakan tidak ter-render ulang di tengah jalan.
// ══════════════════════════════════════════

const SYNC_INTERVAL_MS = 20000;  // jeda polling saat tab aktif
const SYNC_MIN_GAP_MS  = 5000;   // jarak minimum antar sinkron (anti-spam)

let _syncTimer   = null;
let _syncRunning = false;
let _syncPaused  = 0;     // penghitung: >0 berarti sinkron otomatis ditahan
let _lastSyncAt  = 0;

// Tahan/ lanjutkan sinkron otomatis. Dipakai mengapit proses panjang
// (import, promosi kelas) agar datanya tidak ditarik ulang di tengah proses.
function pauseAutoSync()  { _syncPaused++; }
function resumeAutoSync() { if (_syncPaused > 0) _syncPaused--; }

// Jalankan fn dengan sinkron otomatis ditahan (selalu dilepas walau fn gagal).
async function withSyncPaused(fn) {
  pauseAutoSync();
  try { return await fn(); }
  finally { resumeAutoSync(); }
}

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

// Tarik ulang data dari Supabase.
//   force = true → abaikan penjagaan di atas (dipakai tombol 🔄 manual).
// Return true bila data berhasil diperbarui.
async function syncNow(force = false) {
  if (_syncRunning) return false;
  if (!force && !_canAutoSync()) return false;
  if (!force && Date.now() - _lastSyncAt < SYNC_MIN_GAP_MS) return false;

  _syncRunning = true;
  const btn = document.getElementById('syncNowBtn');
  if (btn) btn.classList.add('spinning');
  try {
    await loadDataForTA({ silent: !force });
    _lastSyncAt = Date.now();
    return true;
  } catch(e) {
    console.warn('syncNow:', e.message);
    return false;
  } finally {
    _syncRunning = false;
    if (btn) btn.classList.remove('spinning');
  }
}

// Dipanggil tombol 🔄 di topbar.
async function manualSync() {
  const ok = await syncNow(true);
  if (typeof toast === 'function') {
    toast(ok ? '🔄 Data disinkronkan dari server' : '⚠️ Gagal menyinkronkan — cek koneksi');
  }
}

function startAutoSync() {
  stopAutoSync();
  _syncTimer = setInterval(() => { syncNow(); }, SYNC_INTERVAL_MS);
  syncNow();
}

function stopAutoSync() {
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
}

// Pemicu tambahan: tab kembali terlihat, jendela di-fokus, koneksi pulih.
// Ini yang membuat "buka lagi di device B" langsung menampilkan data terakhir
// tanpa perlu reload halaman.
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
window.addEventListener('focus',  () => { syncNow(); });
window.addEventListener('online', () => { syncNow(); });
