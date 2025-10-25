import { getFirestore, collection, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-firestore.js';
import { app } from './firebase.js';

const db = getFirestore(app);

export async function getCollectionValues(collectionName) {
  const q = query(collection(db, collectionName), orderBy('value'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, value: d.data().value }));
}

/**
 * Populate a <select> element with options from a Firestore collection.
 * Replaces existing options.
 */
export async function populateSelectFromCollection(selectId, collectionName, addEmpty = false) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '';
  if (addEmpty) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '-- pilih --';
    sel.appendChild(opt);
  }

  try {
    const items = await getCollectionValues(collectionName);
    items.forEach(it => {
      const o = document.createElement('option');
      o.value = it.value;
      o.textContent = it.value;
      sel.appendChild(o);
    });
  } catch (err) {
    console.error('populateSelectFromCollection failed', collectionName, err);
  }
}
