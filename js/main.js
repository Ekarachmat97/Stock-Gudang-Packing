import { 
  getFirestore, 
  collection, 
  getDocs,
  startAfter,
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc, 
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-auth.js';
import { app, auth } from './firebase.js'; // Pastikan 'auth' sudah terimport dari firebase.js
import { populateSelectFromCollection } from './lookups.js';

// Inisialisasi Firestore
const db = getFirestore(app);
const productTable = document.getElementById('productTable');
const updateProductModal = new bootstrap.Modal(document.getElementById('updateProductModal'));

// Fungsi untuk mencatat log aktivitas
const logActivity = async (action, productId, details) => {
  const logEntry = {
    action,
    productId,
    details,
    // use serverTimestamp so security rules that expect timestamp types accept this write
    timestamp: serverTimestamp(),
  };

  try {
    await addDoc(collection(db, 'activityLogs'), logEntry);
    console.log('Log aktivitas berhasil:', logEntry);
  } catch (error) {
    console.error('Gagal mencatat log aktivitas:', error);
  }
};

// In-memory cache of loaded products (reduces DOM thrash & helps search)
let latestProducts = [];
let currentDisplayedProducts = [];

// Pagination state
let pageSize = 50;
let lastVisible = null;
let loadingMore = false;
let allLoaded = false;

// Fungsi untuk menampilkan produk ke tabel
const displayProducts = async (products) => {
  if (!productTable) return;

  // Reset tabel sebelumnya
  productTable.innerHTML = '';

  const currentDate = new Date();

  // Sort produk berdasarkan tanggal expired (FIFO)
  products.sort((a, b) => new Date(a.tanggalExp) - new Date(b.tanggalExp));

  // Collect background update promises so UI shows quickly
  const updatePromises = [];

  // remember which list is currently shown (used by export)
  currentDisplayedProducts = products;

  for (const product of products) {
    let holdUntil = product.holdUntil ? new Date(product.holdUntil.seconds * 1000) : null;

    // Kalkulasi sisa hari
    const daysRemaining = holdUntil
      ? Math.ceil((holdUntil - currentDate) / (1000 * 60 * 60 * 24))
      : 0;

    // Logika status 'Release' otomatis jika waktu habis
    if (holdUntil && currentDate > holdUntil && product.info === 'Hold') {
      const p = updateDoc(doc(db, 'products', product.id), {
        info: 'Release',
        holdUntil: null,
      }).then(() => logActivity('Auto-Update', product.id, `Status diubah menjadi 'Release' karena holdUntil habis.`))
        .catch((err) => console.error('Auto-update failed for', product.id, err));
      updatePromises.push(p);
    }

    // Abaikan holdUntil jika status manual diubah ke 'Release' atau 'Reject'
    if (product.info === 'Release' || product.info === 'Reject') {
      holdUntil = null;
    }

    // Tentukan warna latar belakang berdasarkan status
    // Initialize statusClass to avoid ReferenceError
    let statusClass = '';
    if (product.info === 'Hold') {
      statusClass = 'bg-warning text-dark'; // Kuning
    } else if (product.info === 'Verifikasi') {
      statusClass = 'bg-info text-dark'; // Biru muda
    } else if (product.info === 'Release') {
      statusClass = 'bg-success text-white'; // Hijau
    } else if (product.info === 'Reject') {
      statusClass = 'bg-danger text-white'; // Merah
    }


  // Determine if user is signed in so we can disable edit actions for anonymous users
  const isSignedIn = !!auth && !!auth.currentUser;

  // Tambahkan row ke tabel
  const row = document.createElement('tr');
  row.innerHTML = `
      <td>${product.gudang}</td>
      <td>${product.level}</td>
      <td>${product.kodeBarang}</td>
      <td>${product.kode}</td>
      <td>${
  new Date(product.tanggalExp).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'numeric',
    year: 'numeric'
  })
}</td>
      <td>${product.jumlah}</td>
      <td>${product.satuan}</td>
      <td>${product.cycle}</td>
      <td class="${statusClass}">${product.info}</td>
      <td>${daysRemaining > 0 ? daysRemaining + ' Hari' : '0 Hari'}</td>
      <td class="action-buttons">
        ${isSignedIn
          ? `<button class="btn btn-success btn-sm btn-update" data-id="${product.id}">Update</button>
             <button class="btn btn-danger btn-sm btn-out" data-id="${product.id}">Out</button>`
          : `<span class="badge bg-secondary">login untuk edit</span>`}
      </td>
    `;
    productTable.appendChild(row);
  }

  // Run background updates (fire-and-forget but log errors)
  if (updatePromises.length) {
    Promise.allSettled(updatePromises).then(() => {
      // Optionally do something after background updates
    });
  }
};
// Paginated loader (first page + load more)
const loadFirstPage = async () => {
  latestProducts = [];
  lastVisible = null;
  allLoaded = false;
  await loadNextPage();
};

const loadNextPage = async () => {
  if (loadingMore || allLoaded) return;
  loadingMore = true;

  try {
    let q;
    if (lastVisible) {
      q = query(collection(db, 'products'), orderBy('tanggalExp', 'asc'), startAfter(lastVisible), limit(pageSize));
    } else {
      q = query(collection(db, 'products'), orderBy('tanggalExp', 'asc'), limit(pageSize));
    }

    const snap = await getDocs(q);
    if (snap.empty) {
      allLoaded = true;
      loadingMore = false;
      return;
    }

    const page = [];
    snap.forEach((d) => {
      page.push({ id: d.id, ...d.data() });
    });

    // append
    latestProducts = latestProducts.concat(page);

    // set cursor
    lastVisible = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < pageSize) allLoaded = true;

    displayProducts(latestProducts);
  } catch (err) {
    console.error('Failed to load page', err);
  } finally {
    loadingMore = false;
  }
};

