# Dokumentasi — Stock Gudang Produksi

Versi: 1.0  
Tanggal: 2025

Ringkasan
---------
Aplikasi "Stock Gudang Produksi" adalah web app sederhana untuk mengelola stock/inventory gudang produksi dengan konsep racking. Menggunakan Firebase (Firestore + Auth) sebagai backend, Bootstrap untuk UI, dan Service Worker untuk PWA/offline caching dasar.

Dokumentasi ini menjelaskan:
- Struktur proyek dan file penting
- Model data (Firestore)
- Aturan bisnis penting (termasuk perilaku Deskripsi -> "Ready Packing")
- Security rules ringkas
- Alur kerja halaman (Add Product, Dashboard, Settings)
- Cara setup lokal dan deployment
- Troubleshooting & FAQ
- Ide pengembangan lanjutan

1. Struktur proyek (per item penting)
-------------------------------------
- index.html — halaman login / register.
- dashboard.html — daftar produk, update modal, export CSV, pencarian, pagination.
- addproduct.html — form tambah produk.
- settings.html — kelola lookup (blocks, productOptions, levels, codes).
- js/
  - firebase.js — konfigurasi Firebase (init app, export auth/app helpers).
  - main.js — logic utama dashboard: render tabel, pagination, auto-update status, export CSV, update modal handling.
  - addproduct.js — logic tambah produk.
  - settings.js — kelola lookup collection UI.
  - lookups.js — helper populate select dari koleksi lookup.
  - sw.js & register-sw.js — service worker dan registrasi.
  - register-sw.js — pendaftaran SW dan beforeinstallprompt handler.
- css/style.css — styling kustom.
- firestore.rules — rules Firestore (server-side security).
- manifest.json — PWA manifest.
- DOCUMENTATION.md — file dokumentasi ini (baru dibuat).

2. Model data (Firestore)
-------------------------
Koleksi utama: `products`

Contoh dokumen `products/{id}`:
{
  gudang: "AA01",           // string
  level: "L1",             // string
  kodeBarang: "Pouch",     // string
  kode: "YPS",             // string
  tanggalExp: "2025-10-29",// string (YYYY-MM-DD) atau timestamp (implementation supports both)
  jumlah: 120,             // int >= 0
  satuan: "Keranjang",     // string
  cycle: 1,                // int
  info: "Hold",            // enum: 'Hold'|'Release'|'Reject'|'Verifikasi'
  holdUntil: Timestamp|null,// Firestore timestamp or null
  deskripsi: "catatan...", // optional string (max 1000 chars)
  createdAt: Timestamp     // serverTimestamp() saat create
}

Catatan:
- Field `deskripsi` baru ditambahkan. Ketentuan aplikasi:
  - Saat menambah produk (create): jika user memilih status `Release`, `deskripsi` otomatis di-set menjadi `"Ready Packing"`.
  - Jika produk masuk mode Hold dan holdUntil kadaluarsa, ada auto-update (di main.js) yang mengubah `info` → `Release` dan juga set `deskripsi = "Ready Packing"`.
  - Saat user melakukan update manual lewat modal, jika memilih `Release` maka `deskripsi` juga akan di-set otomatis menjadi `"Ready Packing"`; jika memilih status selain `Release`, nilai deskripsi berasal dari textarea pada modal kecuali diisi kosong.

3. Aturan bisnis penting
------------------------
- Jika `holdUntil` berisi timestamp di masa depan dan `info === 'Hold'`, tampilkan sisa hari di tabel.
- Jika `holdUntil` telah berlalu, dan `info === 'Hold'`, main.js akan:
  - Mengupdate doc: set `info = 'Release'`, `holdUntil = null`, `deskripsi = 'Ready Packing'`.
  - Menulis activity log `activityLogs` (action: 'Auto-Update').
- Jika user memilih `info = 'Release'` saat create atau update: `deskripsi` di-overwrite menjadi `"Ready Packing"`.
- Jika user memilih `info = 'Reject'`: `holdUntil` dihapus (null) dan deskripsi mengikuti input user.

