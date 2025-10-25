import { getFirestore, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-firestore.js';
import { app, auth } from './firebase.js';
import { populateSelectFromCollection } from './lookups.js';

// Inisialisasi Firestore
const db = getFirestore(app);

// Ambil elemen form (bisa null jika skrip di-include pada halaman lain)
const productForm = document.getElementById('addProductForm');

// Jika form ada di halaman, pasang event listener untuk submit
if (productForm) {
  // Populate selects from lookup collections so settings changes are reflected
  document.addEventListener('DOMContentLoaded', async () => {
    await populateSelectFromCollection('gudang', 'blocks');
    await populateSelectFromCollection('level', 'levels');
    await populateSelectFromCollection('kodeBarang', 'productOptions');
    await populateSelectFromCollection('kode', 'codes');
  });
  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Ambil data dari form
    const gudang = document.getElementById('gudang').value;
    const level = document.getElementById('level').value;
    const kodeBarang = document.getElementById('kodeBarang').value;
    const kode = document.getElementById('kode').value;
    const tanggalExp = document.getElementById('tanggalExp').value;
    const jumlahValue = document.getElementById('jumlah').value;
    const satuan = document.getElementById('satuan').value;
    const cycleValue = document.getElementById('cycle').value;
    // Parse numeric fields to integers to satisfy Firestore rules expecting `int` types
    const jumlah = parseInt(jumlahValue, 10);
    const cycle = parseInt(cycleValue, 10);

    // Basic validation to prevent sending wrong types to Firestore
    if (isNaN(jumlah) || jumlah < 0) {
      alert('Jumlah harus berupa angka bulat >= 0');
      return;
    }
    if (isNaN(cycle) || cycle < 0) {
      alert('Cycle harus berupa angka bulat >= 0');
      return;
    }
  let info = document.getElementById('info').value;
    const holdUntilDays = parseInt(document.getElementById('holdUntil').value) || 0;

    // Menghitung tanggal Hold Until sesuai input pengguna
    const createdAt = serverTimestamp();
    let holdUntilDate = null; // Default null

    // Adjust info based on holdUntilDays: if holdUntilDays === 0 and status is not Release/Reject,
    // treat it as 'Verifikasi'. If holdUntilDays > 0 and user selected Hold, set holdUntil accordingly.
    if (holdUntilDays === 0) {
      if (info !== 'Release' && info !== 'Reject') {
        info = 'Verifikasi';
      }
      // leave holdUntilDate as null
    } else if (info === 'Hold' && holdUntilDays > 0) {
      holdUntilDate = new Date();
      holdUntilDate.setDate(holdUntilDate.getDate() + holdUntilDays); // Menambahkan hari sesuai input pengguna
    }

    // Menambahkan produk ke Firestore dengan properti 'createdAt' dan 'holdUntil'
    try {
      // ensure user is signed in before attempting write — rules require authentication
      if (!auth || !auth.currentUser) {
        alert('Anda harus login terlebih dahulu untuk menambahkan product.');
        return;
      }

      // Build payload and log for debugging (types and values). Remove these logs in production.
      const payload = {
        gudang,
        level,
        kodeBarang,
        kode,
        tanggalExp,
        jumlah,
        satuan,
        cycle,
        info,
        createdAt,
        holdUntil: holdUntilDate ? holdUntilDate : null,
      };
      console.log('Adding product. user=', auth.currentUser && auth.currentUser.uid, 'payload=', payload);

      await addDoc(collection(db, 'products'), payload);
      alert('Product added successfully!');
      productForm.reset(); // Reset form setelah berhasil
    } catch (error) {
      console.error('Error adding product:', error);
      const code = error && error.code ? error.code : 'unknown';
      const msg = error && error.message ? error.message : String(error);
      alert(`Gagal menambahkan product. (${code}) ${msg}`);
    }
  });

  // Event Listener tambahan untuk form status (hanya jika elemen ada)
  const infoEl = document.getElementById('info');
  const holdUntilEl = document.getElementById('holdUntil');
  if (infoEl && holdUntilEl) {
    infoEl.addEventListener('change', (e) => {
      const selectedValue = e.target.value;
      if (selectedValue === 'Release' || selectedValue === 'Reject') {
        holdUntilEl.disabled = true; // Abaikan input holdUntil jika status Release atau Reject
        holdUntilEl.value = ''; // Kosongkan nilai holdUntil
      } else {
        holdUntilEl.disabled = false; // Aktifkan input holdUntil jika status lainnya
      }
    });
  }
}