// Event Listener untuk tombol Out
productTable.addEventListener('click', async (e) => {
  if (e.target.classList.contains('btn-out')) {
    const id = e.target.getAttribute('data-id');
    try {
      // Ensure user is authenticated before attempting writes/deletes.
      if (!auth || !auth.currentUser) {
        alert('Anda harus login untuk melakukan tindakan ini.');
        return;
      }

      const productRef = doc(db, 'products', id);
      const snap = await getDoc(productRef);

      if (!snap.exists()) {
        alert('Produk tidak ditemukan.');
        return;
      }
      const product = snap.data();

      // Confirm deletion with the user
      if (!confirm(`Yakin ingin menghapus produk "${product.kodeBarang || product.kode}" dari block ${product.gudang || ''}?`)) {
        return;
      }

      // Perform delete
      await deleteDoc(productRef);

      // Catat log aktivitas sebagai Delete
      await logActivity('Delete', id, `Produk ${product.kodeBarang || product.kode} dihapus.`);

      // Update in-memory list and re-render table
      latestProducts = latestProducts.filter(p => p.id !== id);
      displayProducts(latestProducts);

      alert('Produk berhasil dihapus.');
    } catch (error) {
      console.error('Gagal menghapus produk (Out):', error);
      const code = error && error.code ? error.code : 'unknown';
      const msg = error && error.message ? error.message : String(error);
      alert(`Gagal menghapus produk. (${code}) ${msg}`);
    }
  }
});

