// ===== Laporan view =====
let laporanUIBound = false;
let laporanUnsub = null;
let laporanEntries = [];
let laporanMode = 'bulan'; // 'bulan' | 'range'
let laporanSelectedMonth = new Date().getMonth();
let laporanSelectedYear = new Date().getFullYear();

const LAPORAN_BULAN_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

window.LaporanView = {
  onEnter() {
    bindLaporanUI();
    startLaporanListener();
  },

  onLeave() {
    if (laporanUnsub) {
      laporanUnsub();
      laporanUnsub = null;
    }
  }
};

function laporanDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function bindLaporanUI() {
  if (laporanUIBound) return;
  laporanUIBound = true;

  // Build the custom month picker sheet
  const bulanListEl = document.getElementById('laporanBulanList');
  bulanListEl.innerHTML = LAPORAN_BULAN_NAMES.map((name, idx) => `
    <button type="button" class="action-sheet-item" data-month="${idx}">${escapeHTML(name)}</button>
  `).join('');

  document.getElementById('laporanBulanBtnLabel').textContent = LAPORAN_BULAN_NAMES[laporanSelectedMonth];
  document.getElementById('laporanYearValue').textContent = laporanSelectedYear;
  updateLaporanBulanActiveState();

  const firstDay = new Date(laporanSelectedYear, laporanSelectedMonth, 1);
  const lastDay = new Date(laporanSelectedYear, laporanSelectedMonth + 1, 0);
  document.getElementById('laporanDateFrom').value = laporanDateStr(firstDay);
  document.getElementById('laporanDateTo').value = laporanDateStr(lastDay);

  document.getElementById('laporanTabBulan').addEventListener('click', () => setLaporanMode('bulan'));
  document.getElementById('laporanTabRange').addEventListener('click', () => setLaporanMode('range'));

  // Month picker sheet open/close/select
  document.getElementById('laporanBulanBtn').addEventListener('click', () => {
    document.getElementById('laporanBulanSheetOverlay').classList.add('open');
  });
  document.getElementById('laporanBulanSheetOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'laporanBulanSheetOverlay') {
      document.getElementById('laporanBulanSheetOverlay').classList.remove('open');
    }
  });
  bulanListEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-month]');
    if (!btn) return;
    laporanSelectedMonth = Number(btn.dataset.month);
    document.getElementById('laporanBulanBtnLabel').textContent = LAPORAN_BULAN_NAMES[laporanSelectedMonth];
    updateLaporanBulanActiveState();
    document.getElementById('laporanBulanSheetOverlay').classList.remove('open');
    renderLaporan();
  });

  // Year stepper
  document.getElementById('laporanYearMinus').addEventListener('click', () => {
    laporanSelectedYear -= 1;
    document.getElementById('laporanYearValue').textContent = laporanSelectedYear;
    renderLaporan();
  });
  document.getElementById('laporanYearPlus').addEventListener('click', () => {
    laporanSelectedYear += 1;
    document.getElementById('laporanYearValue').textContent = laporanSelectedYear;
    renderLaporan();
  });

  document.getElementById('laporanDateFrom').addEventListener('change', renderLaporan);
  document.getElementById('laporanDateTo').addEventListener('change', renderLaporan);
}

function updateLaporanBulanActiveState() {
  document.querySelectorAll('#laporanBulanList [data-month]').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.month) === laporanSelectedMonth);
  });
}

function setLaporanMode(mode) {
  laporanMode = mode;
  document.getElementById('laporanTabBulan').classList.toggle('active', mode === 'bulan');
  document.getElementById('laporanTabRange').classList.toggle('active', mode === 'range');
  document.getElementById('laporanBulanFilter').hidden = mode !== 'bulan';
  document.getElementById('laporanRangeFilter').hidden = mode !== 'range';
  renderLaporan();
}

