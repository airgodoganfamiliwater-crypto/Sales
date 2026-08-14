// ===== Input view =====
// Form pendataan harian: pilih pelanggan (autocomplete dari daftar milik
// sales ini sendiri), hitung tagihan/keterangan, dan simpan ke
// customers/{id}/dataHarian/{tanggal} — satu dokumen per customer per hari.
// Kalau hari ini sudah ada entri, form di-load dari situ dan submit
// berikutnya akan meng-update (bukan bikin dokumen baru).

let inputUIBound = false;
let inputCustomers = [];
let inputCustomersUnsub = null;
let inputSelectedCustomer = null;
let inputMyIdCabangCache = null;

// Snapshot saldo/hutang di AWAL hari (sebelum entri hari ini) — dipakai buat
// kalkulasi, supaya edit ke-2 di hari yang sama gak double-count.
let inputHutangAwal = 0;
let inputSaldoAwal = 0;
let inputTodayDocExists = false;

window.InputView = {
  onEnter() {
    bindInputUI();
    startInputCustomerListener();
  },

  onLeave() {
    if (inputCustomersUnsub) {
      inputCustomersUnsub();
      inputCustomersUnsub = null;
    }
  }
};

function bindInputUI() {
  if (inputUIBound) return;
  inputUIBound = true;

  const namaEl = document.getElementById('inputNama');
  const suggestionsEl = document.getElementById('inputNamaSuggestions');
  const galonEl = document.getElementById('inputGalon');
  const pembayaranEl = document.getElementById('inputPembayaran');
  const toggleEl = document.getElementById('useSaldoToggle');

  namaEl.addEventListener('input', () => {
    // Typed value no longer matches the picked customer — force re-pick
    if (inputSelectedCustomer && namaEl.value !== inputSelectedCustomer.namaPelanggan) {
      deselectInputCustomer();
    }
    renderInputSuggestions(filterInputCustomers(namaEl.value));
  });

  namaEl.addEventListener('focus', () => {
    if (namaEl.value.trim()) renderInputSuggestions(filterInputCustomers(namaEl.value));
  });

  namaEl.addEventListener('blur', () => {
    setTimeout(() => { suggestionsEl.hidden = true; }, 120);
  });

  // Prevent the input from blurring before the tap on a suggestion registers
  suggestionsEl.addEventListener('mousedown', (e) => e.preventDefault());
  suggestionsEl.addEventListener('click', (e) => {
    const item = e.target.closest('.autocomplete-item');
    if (!item) return;
    const customer = inputCustomers.find((c) => c.id === item.dataset.id);
    if (customer) selectInputCustomer(customer);
  });

  galonEl.addEventListener('input', recalcInput);
  pembayaranEl.addEventListener('input', recalcInput);
  toggleEl.addEventListener('change', recalcInput);

  document.getElementById('inputForm').addEventListener('submit', handleInputSubmit);
}

/* ================= Customer list (for autocomplete) ================= */

function startInputCustomerListener() {
  const user = firebase.auth().currentUser;
  if (!user) return;

  if (inputCustomersUnsub) inputCustomersUnsub();

  inputCustomersUnsub = db.collection('customers')
    .where('pemilik', '==', user.uid)
    .onSnapshot((snapshot) => {
      inputCustomers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }, () => {
      showAlert('Gagal memuat daftar pelanggan.', 'error');
    });
}

function filterInputCustomers(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  return inputCustomers.filter((c) => (c.namaPelanggan || '').toLowerCase().includes(q));
}

function renderInputSuggestions(list) {
  const box = document.getElementById('inputNamaSuggestions');

  if (list.length === 0) {
    box.innerHTML = `<div class="autocomplete-empty">Tidak ada pelanggan cocok</div>`;
  } else {
    box.innerHTML = list.slice(0, 8).map((c) => `
      <div class="autocomplete-item" data-id="${c.id}">${escapeHTML(c.namaPelanggan || 'Tanpa nama')}</div>
    `).join('');
  }

  box.hidden = false;
}

/* ================= Selecting a customer ================= */

async function selectInputCustomer(customer) {
  inputSelectedCustomer = customer;

  document.getElementById('inputNama').value = customer.namaPelanggan || '';
  document.getElementById('inputNamaSuggestions').hidden = true;
  document.getElementById('customerInfoCard').hidden = false;

  // Default: belum ada entri hari ini, saldo/hutang awal = kondisi customer saat ini
  inputTodayDocExists = false;
  inputHutangAwal = customer.hutang || 0;
  inputSaldoAwal = customer.saldo || 0;
  document.getElementById('inputGalon').value = '';
  document.getElementById('inputPembayaran').value = '';
  document.getElementById('useSaldoToggle').checked = false;
  document.getElementById('todayEntryBadge').hidden = true;

  try {
    const todayId = todayDateString();
    const snap = await db.collection('customers').doc(customer.id)
      .collection('dataHarian').doc(todayId).get();

    if (snap.exists) {
      const data = snap.data();
      inputTodayDocExists = true;
      inputHutangAwal = data.hutangAwal ?? (customer.hutang || 0);
      inputSaldoAwal = data.saldoAwal ?? (customer.saldo || 0);

      document.getElementById('inputGalon').value = data.pengisianGalon || '';
      document.getElementById('inputPembayaran').value = data.pembayaran || '';
      document.getElementById('useSaldoToggle').checked = !!data.gunakanSaldo;
      document.getElementById('todayEntryBadge').hidden = false;
    }
  } catch (error) {
    console.error('Gagal memeriksa entri hari ini:', error);
  }

  renderCustomerInfoCard();
  updateSubmitLabel();
  recalcInput();
}