// Fungsi untuk memuat data produk ke modal
let currentProductId = null;
const openUpdateModal = async (productId) => {
  currentProductId = productId;
  const productRef = doc(db, 'products', productId);
  const productSnapshot = await getDoc(productRef);

  if (productSnapshot.exists()) {
    const product = productSnapshot.data();
    // Ensure selects are populated from lookups before setting their values
    await populateSelectFromCollection('gudang', 'blocks');
    await populateSelectFromCollection('level', 'levels');
    await populateSelectFromCollection('kodeBarang', 'productOptions');
    await populateSelectFromCollection('kode', 'codes');

    document.getElementById('gudang').value = product.gudang || '';
    document.getElementById('level').value = product.level || '';
    document.getElementById('kodeBarang').value = product.kodeBarang || '';
    document.getElementById('kode').value = product.kode || '';
    document.getElementById('tanggalExp').value = product.tanggalExp || '';
    document.getElementById('jumlah').value = product.jumlah || '';
    document.getElementById('satuan').value = product.satuan || '';
    document.getElementById('cycle').value = product.cycle || '';
    document.getElementById('info').value = product.info || 'Hold';
    document.getElementById('holdUntil').value = product.holdUntil
      ? Math.ceil((new Date(product.holdUntil.seconds * 1000) - new Date()) / (1000 * 60 * 60 * 24))
      : 0;

    // Tampilkan modal
    updateProductModal.show();
  } else {
    alert('Produk tidak ditemukan!');
  }
};

// Event listener untuk tombol Update
productTable.addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-update')) {
    const productId = e.target.getAttribute('data-id');
    openUpdateModal(productId);
  }
});

// Fungsi untuk menangani pembaruan produk
const handleUpdateProduct = async (e) => {
  e.preventDefault();

  // ensure user is authenticated before attempting writes
  if (!auth || !auth.currentUser) {
    alert('Anda harus login untuk memperbarui produk.');
    return;
  }

  // load the latest server copy to compute minimal update and validate state
  const productRef = doc(db, 'products', currentProductId);
  const productSnap = await getDoc(productRef);
  if (!productSnap.exists()) {
    alert('Produk tidak ditemukan (sudah dihapus).');
    updateProductModal.hide();
    return;
  }
  const existing = productSnap.data();

  // read form inputs
  let info = document.getElementById('info').value;
  let holdUntilDays = parseInt(document.getElementById('holdUntil').value, 10);
  const currentDate = new Date();
  let holdUntilDate = null;

  // Normalize numeric fields (avoid sending NaN)
  const jumlah = parseInt(document.getElementById('jumlah').value, 10);
  const cycle = parseInt(document.getElementById('cycle').value, 10);

  // Determine new info/holdUntil according to rules
  if (holdUntilDays === 0 && info !== 'Reject' && info !== 'Release') {
    info = 'Verifikasi';
    holdUntilDate = null;
  } else if (info === 'Release' || info === 'Reject') {
    holdUntilDate = null;
  } else {
    // >0 days and not Release/Reject -> treat as Hold
    holdUntilDate = new Date();
    holdUntilDate.setDate(holdUntilDate.getDate() + (isNaN(holdUntilDays) ? 0 : holdUntilDays));
    info = 'Hold';
  }

  // Build minimal update payload - include only fields that should be updated.
  const payload = {};

  // Always allow updating these basic fields (they may be unchanged but harmless)
  payload.gudang = document.getElementById('gudang').value;
  payload.level = document.getElementById('level').value;
  payload.kodeBarang = document.getElementById('kodeBarang').value;
  payload.kode = document.getElementById('kode').value;
  payload.tanggalExp = document.getElementById('tanggalExp').value;
  payload.jumlah = isNaN(jumlah) ? (existing.jumlah || 0) : jumlah;
  payload.satuan = document.getElementById('satuan').value;
  payload.cycle = isNaN(cycle) ? (existing.cycle || 0) : cycle;

  // status + holdUntil (convert JS Date -> Firestore Timestamp)
  payload.info = info;
  if (holdUntilDate) {
    payload.holdUntil = Timestamp.fromDate(holdUntilDate);
  } else {
    // explicitly set holdUntil to null to clear previous hold
    payload.holdUntil = null;
  }

  try {
    await updateDoc(productRef, payload);

    // update local cache (merge minimal changes so UI updates immediately)
    latestProducts = latestProducts.map(p => {
      if (p.id !== currentProductId) return p;
      return {
        ...p,
        ...payload,
        // keep createdAt from existing doc if present
        createdAt: existing.createdAt ?? p.createdAt
      };
    });

    // Log activity
    await logActivity('Update', currentProductId, `Produk diperbarui: status ${info}.`);

    // Re-render
    displayProducts(latestProducts);

    alert('Produk berhasil diperbarui!');
    updateProductModal.hide();
  } catch (error) {
    console.error('Gagal memperbarui produk:', error);
    const code = error && error.code ? error.code : 'unknown';
    const msg = error && error.message ? error.message : String(error);
    alert(`Gagal memperbarui produk. (${code}) ${msg}`);
  }
};

