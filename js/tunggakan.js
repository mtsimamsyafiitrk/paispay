// ── SiPay · Halaman Tunggakan ──
let editingItemIdx = -1;

function renderItemList() {
  const cont = document.getElementById('itemList');
  const KELAS_ALL = ['7','8','9','calon'];
  const kelasLabel = k => k === 'calon' ? 'Kls Calon' : 'Kelas ' + k;
  cont.innerHTML = appState.payItems.map((item,idx) => {
    const typeLabel = item.type==='bulanan'?'Bulanan (SPP)':item.type==='custom'?'Custom':'Tetap';
    const isDefault = idx < 6;
    const itemKelas = item.kelas || [];

    if (editingItemIdx === idx) {
      return `<div style="background:var(--primary-pale);border-radius:12px;padding:14px;margin-bottom:8px;border:1.5px solid var(--primary-light);">
        <div style="font-size:11px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">✏️ Edit Item #${idx+1}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group">
            <label>Nama Item</label>
            <input type="text" id="ei_name" value="${item.name}">
          </div>
          <div class="form-group">
            <label>Nominal Default (Rp)</label>
            <input type="number" id="ei_amount" value="${item.amount||0}">
          </div>
          <div class="form-group">
            <label>Jenis</label>
            <select id="ei_type">
              <option value="tetap" ${item.type==='tetap'?'selected':''}>Tetap per Siswa</option>
              <option value="custom" ${item.type==='custom'?'selected':''}>Nominal Custom</option>
              <option value="bulanan" ${item.type==='bulanan'?'selected':''}>Bulanan (SPP)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Aktif untuk Kelas</label>
            <div style="display:flex;gap:10px;margin-top:6px;">
              ${KELAS_ALL.map(k => `<label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:500;cursor:pointer;">
                <input type="checkbox" id="ei_kelas_${k}" value="${k}" ${(item.kelas||[]).includes(k)?'checked':''} style="accent-color:var(--primary);width:15px;height:15px;">
                ${kelasLabel(k)}
              </label>`).join('')}
            </div>
          </div>
          <div class="form-group" style="justify-content:flex-end;flex-direction:row;align-items:flex-end;gap:8px;grid-column:1/-1;">
            <button class="btn btn-primary btn-sm" onclick="saveEditItem(${idx})">💾 Simpan</button>
            <button class="btn btn-outline btn-sm" onclick="cancelEditItem()">Batal</button>
          </div>
        </div>
      </div>`;
    }

    // Badge kelas
    const _klsLabel = k => k === 'calon' ? 'Kls Calon' : 'Kls ' + k;
    const kelasBadge = itemKelas.length
      ? itemKelas.map(k => `<span style="background:${k==='calon'?'var(--accent-pale)':'var(--primary-pale)'};color:${k==='calon'?'var(--accent)':'var(--primary)'};border-radius:5px;padding:1px 7px;font-size:11px;font-weight:700;">${_klsLabel(k)}</span>`).join(' ')
      : `<span style="background:#fee2e2;color:#dc2626;border-radius:5px;padding:1px 7px;font-size:11px;font-weight:700;">Tidak ada kelas</span>`;

    return `<div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);">
      <label class="toggle"><input type="checkbox" ${item.active?'checked':''} onchange="toggleItem(${idx})"><span class="toggle-slider"></span></label>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:13.5px;">${item.name}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${typeLabel} • ${rp(item.amount)}${isDefault?' • <span style="color:var(--accent);">Default</span>':''}</div>
        <div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap;">${kelasBadge}</div>
      </div>
      <span class="badge ${item.active?'badge-green':'badge-gray'}" style="white-space:nowrap;">${item.active?'Aktif':'Nonaktif'}</span>
      <button class="btn btn-outline btn-sm" onclick="startEditItem(${idx})" title="Edit item">✏️</button>
      <button class="btn btn-danger btn-sm" onclick="confirmRemoveItem(${idx})" title="Hapus item">🗑️</button>
    </div>`;
  }).join('');
}

function startEditItem(idx) { editingItemIdx = idx; renderItemList(); }
function cancelEditItem() { editingItemIdx = -1; renderItemList(); }
function saveEditItem(idx) {
  const name = document.getElementById('ei_name').value.trim();
  if (!name) { toast('⚠️ Nama item tidak boleh kosong!'); return; }
  const kelas = ['7','8','9','calon'].filter(k => document.getElementById('ei_kelas_'+k)?.checked);
  if (!kelas.length) { toast('⚠️ Pilih minimal 1 kelas!'); return; }
  appState.payItems[idx].name   = name;
  appState.payItems[idx].amount = Number(document.getElementById('ei_amount').value)||0;
  appState.payItems[idx].type   = document.getElementById('ei_type').value;
  appState.payItems[idx].kelas  = kelas;
  editingItemIdx = -1;
  saveSettings(); renderItemList();
  toast('✅ Item berhasil diperbarui!');
}

function toggleItem(idx) {
  appState.payItems[idx].active = !appState.payItems[idx].active;
  saveSettings(); renderItemList();
  toast(appState.payItems[idx].active ? '✅ Item diaktifkan' : '⭕ Item dinonaktifkan');
}
function confirmRemoveItem(idx) {
  const name = appState.payItems[idx].name;
  document.getElementById('deleteMsg').textContent = 'Hapus item pembayaran "' + name + '"? Item ini tidak akan tersedia lagi di form input.';
  document.getElementById('deleteConfirmBtn').onclick = function() {
    appState.payItems.splice(idx,1);
    if (editingItemIdx === idx) editingItemIdx = -1;
    saveSettings();
    document.getElementById('deleteModal').classList.remove('open');
    renderItemList();
    toast('🗑️ Item "' + name + '" dihapus');
  };
  document.getElementById('deleteModal').classList.add('open');
}
function addItem() {
  const name = document.getElementById('newItemName').value.trim();
  const amount = Number(document.getElementById('newItemAmount').value)||0;
  const type = document.getElementById('newItemType').value;
  const kelas = ['7','8','9','calon'].filter(k => document.getElementById('newItemKelas'+k)?.checked);
  if (!name) { toast('⚠️ Nama item tidak boleh kosong!'); return; }
  if (!kelas.length) { toast('⚠️ Pilih minimal 1 kelas!'); return; }
  appState.payItems.push({ id: 'custom_'+Date.now(), name, amount, type, active: true, kelas });
  saveSettings(); renderItemList();
  document.getElementById('newItemName').value='';
  document.getElementById('newItemAmount').value='';
  ['7','8','9'].forEach(k => { const el = document.getElementById('newItemKelas'+k); if(el) el.checked = true; });
  const elCalon = document.getElementById('newItemKelasCalon'); if(elCalon) elCalon.checked = false;
  toast('✅ Item berhasil ditambahkan!');
}

// ── DETAIL MODAL ──