function startLaporanListener() {
  const user = firebase.auth().currentUser;
  if (!user) return;

  if (laporanUnsub) laporanUnsub();

  laporanUnsub = db.collectionGroup('dataHarian')
    .where('createdBy', '==', user.uid)
    .onSnapshot((snapshot) => {
      laporanEntries = snapshot.docs.map((doc) => doc.data());
      renderLaporan();
    }, (error) => {
      console.error('Gagal memuat laporan:', error);
      showAlert('Gagal memuat data laporan.', 'error');
    });
}

function getLaporanRange() {
  if (laporanMode === 'bulan') {
    const first = new Date(laporanSelectedYear, laporanSelectedMonth, 1);
    const last = new Date(laporanSelectedYear, laporanSelectedMonth + 1, 0);
    return { from: laporanDateStr(first), to: laporanDateStr(last) };
  }
  return {
    from: document.getElementById('laporanDateFrom').value,
    to: document.getElementById('laporanDateTo').value
  };
}

function renderLaporan() {
  const { from, to } = getLaporanRange();
  if (!from || !to) return;

  const filtered = laporanEntries.filter((e) => e.tanggal >= from && e.tanggal <= to);

  const groups = {};
  filtered.forEach((e) => {
    if (!groups[e.tanggal]) {
      groups[e.tanggal] = { tanggal: e.tanggal, jumlahCustomer: 0, closing: 0, pembayaran: 0, keterangan: 0 };
    }
    const g = groups[e.tanggal];
    g.jumlahCustomer += 1;
    g.closing += e.pengisianGalon || 0;
    g.pembayaran += e.pembayaran || 0;
    g.keterangan += e.keterangan || 0;
  });

  const rows = Object.values(groups).sort((a, b) => b.tanggal.localeCompare(a.tanggal));

  renderLaporanKpi(rows);
  renderLaporanTable(rows);
}

function renderLaporanKpi(rows) {
  const totalHari = rows.length;
  const totalCustomer = rows.reduce((s, r) => s + r.jumlahCustomer, 0);
  const totalClosing = rows.reduce((s, r) => s + r.closing, 0);
  const totalPembayaran = rows.reduce((s, r) => s + r.pembayaran, 0);
  const totalKeterangan = rows.reduce((s, r) => s + r.keterangan, 0);

  document.getElementById('laporanKpiHari').textContent = totalHari.toLocaleString('id-ID');
  document.getElementById('laporanKpiCustomer').textContent = totalCustomer.toLocaleString('id-ID');
  document.getElementById('laporanKpiClosing').textContent = `${totalClosing.toLocaleString('id-ID')} galon`;
  document.getElementById('laporanKpiPembayaran').textContent = formatRupiah(totalPembayaran);
  document.getElementById('laporanKpiKeterangan').textContent = formatRupiah(totalKeterangan);
}

function renderLaporanTable(rows) {
  const tbody = document.getElementById('laporanTableBody');
  const emptyState = document.getElementById('laporanEmptyState');
  const tableWrap = document.getElementById('laporanTableWrap');

  if (rows.length === 0) {
    tableWrap.hidden = true;
    emptyState.hidden = false;
    return;
  }

  tableWrap.hidden = false;
  emptyState.hidden = true;

  tbody.innerHTML = rows.map((r) => {
    const ketClass = r.keterangan > 0 ? 'positive' : r.keterangan < 0 ? 'negative' : '';
    return `
      <tr>
        <td>${escapeHTML(formatLaporanDate(r.tanggal))}</td>
        <td>${r.jumlahCustomer}</td>
        <td>${r.closing.toLocaleString('id-ID')}</td>
        <td>${escapeHTML(formatRupiah(r.pembayaran))}</td>
        <td class="${ketClass}">${escapeHTML(formatRupiah(r.keterangan))}</td>
      </tr>`;
  }).join('');
}

function formatLaporanDate(tanggal) {
  const [y, m, d] = tanggal.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
}