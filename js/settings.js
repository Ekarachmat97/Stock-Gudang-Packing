import { getFirestore, collection, getDocs, addDoc, deleteDoc, query, orderBy } from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-firestore.js';
import { app, auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-auth.js';

const db = getFirestore(app);

// Utility to render a list of docs and wire delete buttons
let isSignedIn = false; // will be set by auth state

async function loadList(colName, listContainerId) {
  const container = document.getElementById(listContainerId);
  if (!container) return;
  container.innerHTML = 'Loading...';

  try {
    const q = query(collection(db, colName), orderBy('value'));
    const snap = await getDocs(q);
    if (snap.empty) {
      container.innerHTML = '<div class="text-muted">(kosong)</div>';
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'list-group';
    snap.forEach(doc => {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
      li.textContent = doc.data().value;
      // Only show delete button if the user is signed-in
      if (isSignedIn) {
        const del = document.createElement('button');
        del.className = 'btn btn-sm btn-outline-danger';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
          if (!confirm(`Hapus "${doc.data().value}" dari ${colName}?`)) return;
          try {
            await deleteDoc(doc.ref);
            loadList(colName, listContainerId);
          } catch (err) {
            console.error('Delete failed', err);
            const code = err && err.code ? err.code : 'unknown';
            const msg = err && err.message ? err.message : String(err);
            alert(`Gagal menghapus. (${code}) ${msg}\nPastikan Anda memiliki izin (admin).`);
          }
        });
        li.appendChild(del);
      } else {
        const badge = document.createElement('span');
        badge.className = 'badge bg-secondary';
        badge.textContent = 'login untuk edit';
        li.appendChild(badge);
      }
      ul.appendChild(li);
    });
    container.innerHTML = '';
    container.appendChild(ul);
  } catch (err) {
    console.error('Load list failed', err);
    container.innerHTML = '<div class="text-danger">Gagal memuat data.</div>';
  }
}

async function addItem(colName, inputId, listContainerId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const v = input.value.trim();
  if (!v) return alert('Masukkan nilai yang valid');

  try {
    await addDoc(collection(db, colName), { value: v });
    input.value = '';
    await loadList(colName, listContainerId);
  } catch (err) {
    console.error('Add failed', err);
    const code = err && err.code ? err.code : 'unknown';
    const msg = err && err.message ? err.message : String(err);
    alert(`Gagal menambahkan. (${code}) ${msg}\nPastikan Anda memiliki izin (admin) atau hubungi administrator.`);
  }
}

// Wire UI
document.addEventListener('DOMContentLoaded', () => {
  // Wire logout if present
  const logoutBtn = document.getElementById('logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await auth.signOut();
        window.location.href = 'index.html';
      } catch (err) { console.error('Logout failed', err); }
    });
  }

  // Observe auth state before rendering add/delete controls
  onAuthStateChanged(auth, async (user) => {
    // clear any leftover admin flag (we only use isSignedIn now)

    // Toggle visibility of add buttons while we determine role
    const addButtons = ['blocksAdd','productsAdd','levelsAdd','codesAdd'];
    addButtons.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

  // update sign-in state and show add buttons for signed-in users
    isSignedIn = !!user;

    addButtons.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = isSignedIn ? '' : 'none';
      if (isSignedIn) {
        if (id === 'blocksAdd') el.addEventListener('click', () => addItem('blocks', 'blocksInput', 'blocksList'));
        if (id === 'productsAdd') el.addEventListener('click', () => addItem('productOptions', 'productsInput', 'productsList'));
        if (id === 'levelsAdd') el.addEventListener('click', () => addItem('levels', 'levelsInput', 'levelsList'));
        if (id === 'codesAdd') el.addEventListener('click', () => addItem('codes', 'codesInput', 'codesList'));
      }
    });

    // Load lists (delete buttons will show only when isSignedIn is true)
    loadList('blocks', 'blocksList');
    loadList('productOptions', 'productsList');
    loadList('levels', 'levelsList');
    loadList('codes', 'codesList');
  });
});