4. Flow CRUD & UI
-----------------
- Add Product (addproduct.html + js/addproduct.js)
  1. User isi form. Numeric fields (`jumlah`, `cycle`) di-parse sebagai integer.
  2. Jika `holdUntil` hari = 0 dan status bukan Release/Reject → status jadi `Verifikasi`.
  3. Jika status `Release` → `deskripsi = "Ready Packing"`.
  4. `createdAt` = serverTimestamp() dikirim ke Firestore.
  5. Setelah sukses, form direset.

- Dashboard (dashboard.html + js/main.js)
  - Paginated load (page size default 50). Tombol "Load more" memuat halaman berikutnya.
  - Tabel disortir berdasarkan `tanggalExp` (asc).
  - Tombol Update membuka modal yang mengambil data server terbaru (getDoc) sebelum pengisian form untuk mencegah race condition.
  - Update: payload minimum dibangun lalu updateDoc dipanggil. Jika `info === 'Release'`, `deskripsi` akan ditetapkan `"Ready Packing"`.
  - Delete (Out): saat tombol Out ditekan, record akan dihapus (deleteDoc) — hanya untuk authenticated users.
  - Export CSV: mengekspor daftar produk yang sedang ditampilkan (filter/search diterapkan pada in-memory cache).
  - Search: filter di client (in-memory) dengan debounce 150ms; search memasukkan deskripsi, tanggal (terformat & raw), kode, gudang, dan lain-lain.

- Settings (settings.html + js/settings.js)
  - Lookup collections: `blocks`, `productOptions`, `levels`, `codes`.
  - UI memungkinkan tambah/delete (delete hanya tersedia untuk user yang signed-in).
  - Populate dynamic selects (lookups.js) dipakai pada add/update forms.

5. Firestore Rules (intisari)
-----------------------------
- Hanya authenticated users yang boleh membaca `products`.
- Create: mensyaratkan fields utama ada (`gudang, level, kodeBarang, kode, tanggalExp, jumlah, satuan, cycle, info, createdAt`) dan validasi tipe/ukuran string. `deskripsi` optional (<= 1000 chars).
- Update: non-admin boleh update subset fields (gudang, level, kodeBarang, kode, tanggalExp, jumlah, satuan, cycle, info, holdUntil, deskripsi). `createdAt` tidak boleh diubah.
- Delete: diizinkan untuk signed-in users (design choice di rules saat ini).
- activityLogs: hanya admin yang bisa membaca; semua user terautentikasi bisa membuat log tetapi field divalidasi.

6. Setup Lokal / Jalankan
-------------------------
Prasyarat:
- Node/NPM tidak diperlukan kecuali Anda ingin host statis dengan server; cukup buka file di browser (ideal menggunakan server lokal karena service worker & module import path):
  - disarankan gunakan simple http server, contoh:
    - Python3: python -m http.server 8000
    - atau serve: npx serve .
- Buat project Firebase dan update `js/firebase.js` dengan konfigurasi Anda (apiKey, projectId, dll) — file sudah ada untuk contoh, ganti kalau perlu.
- Pastikan Firestore diaktifkan dan Authentication (Email/Password) diaktifkan.

Langkah:
1. Clone/pindahkan folder ke server lokal.
2. Jalankan static server di folder root proyek (supaya SW file paths bekerja).
3. Buka http://localhost:8000/ (atau port yang digunakan).
4. Registrasi user, login, lalu buka Add Product / Dashboard.
5. Untuk service worker: buka devtools -> Application -> Service Workers untuk melihat registrasi.

7. Deployment
-------------
- Host sebagai static website (Firebase Hosting, Netlify, Vercel, atau server HTTP static):
  - Jika menggunakan Firebase Hosting:
    1. firebase login
    2. firebase init hosting (pilih folder root proyek)
    3. firebase deploy --only hosting
- Pastikan `manifest.json` dan icon URL valid (atau ganti dengan asset lokal sebelum deploy).

