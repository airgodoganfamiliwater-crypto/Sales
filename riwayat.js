
let riwayatUIBound = false;
let riwayatUnsub = null;
let riwayatEntries = [];
let riwayatCustomersUnsub = null;
let riwayatCustomers = [];

window.RiwayatView = {
  onEnter() {
    bindRiwayatUI();
    startRiwayatListener();
    startRiwayatCustomersListener();
  },

  onLeave() {
    if (riwayatUnsub) {
      riwayatUnsub();
      riwayatUnsub = null;
    }
    if (riwayatCustomersUnsub) {
      riwayatCustomersUnsub();
      riwayatCustomersUnsub = null;
    }
  }
};

function bindRiwayatUI() {
  if (riwayatUIBound) return;
  riwayatUIBound = true;

  const dateFilter = document.getElementById('riwayatDateFilter');
  dateFilter.value = todayDateString();
  dateFilter.addEventListener('change', () => {
    renderRiwayatList(riwayatEntries);
    renderRiwayatKpi();
  });

  document.getElementById('riwayatSearch').addEventListener('input', () => {
    renderRiwayatList(riwayatEntries);
  });
}

function getSelectedRiwayatDate() {
  const dateFilter = document.getElementById('riwayatDateFilter');
  return dateFilter.value || todayDateString();
}

function startRiwayatListener() {
  const user = firebase.auth().currentUser;
  if (!user) return;

  if (riwayatUnsub) riwayatUnsub();

  riwayatUnsub = db.collectionGroup('dataHarian')
    .where('createdBy', '==', user.uid)
    .onSnapshot((snapshot) => {
      riwayatEntries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      // Sort di client (bukan orderBy di query) biar gak butuh composite index.
      riwayatEntries.sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
      renderRiwayatList(riwayatEntries);
      renderRiwayatKpi();
    }, (error) => {
      console.error('Gagal memuat riwayat:', error);
      showAlert('Gagal memuat riwayat.', 'error');
    });
}

function startRiwayatCustomersListener() {
  const user = firebase.auth().currentUser;
  if (!user) return;

  if (riwayatCustomersUnsub) riwayatCustomersUnsub();

  riwayatCustomersUnsub = db.collection('customers')
    .where('pemilik', '==', user.uid)
    .onSnapshot((snapshot) => {
      riwayatCustomers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderRiwayatKpi();
    }, (error) => {
      console.error('Gagal memuat data pelanggan untuk KPI:', error);
    });
}

function renderRiwayatKpi() {
  const selectedDate = getSelectedRiwayatDate();
  const entriesForDate = riwayatEntries.filter((e) => e.tanggal === selectedDate);

  const customerCount = riwayatCustomers.length;
  const totalSaldo = riwayatCustomers.reduce((sum, c) => sum + (c.saldo || 0), 0);
  const totalHutang = riwayatCustomers.reduce((sum, c) => sum + (c.hutang || 0), 0);

  const totalGalon = entriesForDate.reduce((sum, e) => sum + (e.pengisianGalon || 0), 0);
  const totalPembayaran = entriesForDate.reduce((sum, e) => sum + (e.pembayaran || 0), 0);

  document.getElementById('kpiCustomerCount').textContent = customerCount.toLocaleString('id-ID');
  document.getElementById('kpiGalon').textContent = `${totalGalon.toLocaleString('id-ID')} galon`;
  document.getElementById('kpiPembayaran').textContent = formatRupiah(totalPembayaran);
  document.getElementById('kpiHutang').textContent = formatRupiah(totalHutang);
  document.getElementById('kpiSaldo').textContent = formatRupiah(totalSaldo);
}

function renderRiwayatList(entries) {
  const listEl = document.getElementById('riwayatList');
  const query = (document.getElementById('riwayatSearch').value || '').trim().toLowerCase();
  const selectedDate = getSelectedRiwayatDate();

  const forDate = entries.filter((e) => e.tanggal === selectedDate);
  const filtered = query
    ? forDate.filter((e) => (e.namaCustomer || '').toLowerCase().includes(query))
    : forDate;

  if (filtered.length === 0) {
    listEl.innerHTML = forDate.length === 0
      ? riwayatEmptyHTML('Belum ada riwayat', 'Belum ada data untuk tanggal ini.')
      : riwayatEmptyHTML('Tidak ditemukan', 'Coba kata kunci pencarian lain.');
    return;
  }

  const groups = [];
  let currentDate = null;
  let currentGroup = null;

  filtered.forEach((entry) => {
    if (entry.tanggal !== currentDate) {
      currentDate = entry.tanggal;
      currentGroup = { tanggal: entry.tanggal, items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push(entry);
  });

  listEl.innerHTML = groups.map((g) => `
    <div class="riwayat-date-group">
      <p class="riwayat-date-label">${escapeHTML(formatTanggalIndo(g.tanggal))}</p>
      ${g.items.map(riwayatEntryHTML).join('')}
    </div>
  `).join('');
}

function riwayatEmptyHTML(title, desc) {
  return `
    <div class="empty-state">
      <div class="empty-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 3v5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3.05 13a9 9 0 1 0 2.13-6.36L3 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <p class="empty-title">${escapeHTML(title)}</p>
      <p class="empty-desc">${escapeHTML(desc)}</p>
    </div>`;
}

function riwayatEntryHTML(entry) {
  const galon = entry.pengisianGalon || 0;
  const pembayaran = entry.pembayaran || 0;
  const keterangan = entry.keterangan || 0;

  const ketClass = keterangan > 0 ? 'positive' : keterangan < 0 ? 'negative' : 'neutral';
  const ketLabel = keterangan === 0 ? 'Lunas' : (keterangan > 0 ? '+' : '') + formatRupiah(keterangan);

  return `
    <div class="riwayat-entry">
      <div class="riwayat-entry-main">
        <p class="riwayat-entry-name">${escapeHTML(entry.namaCustomer || 'Tanpa nama')}</p>
        <p class="riwayat-entry-meta">${galon} galon &middot; ${escapeHTML(formatRupiah(pembayaran))} dibayar</p>
      </div>
      <span class="riwayat-entry-keterangan ${ketClass}">${escapeHTML(ketLabel)}</span>
    </div>`;
}

function formatTanggalIndo(tanggal) {
  if (!tanggal) return '-';
  const [y, m, d] = tanggal.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}