// Event listener untuk form update produk
document.getElementById('updateProductForm').addEventListener('submit', handleUpdateProduct);

// Fungsi untuk logout
const logout = async () => {
  try {
    await signOut(auth);
    alert('Anda berhasil logout');
    window.location.href = 'index.html';
  } catch (error) {
    console.error('Logout gagal:', error);
    alert('Terjadi kesalahan saat logout');
  }
};

// Menambahkan event listener pada tombol logout
document.getElementById('logoutButton').addEventListener('click', logout);

// --- Search handling (debounced) to filter latestProducts in-memory ---
const searchBar = document.getElementById('searchBar');
const searchButton = document.getElementById('searchButton');
const debounce = (fn, wait) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
};

const doSearch = () => {
  const keyword = (searchBar && searchBar.value || '').toLowerCase().trim();
  if (!keyword) {
    displayProducts(latestProducts);
    return;
  }
  const filtered = latestProducts.filter(p => {
    const text = `${p.gudang} ${p.level} ${p.kodeBarang} ${p.kode} ${p.info} ${p.jumlah}`.toLowerCase();
    return text.includes(keyword);
  });
  displayProducts(filtered);
};

if (searchButton && searchBar) {
  searchButton.addEventListener('click', doSearch);
  searchBar.addEventListener('keyup', debounce((e) => {
    if (e.key === 'Enter') doSearch();
    else doSearch();
  }, 150));
}

// Load first page on start
loadFirstPage();

// Load more button
const loadMoreBtn = document.getElementById('loadMoreBtn');
if (loadMoreBtn) {
  loadMoreBtn.addEventListener('click', async () => {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = allLoaded ? 'All loaded' : 'Loading...';
    await loadNextPage();
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = allLoaded ? 'All loaded' : 'Load more';
  });
}

// Export CSV
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportToCsv = (products) => {
  if (!products || !products.length) {
    alert('No products to export');
    return;
  }

  const headers = ['Block','Lantai','Product','Code','Expired','Jumlah','Satuan','Cycle','Status','HoldUntil','CreatedAt'];
  const rows = products.map(p => {
    const exp = formatDate(p.tanggalExp);
    const hold = formatDateFromPossibleTimestamp(p.holdUntil);
    const created = formatDateFromPossibleTimestamp(p.createdAt);
    return [p.gudang, p.level, p.kodeBarang, p.kode, exp, p.jumlah, p.satuan, p.cycle, p.info, hold, created];
  });

  const csvContent = [headers].concat(rows).map(r => r.map(cell => '"' + String(cell ?? '').replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date();
  const filename = `products-${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}.csv`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const formatDate = (d) => {
  if (!d) return '';
  // If stored as Firestore timestamp-like
  if (d.seconds) {
    return new Date(d.seconds * 1000).toLocaleDateString('id-ID');
  }
  // If stored as ISO or YYYY-MM-DD string
  try {
    const dt = new Date(d);
    if (!isNaN(dt)) return dt.toLocaleDateString('id-ID');
  } catch(e) {}
  return String(d);
};

const formatDateFromPossibleTimestamp = (v) => {
  if (!v) return '';
  if (v.seconds) return new Date(v.seconds * 1000).toLocaleDateString('id-ID');
  try { const dt = new Date(v); if (!isNaN(dt)) return dt.toLocaleDateString('id-ID'); } catch(e){}
  return String(v);
};

if (exportCsvBtn) {
  exportCsvBtn.addEventListener('click', () => {
    // prefer exported filtered list (currently displayed)
    const toExport = currentDisplayedProducts && currentDisplayedProducts.length ? currentDisplayedProducts : latestProducts;
    exportToCsv(toExport);
  });
}