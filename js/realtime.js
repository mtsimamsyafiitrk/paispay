// ── SiPay · Realtime (Supabase WebSocket) ──
// ══════════════════════════════════════════
// Menyambung ke Supabase Realtime supaya perubahan dari device lain masuk
// SEKETIKA (biasanya < 1 detik), bukan menunggu polling berkala.
//
// Cara kerja: satu channel WebSocket mendengarkan perubahan (INSERT/UPDATE/
// DELETE) pada tabel students, tagihan, transactions, kuitansi, dan settings.
// Begitu ada perubahan, aplikasi menarik ulang data (di-debounce 400 ms supaya
// satu pembayaran yang menulis ke beberapa tabel hanya memicu satu tarikan).
//
// PENTING — dua syarat di sisi server:
//   1. Tabel harus masuk publication `supabase_realtime`.
//      Jalankan `supabase_migration_realtime.sql` sekali di SQL Editor.
//   2. RLS: kebijakan tabel adalah admin-only (`TO authenticated`), jadi
//      koneksi Realtime WAJIB memakai access_token admin — bukan anon key.
//      Tanpa token yang sah, event tidak akan terkirim sama sekali.
//
// Bila Realtime tidak tersedia (CDN diblokir, WebSocket ditutup jaringan
// sekolah, atau migrasi publication belum dijalankan), aplikasi TIDAK rusak:
// js/sync.js otomatis kembali ke polling 20 detik seperti biasa.
// ══════════════════════════════════════════

const RT_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
const RT_TABLES     = ['students', 'tagihan', 'transactions', 'kuitansi', 'settings'];
const RT_DEBOUNCE_MS = 400;    // gabungkan letupan event jadi satu tarikan data
const RT_RETRY_MS    = 15000;  // jeda coba-sambung-ulang saat channel gagal

let _rtClient   = null;
let _rtChannel  = null;
let _rtActive   = false;   // true = channel SUBSCRIBED & event mengalir
let _rtLoading  = null;    // promise pemuatan script CDN
let _rtDebounce = null;
let _rtRetry    = null;
let _rtWanted   = false;   // apakah realtime memang diminta menyala

function isRealtimeActive() { return _rtActive; }

// Muat pustaka Supabase dari CDN sekali saja.
function loadRealtimeLib() {
  if (window.supabase && window.supabase.createClient) return Promise.resolve(true);
  if (_rtLoading) return _rtLoading;
  _rtLoading = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = RT_SCRIPT_URL;
    s.async = true;
    s.onload  = () => resolve(!!(window.supabase && window.supabase.createClient));
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return _rtLoading;
}

function _setRealtimeStatus(active) {
  if (_rtActive === active) return;
  _rtActive = active;
  const gl = document.getElementById('gasLabel');
  if (gl && gl.textContent !== 'Offline') {
    gl.textContent = active ? 'Realtime' : 'Terhubung';
  }
  const btn = document.getElementById('syncNowBtn');
  if (btn) {
    btn.title = active
      ? 'Realtime aktif — perubahan dari device lain masuk seketika. Klik untuk tarik ulang manual.'
      : 'Ambil data terbaru dari server (semua device dibuat sama)';
  }
  // Polling jadi jaring pengaman yang lebih longgar saat realtime hidup.
  if (typeof rescheduleAutoSync === 'function') rescheduleAutoSync();
}

// Satu perubahan dari device lain → tarik ulang data (di-debounce).
function _onRealtimeChange() {
  clearTimeout(_rtDebounce);
  _rtDebounce = setTimeout(() => {
    // syncNow() menghormati penjagaan (modal terbuka / proses panjang berjalan).
    // Bila dilewati, penanda "dirty" membuatnya dicoba lagi sesaat kemudian —
    // jadi tidak ada perubahan yang terlewat.
    if (typeof syncNow === 'function') syncNow();
  }, RT_DEBOUNCE_MS);
}

// Perbarui token pada koneksi Realtime (dipanggil tiap kali sesi di-refresh).
function realtimeSetAuth() {
  if (!_rtClient || !_rtClient.realtime) return;
  const token = (typeof hasAdminSession === 'function' && hasAdminSession())
    ? sbSession.access_token : null;
  if (!token) return;
  try {
    const r = _rtClient.realtime.setAuth(token);
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch(e) { console.warn('realtimeSetAuth:', e.message); }
}

async function startRealtime() {
  _rtWanted = true;
  if (_rtChannel) return true;                       // sudah jalan
  if (typeof hasAdminSession !== 'function' || !hasAdminSession()) return false;

  const ok = await loadRealtimeLib();
  if (!ok) {
    console.warn('Realtime: pustaka Supabase gagal dimuat — tetap memakai polling berkala.');
    return false;
  }
  if (!_rtWanted) return false;                      // keburu logout saat memuat

  try {
    if (!_rtClient) {
      // persistSession/autoRefreshToken dimatikan: sesi admin dikelola sendiri
      // oleh config.js, jangan sampai pustaka ini ikut menulis localStorage.
      _rtClient = window.supabase.createClient(SB_URL, SB_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    }
    realtimeSetAuth();

    let ch = _rtClient.channel('sipay-db-changes');
    RT_TABLES.forEach(table => {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, _onRealtimeChange);
    });

    _rtChannel = ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        _setRealtimeStatus(true);
        clearTimeout(_rtRetry);
        // Tarik sekali saat tersambung untuk menutup celah antara halaman
        // dimuat dan channel siap — kecuali startAutoSync() baru saja menarik.
        const perlu = typeof syncedRecently !== 'function' || !syncedRecently();
        if (perlu && typeof syncNow === 'function') syncNow();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        _setRealtimeStatus(false);
        _scheduleRealtimeRetry();
      }
    });
    return true;
  } catch(e) {
    console.warn('startRealtime:', e.message);
    _setRealtimeStatus(false);
    _scheduleRealtimeRetry();
    return false;
  }
}

function _scheduleRealtimeRetry() {
  if (!_rtWanted) return;
  clearTimeout(_rtRetry);
  _rtRetry = setTimeout(() => {
    if (!_rtWanted) return;
    _teardownChannel();
    startRealtime();
  }, RT_RETRY_MS);
}

function _teardownChannel() {
  if (_rtChannel && _rtClient) {
    try { _rtClient.removeChannel(_rtChannel); } catch { /* best-effort */ }
  }
  _rtChannel = null;
}

function stopRealtime() {
  _rtWanted = false;
  clearTimeout(_rtRetry);
  clearTimeout(_rtDebounce);
  _teardownChannel();
  _setRealtimeStatus(false);
}