function renderCustomerInfoCard() {
  const harga = inputSelectedCustomer.harga || 0;

  document.getElementById('infoHarga').textContent = formatRupiah(harga);
  document.getElementById('infoSaldo').textContent = formatRupiah(inputSaldoAwal);
  document.getElementById('infoHutang').textContent = formatRupiah(inputHutangAwal);

  const toggleField = document.getElementById('saldoToggleField');
  if (inputSaldoAwal > 0) {
    toggleField.hidden = false;
    document.getElementById('saldoToggleAmount').textContent = formatRupiah(inputSaldoAwal);
  } else {
    toggleField.hidden = true;
    document.getElementById('useSaldoToggle').checked = false;
  }
}

function updateSubmitLabel() {
  document.querySelector('#inputSubmitBtn .btn-label').textContent =
    inputTodayDocExists ? 'Perbarui Data' : 'Simpan';
}

function deselectInputCustomer() {
  inputSelectedCustomer = null;
  inputTodayDocExists = false;
  inputHutangAwal = 0;
  inputSaldoAwal = 0;
  document.getElementById('customerInfoCard').hidden = true;
  document.getElementById('saldoToggleField').hidden = true;
  document.getElementById('useSaldoToggle').checked = false;
  document.getElementById('todayEntryBadge').hidden = true;
  updateSubmitLabel();
  recalcInput();
}

/* ================= Live calculation ================= */

function recalcInput() {
  const tagihanEl = document.getElementById('calcTagihan');
  const keteranganEl = document.getElementById('calcKeterangan');
  const keteranganRow = document.getElementById('calcKeteranganRow');

  if (!inputSelectedCustomer) {
    tagihanEl.textContent = formatRupiah(0);
    keteranganEl.textContent = formatRupiah(0);
    keteranganRow.classList.remove('negative');
    return;
  }

  const { tagihanTotal, keterangan } = computeInputTotals();

  tagihanEl.textContent = formatRupiah(tagihanTotal);
  keteranganEl.textContent = formatRupiah(keterangan);
  keteranganRow.classList.toggle('negative', keterangan < 0);
}

function computeInputTotals() {
  const harga = inputSelectedCustomer.harga || 0;

  const galon = Number(document.getElementById('inputGalon').value) || 0;
  const pembayaran = Number(document.getElementById('inputPembayaran').value) || 0;
  const gunakanSaldo = document.getElementById('useSaldoToggle').checked && inputSaldoAwal > 0;

  // Selalu pakai hutangAwal/saldoAwal (snapshot sebelum hari ini), BUKAN
  // customer.hutang/saldo yang mungkin sudah berubah gara-gara entri
  // pertama hari ini.
  const tagihanTotal = (harga * galon) + inputHutangAwal;
  const saldoDipakai = gunakanSaldo ? inputSaldoAwal : 0;
  const totalDibayar = pembayaran + saldoDipakai;
  const keterangan = totalDibayar - tagihanTotal;

  let saldoBaru;
  let hutangBaru;
  if (keterangan >= 0) {
    saldoBaru = (gunakanSaldo ? 0 : inputSaldoAwal) + keterangan;
    hutangBaru = 0;
  } else {
    saldoBaru = gunakanSaldo ? 0 : inputSaldoAwal;
    hutangBaru = Math.abs(keterangan);
  }

  return { galon, pembayaran, gunakanSaldo, tagihanTotal, keterangan, saldoBaru, hutangBaru };
}

/* ================= Submit ================= */

async function getInputIdCabang(uid) {
  if (inputMyIdCabangCache !== null) return inputMyIdCabangCache;
  const snap = await db.collection('users').doc(uid).get();
  inputMyIdCabangCache = snap.exists ? (snap.data().idCabang || null) : null;
  return inputMyIdCabangCache;
}

function todayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function handleInputSubmit(e) {
  e.preventDefault();

  const user = firebase.auth().currentUser;
  if (!user) {
    showAlert('Sesi kamu berakhir. Silakan masuk kembali.', 'error');
    return;
  }

  if (!inputSelectedCustomer) {
    showAlert('Pilih pelanggan dari daftar terlebih dahulu.', 'error');
    return;
  }

  const { galon, pembayaran, gunakanSaldo, keterangan, saldoBaru, hutangBaru } = computeInputTotals();

  if (!galon || galon <= 0) {
    showAlert('Pengisian galon wajib diisi.', 'error');
    return;
  }

  const submitBtn = document.getElementById('inputSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');

  try {
    const idCabang = await getInputIdCabang(user.uid);
    const customerRef = db.collection('customers').doc(inputSelectedCustomer.id);
    const dataHarianRef = customerRef.collection('dataHarian').doc(todayDateString());

    const batch = db.batch();
    batch.set(dataHarianRef, {
      namaCustomer: inputSelectedCustomer.namaPelanggan,
      pengisianGalon: galon,
      pembayaran,
      keterangan,
      gunakanSaldo,
      hutangAwal: inputHutangAwal,
      saldoAwal: inputSaldoAwal,
      createdBy: user.uid,
      idCabang: idCabang || null,
      tanggal: todayDateString(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.update(customerRef, {
      saldo: saldoBaru,
      hutang: hutangBaru
    });

    await batch.commit();

    showAlert(inputTodayDocExists ? 'Data hari ini berhasil diperbarui.' : 'Data harian berhasil disimpan.', 'success');
    resetInputForm();
  } catch (error) {
    showAlert('Gagal menyimpan data. Coba lagi.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
  }
}

function resetInputForm() {
  document.getElementById('inputForm').reset();
  deselectInputCustomer();
  document.getElementById('inputNamaSuggestions').hidden = true;
  document.getElementById('inputNama').focus();
}

/* ================= Helpers ================= */

function formatRupiah(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}Rp ${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;
}