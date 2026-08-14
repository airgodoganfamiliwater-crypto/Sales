let homeActivityUnsub = null;
let homeTodayUnsub = null;
let homeCustomersUnsub = null;
let homeCustomerCount = 0;
let homeUIBound = false;
let homeBalanceRaw = 0;
let homeBalanceHidden = false;

window.HomeView = {
  onEnter() {
    bindHomeUI();
    checkSalesAccess();
    loadHomeAvatarPhoto();
  },

  onLeave() {
    if (homeActivityUnsub) {
      homeActivityUnsub();
      homeActivityUnsub = null;
    }
    if (homeTodayUnsub) {
      homeTodayUnsub();
      homeTodayUnsub = null;
    }
    if (homeCustomersUnsub) {
      homeCustomersUnsub();
      homeCustomersUnsub = null;
    }
  }
};

// the Home avatar chip stays in sync with whatever photo is saved there.
async function loadHomeAvatarPhoto() {
  const imgEl = document.getElementById('homeAvatarImg');
  const initialEl = document.getElementById('homeAvatarInitial');
  if (!imgEl || !initialEl) return;

  try {
    const dataUrl = await getProfilePhotoFromIDB();
    if (dataUrl) {
      imgEl.src = dataUrl;
      imgEl.hidden = false;
      initialEl.hidden = true;
    } else {
      imgEl.hidden = true;
      imgEl.src = '';
      initialEl.hidden = false;
    }
  } catch (error) {
    console.error('Gagal memuat foto profil untuk avatar Home:', error);
  }
}

function bindHomeUI() {
  if (homeUIBound) return;
  homeUIBound = true;

  document.getElementById('homeEyeToggle').addEventListener('click', () => {
    homeBalanceHidden = !homeBalanceHidden;
    renderHomeBalance();
  });
}

async function checkSalesAccess() {
  const user = firebase.auth().currentUser;

  if (!user) {
    goToLogin('Sesi kamu berakhir. Silakan masuk kembali.');
    return;
  }

  try {
    const snap = await db.collection('users').doc(user.uid).get();

    if (!snap.exists) {
      goToLogin('Akun kamu tidak terdaftar. Hubungi admin.');
      return;
    }

    const data = snap.data();

    if (data.role !== 'sales' || data.status !== true) {
      goToLogin('Akun kamu belum aktif atau tidak memiliki akses ke aplikasi ini.');
      return;
    }

    renderHome(data, user);
    startHomeActivityListener(user.uid);
    startHomeTodayListener(user.uid);
    startHomeCustomersListener(user.uid);
  } catch (error) {
    // Firestore rules deny read when status !== true (or role mismatch),
    // which surfaces here as permission-denied.
    goToLogin('Akun kamu belum aktif. Hubungi admin.');
  }
}

function renderHome(userData, authUser) {
  const nameEl = document.getElementById('homeUserName');
  const greetingEl = document.getElementById('homeGreeting');
  const avatarEl = document.getElementById('homeAvatarInitial');

  const displayName = userData.name || (authUser.email ? authUser.email.split('@')[0] : 'Sales');

  if (nameEl) {
    nameEl.textContent = displayName;
    nameEl.classList.remove('skeleton', 'skeleton-light');
  }

  if (avatarEl) {
    avatarEl.textContent = displayName.trim().charAt(0) || 'S';
  }

  if (greetingEl) {
    const hour = new Date().getHours();
    const greeting = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';
    greetingEl.textContent = greeting;
  }
}

/* ================= Recent activity ================= */

function startHomeActivityListener(uid) {
  if (homeActivityUnsub) homeActivityUnsub();

  homeActivityUnsub = db.collectionGroup('dataHarian')
    .where('createdBy', '==', uid)
    .orderBy('updatedAt', 'desc')
    .limit(5)
    .onSnapshot((snapshot) => {
      const entries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderHomeActivity(entries);
    }, (error) => {
      console.error('Gagal memuat aktivitas terbaru:', error);
    });
}

function startHomeTodayListener(uid) {
  if (homeTodayUnsub) homeTodayUnsub();

  homeTodayUnsub = db.collectionGroup('dataHarian')
    .where('createdBy', '==', uid)
    .where('tanggal', '==', todayDateString())
    .onSnapshot((snapshot) => {
      const todayEntries = snapshot.docs.map((doc) => doc.data());
      const transaksiHariIni = todayEntries.filter((e) => (e.pembayaran || 0) > 0);

      const visitsEl = document.getElementById('statVisits');
      const transactionsEl = document.getElementById('statTransactions');
      if (visitsEl) {
        visitsEl.textContent = todayEntries.length.toLocaleString('id-ID');
        visitsEl.classList.remove('skeleton');
      }
      if (transactionsEl) {
        transactionsEl.textContent = transaksiHariIni.length.toLocaleString('id-ID');
        transactionsEl.classList.remove('skeleton');
      }

      homeBalanceRaw = todayEntries.reduce((sum, e) => sum + (e.pembayaran || 0), 0);
      renderHomeBalance();
    }, (error) => {
      console.error('Gagal memuat statistik hari ini:', error);
    });
}

function renderHomeBalance() {
  const valueEl = document.getElementById('homeBalanceValue');
  if (!valueEl) return;
  valueEl.textContent = homeBalanceHidden ? 'Rp ••••••' : formatRupiah(homeBalanceRaw);
  valueEl.classList.remove('skeleton', 'skeleton-light');
}

function renderHomeActivity(entries) {
  const listEl = document.getElementById('homeActivityList');

  if (entries.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 3v5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3.05 13a9 9 0 1 0 2.13-6.36L3 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </div>
        <p class="empty-title">Belum ada aktivitas</p>
        <p class="empty-desc">Data kunjungan &amp; transaksi terbaru akan muncul di sini.</p>
      </div>`;
    return;
  }

  // Reuse the .riwayat-entry card styling from riwayat.css for consistency.
  listEl.innerHTML = entries.map((entry) => {
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
  }).join('');
}

/* ================= Stat cards ================= */

function startHomeCustomersListener(uid) {
  if (homeCustomersUnsub) homeCustomersUnsub();

  homeCustomersUnsub = db.collection('customers')
    .where('pemilik', '==', uid)
    .onSnapshot((snapshot) => {
      homeCustomerCount = snapshot.size;
      const customersEl = document.getElementById('statCustomers');
      if (customersEl) {
        customersEl.textContent = homeCustomerCount.toLocaleString('id-ID');
        customersEl.classList.remove('skeleton');
      }

      const hasHutang = snapshot.docs.some((doc) => (doc.data().hutang || 0) > 0);
      const dotEl = document.getElementById('homeBellDot');
      if (dotEl) dotEl.hidden = !hasHutang;
    }, (error) => {
      console.error('Gagal memuat jumlah pelanggan:', error);
    });
}

function goToLogin(message) {
  if (message) {
    try {
      sessionStorage.setItem('loginRedirectMessage', message);
    } catch (e) {
      // sessionStorage unavailable — proceed without the message
    }
  }
  firebase.auth().signOut().finally(() => {
    window.location.href = 'login.html';
  });
}