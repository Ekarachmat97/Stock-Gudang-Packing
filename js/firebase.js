import { initializeApp } from "https://www.gstatic.com/firebasejs/9.21.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, deleteDoc } from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-auth.js';

// Konfigurasi Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDpLWJjxqU47-Nfd8noZ076qk0qcGXTXTY",
  authDomain: "inventorymanager-8d455.firebaseapp.com",
  projectId: "inventorymanager-8d455",
  storageBucket: "inventorymanager-8d455.firebasestorage.app",
  messagingSenderId: "955972274628",
  appId: "1:955972274628:web:706fb879f0362f75aafc91",
  measurementId: "G-SC629X7C6Q"
};

// Inisialisasi aplikasi Firebase
const app = initializeApp(firebaseConfig);

// Inisialisasi Firestore
const db = getFirestore(app);

// Inisialisasi Firebase Auth
const auth = getAuth(app);

// mengambil semua produk
export const getAllProducts = async () => {
  const productsCollection = collection(db, 'products');
  const snapshot = await getDocs(productsCollection);
  const products = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  return products;
};

// menghapus produk
export const deleteProduct = async (id) => {
  const productDoc = doc(db, 'products', id);
  await deleteDoc(productDoc);
};

export { app, auth };