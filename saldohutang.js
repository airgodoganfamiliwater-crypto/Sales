
let shUIBound = false;
let shUnsub = null;
let shCustomers = [];
let shActiveTab = 'hutang';

window.SaldohutangView = {
  onEnter() {
    bindShUI();
    startShListener();
  },

  onLeave() {
    if (shUnsub) {
      shUnsub();
      shUnsub = null;
    }
  }
};

function bindShUI() {
  if (shUIBound) return;
  shUIBound = true;

  document.getElementById('shTabHutang').addEventListener('click', () => setShTab('hutang'));
  document.getElementById('shTabSaldo').addEventListener('click', () => setShTab('saldo'));
}

function setShTab(tab) {
  shActiveTab = tab;
  document.getElementById('shTabHutang').classList.toggle('active', tab === 'hutang');
  document.getElementById('shTabSaldo').classList.toggle('active', tab === 'saldo');
  renderShList();
}

function startShListener() {
  const user = firebase.auth().currentUser;
  if (!user) return;

  if (shUnsub) shUnsub();

  shUnsub = db.collection('customers')
    .where('pemilik', '==', user.uid)
    .onSnapshot((snapshot) => {
      shCustomers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderShList();
      renderShKpi();
    }, (error) => {
      console.error('Gagal memuat data saldo/hutang:', error);
      showAlert('Gagal memuat data.', 'error');
    });
}

function renderShKpi() {
  const totalHutang = shCustomers.reduce((sum, c) => sum + (c.hutang || 0), 0);
  const totalSaldo = shCustomers.reduce((sum, c) => sum + (c.saldo || 0), 0);

  document.getElementById('shKpiHutang').textContent = formatRupiah(totalHutang);
  document.getElementById('shKpiSaldo').textContent = formatRupiah(totalSaldo);
}

function renderShList() {
  const listEl = document.getElementById('shList');
  const field = shActiveTab; // 'hutang' or 'saldo'

  const filtered = shCustomers
    .filter((c) => (c[field] || 0) > 0)
    .sort((a, b) => (b[field] || 0) - (a[field] || 0));

  if (filtered.length === 0) {
    const label = field === 'hutang' ? 'hutang' : 'saldo';
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/>
          </svg>
        </div>
        <p class="empty-title">Belum ada data</p>
        <p class="empty-desc">Tidak ada customer dengan ${label} saat ini.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered.map((c) => {
    const initial = (c.namaPelanggan || '?').trim().charAt(0) || '?';
    const amount = c[field] || 0;
    const avatar = c.fotoPelanggan
      ? `<img class="customer-avatar customer-avatar-photo" src="${escapeAttr(c.fotoPelanggan)}" alt="">`
      : `<div class="customer-avatar">${escapeHTML(initial)}</div>`;

    return `
      <div class="customer-card">
        ${avatar}
        <div class="customer-info">
          <p class="customer-name">${escapeHTML(c.namaPelanggan || 'Tanpa nama')}</p>
          <p class="customer-meta">${escapeHTML(c.noTelepon || 'Tidak ada nomor')}</p>
        </div>
        <span class="sh-amount ${field}">${escapeHTML(formatRupiah(amount))}</span>
      </div>`;
  }).join('');
}