8. Troubleshooting umum
------------------------
- Error auth: periksa konfigurasi Firebase (authDomain) dan cek console error message.
- Firestore permission denied: cek rules, pastikan user sudah login; perhatikan bahwa rules memvalidasi `createdAt` harus serverTimestamp atau timestamp <= request.time.
- Service worker tidak terdaftar: jalankan via server (SW tidak berjalan pada file://), periksa scope path '/js/sw.js'.
- CSV export kosong: pastikan ada produk di in-memory list (loadFirstPage dipanggil di awal); cek console error.
- Deskripsi tidak terset "Ready Packing" setelah auto-update: pastikan main.js yang terbaru berjalan dan tidak ter-cache lama oleh SW; unregister SW atau hard refresh.

9. Testing behavior Deskripsi / Release
--------------------------------------
- Test 1 (Create with Release):
  1. Buka addproduct.html
  2. Pilih status = Release
  3. Submit -> cek dokumen di Firestore, `deskripsi` harus "Ready Packing".
- Test 2 (Auto-release):
  1. Buat produk dengan info=Hold dan holdUntil beberapa hari (atau set holdUntil ke timestamp di masa lalu via console).
  2. Buka dashboard -> main.js mendeteksi holdUntil expired dan memanggil updateDoc untuk set info Release + deskripsi "Ready Packing".
- Test 3 (Update modal):
  1. Buka update modal, ubah status ke Release, save -> `deskripsi` harus menjadi "Ready Packing".

10. Contoh query & payload
---------------------------
- Payload create (contoh):
{
  gudang: "AA01",
  level: "L1",
  kodeBarang: "Pouch",
  kode: "YPS",
  tanggalExp: "2025-10-29",
  jumlah: 120,
  satuan: "Keranjang",
  cycle: 1,
  info: "Release",
  createdAt: (serverTimestamp),
  holdUntil: null,
  deskripsi: "Ready Packing"
}

- Contoh update minimal (user memilih verifikasi):
{ info: "Verifikasi", deskripsi: "Perlu check batch", holdUntil: null }

11. Keamanan & best practices
-----------------------------
- Jangan masukkan kredensial produksi di repo publik. Gunakan environment variables / secret manager untuk CI/CD.
- Activity logs sebaiknya dibuat via Cloud Function agar client tidak bisa memanipulasi log.
- Pertimbangkan membatasi delete hanya untuk admin (ubah firestore.rules jika perlu).
- Validasi input di client tidak menggantikan rules server — server rules harus tetap kuat.

12. Ide pengembangan lanjutan
-----------------------------
- Tambah audit trail lebih lengkap (user id dalam activityLogs).
- Tambah filter per gudang / tanggal range di server (query composite index).
- UI: export to Excel, bulk actions (bulk delete / bulk update).
- Otomasi: Cloud Function untuk auto-release (server-side lebih reliabel daripada client-side polling).
- Perbaikan offline: sinkronisasi antrian saat online kembali.

13. FAQ singkat
---------------
Q: Mengapa deskripsi berubah otomatis menjadi Ready Packing?  
A: Itu aturan bisnis: barang berstatus 'Release' siap packing → deskripsi auto-set untuk menandai status kesiapan packing.

Q: Apa format `tanggalExp` yang disarankan?  
A: Aplikasi menerima string `YYYY-MM-DD` atau timestamp Firestore. UI saat ini mengirim nilai date input HTML (YYYY-MM-DD).

Q: Siapa yang bisa menghapus produk?  
A: Saat ini rules memperbolehkan pengguna terautentikasi menghapus. Ubah rules jika ingin batasi hanya admin.

Penutup
-------
Dokumentasi ini mencakup aspek utama aplikasi. Untuk perubahan besar (mis. memindahkan logic auto-update ke server), baca bagian "ide pengembangan lanjutan". Jika butuh tambahan diagram, skrip migrasi, atau contoh Cloud Function untuk auto-release, minta dan akan ditambahkan.

