/* CONFIG */
const firebaseConfig = {
  apiKey: "AIzaSyCKj0RYNBcLYX2DbHhSH001mc1TmQ7jwaY",
  authDomain: "anime-manga-verse.firebaseapp.com",
  projectId: "anime-manga-verse",
  storageBucket: "anime-manga-verse.firebasestorage.app",
  messagingSenderId: "360987103390",
  appId: "1:360987103390:web:deeadf43ef0256957a2b8f",
  measurementId: "G-CJ2YK6JCM5"
};
// ImgBB API key (you provided)
const IMGBB_API_KEY = "fffd7345879fe3b11b6620fd4f6cec56";

/* LIMITS */
const MAX_PAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB target
const MAX_PAGES = 80;

/* INITIALIZE FIREBASE AUTH */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

/* DOM */
const loginModal = document.getElementById('loginModal');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const closeLogin = document.getElementById('closeLogin');
const googleLoginBtn = document.getElementById('googleLoginBtn');

const uploadModal = document.getElementById('uploadModal');
const openUploadModal = document.getElementById('openUploadModal');
const closeUpload = document.getElementById('closeUpload');
const submitManga = document.getElementById('submitManga');
const cancelUpload = document.getElementById('cancelUpload');
const pngInputsContainer = document.getElementById('pngInputs');

const listContainer = document.getElementById('listContainer');
const searchBar = document.getElementById('searchBar');

const detailModal = document.getElementById('detailModal');
const closeDetail = document.getElementById('closeDetail');
const detailContent = document.getElementById('detailContent');

let loggedIn = false;

/* AUTH UI */
loginBtn.onclick = () => loginModal.style.display = 'flex';
closeLogin.onclick = () => loginModal.style.display = 'none';
googleLoginBtn.onclick = async () => {
  try {
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    loggedIn = true;
    loginModal.style.display = 'none';
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-block';
    alert('Logged in as ' + (user.displayName || user.email));
  } catch (err) {
    console.error('Login error', err);
    alert('Login failed');
  }
};
logoutBtn.onclick = async () => {
  await auth.signOut();
  loggedIn = false;
  loginBtn.style.display = 'inline-block';
  logoutBtn.style.display = 'none';
  alert('Logged out');
};
auth.onAuthStateChanged(user => {
  if (user) {
    loggedIn = true;
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-block';
  } else {
    loggedIn = false;
    loginBtn.style.display = 'inline-block';
    logoutBtn.style.display = 'none';
  }
});

/* DYNAMIC PNG INPUT ROW */
function createPngRow() {
  const row = document.createElement('div');
  row.className = 'png-input-row';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp';
  input.className = 'manga-png';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'add-btn';
  addBtn.textContent = 'Add one more png';
  addBtn.onclick = () => {
    const newRow = createPngRow();
    pngInputsContainer.appendChild(newRow);
    newRow.querySelector('input').focus();
  };
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = 'Remove';
  removeBtn.onclick = () => {
    if (pngInputsContainer.querySelectorAll('.png-input-row').length > 1) row.remove();
    else alert('At least one page input required.');
  };
  row.appendChild(input);
  row.appendChild(addBtn);
  row.appendChild(removeBtn);
  return row;
}
(function initPngInputs(){ pngInputsContainer.innerHTML = ''; pngInputsContainer.appendChild(createPngRow()); })();

/* IMAGE COMPRESSOR */
async function compressImageFile(file, maxBytes = MAX_PAGE_SIZE_BYTES, mime = 'image/webp', quality = 0.8) {
  if (!file.type.startsWith('image/')) return file;
  if (file.size <= maxBytes) return file;

  const img = await new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => { URL.revokeObjectURL(url); res(i); };
    i.onerror = rej;
    i.src = url;
  });

  let canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');
  let w = img.width, h = img.height;
  let ratio = 0.9;
  let lastBlob = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, mime, quality));
    if (!blob) break;
    lastBlob = blob;
    if (blob.size <= maxBytes) return new File([blob], file.name.replace(/\.[^/.]+$/, '.webp'), { type: mime });
    ratio *= 0.8;
  }
  return new File([lastBlob], file.name.replace(/\.[^/.]+$/, '.webp'), { type: mime });
}

/* ImgBB upload helper */
async function uploadToImgbb(file) {
  const toUpload = await compressImageFile(file);
  const form = new FormData();
  form.append('image', toUpload);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: form
  });
  const json = await res.json();
  if (!json || !json.data || !json.data.url) throw new Error('ImgBB upload failed');
  return json.data.url;
}

/* Upload manga and save metadata locally */
async function uploadMangaToImgbb({ thumbnailFile, pageFiles, name, desc, tags }) {
  if (!thumbnailFile) throw new Error('Thumbnail required');
  if (!pageFiles || pageFiles.length === 0) throw new Error('At least one page required');
  if (pageFiles.length > MAX_PAGES) throw new Error('Too many pages');

  const thumbURL = await uploadToImgbb(thumbnailFile);

  const pageURLs = [];
  for (let i = 0; i < pageFiles.length; i++) {
    const url = await uploadToImgbb(pageFiles[i]);
    pageURLs.push(url);
  }

  const manga = {
    id: 'manga_' + Date.now(),
    name,
    desc,
    tags,
    thumbURL,
    pages: pageURLs,
    createdAt: new Date().toISOString()
  };

  const stored = JSON.parse(localStorage.getItem('mangaverse_mangas') || '[]');
  stored.unshift(manga);
  localStorage.setItem('mangaverse_mangas', JSON.stringify(stored));
  return manga;
}

/* Render list from localStorage */
function loadMangasFromLocal() { return JSON.parse(localStorage.getItem('mangaverse_mangas') || '[]'); }

function renderManga() {
  const stored = loadMangasFromLocal();
  listContainer.innerHTML = '';
  stored.forEach((m, idx) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<img src="${m.thumbURL}" alt="${m.name}"><h3>${m.name}</h3>`;
    card.onclick = () => openDetailFromStored(idx);
    listContainer.appendChild(card);
  });
}

/* Open detail with rating and manual slideshow */
function openDetailFromStored(index) {
  const stored = loadMangasFromLocal();
  const m = stored[index];
  if (!m) return;
  detailContent.innerHTML = `
    <img src="${m.thumbURL}" style="max-width:150px; display:block; margin:0 auto 10px;">
    <h2 style="text-align:center; margin:6px 0;">${m.name}</h2>
    <p style="color:#ccc; text-align:center;">${m.desc ? m.desc : 'No description provided.'}</p>
    <div style="text-align:center; margin:8px 0;">
      ${m.tags.map(t => `<span class="tag">#${t}</span>`).join(' ')}
    </div>
    <div class="stars" id="stars-${index}" style="text-align:center; margin-top:8px;">
      <span data-val="1">&#9733;</span>
      <span data-val="2">&#9733;</span>
      <span data-val="3">&#9733;</span>
      <span data-val="4">&#9733;</span>
      <span data-val="5">&#9733;</span>
    </div>
    <div style="text-align:center; margin-top:12px;">
      <button class="primary" id="read-${index}">Read Now</button>
    </div>
    <div class="slideshow" id="slideshow-${index}" style="display:none; margin-top:12px;"></div>
  `;

  const stars = detailContent.querySelectorAll(`#stars-${index} span`);
  stars.forEach(star => {
    star.onclick = () => {
      stars.forEach(s => s.classList.remove('active'));
      const val = Number(star.dataset.val);
      for (let i = 0; i < val; i++) stars[i].classList.add('active');
    };
  });

  const readBtn = document.getElementById(`read-${index}`);
  const slideshow = document.getElementById(`slideshow-${index}`);
  readBtn.onclick = () => {
    if (!m.pages || m.pages.length === 0) { alert('No pages available'); return; }
    let current = 0;
    slideshow.style.display = 'block';
    function renderPage() {
      slideshow.innerHTML = `
        <img src="${m.pages[current]}" alt="page ${current+1}">
        <div class="slideshow-controls">
          <button id="prevPage">Prev</button>
          <button id="nextPage">Next</button>
        </div>
        <div class="page-counter">Page ${current+1} of ${m.pages.length}</div>
      `;
      const prev = document.getElementById('prevPage');
      const next = document.getElementById('nextPage');
      prev.onclick = () => { if (current > 0) { current--; renderPage(); } };
      next.onclick = () => { if (current < m.pages.length - 1) { current++; renderPage(); } };
    }
    renderPage();
  };

  detailModal.style.display = 'flex';
}

/* Upload handler */
submitManga.onclick = async () => {
  try {
    if (!loggedIn) { alert('Please login first'); return; }
    const name = document.getElementById('mangaName').value.trim();
    const desc = document.getElementById('mangaDesc').value.trim();
    const tagsRaw = document.getElementById('mangaTags').value;
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    const thumbFile = document.getElementById('thumbnail').files[0];
    if (!name || !thumbFile) { alert('Thumbnail and Name required'); return; }

    const pngInputs = Array.from(document.querySelectorAll('.manga-png'));
    let allFiles = [];
    pngInputs.forEach(inp => { if (inp.files && inp.files.length) allFiles.push(...Array.from(inp.files)); });

    if (allFiles.length === 0) { alert('Add at least one page'); return; }
    if (allFiles.length > MAX_PAGES) { alert('Too many pages'); return; }

    submitManga.disabled = true;
    submitManga.textContent = 'Uploading...';

    await uploadMangaToImgbb({ thumbnailFile: thumbFile, pageFiles: allFiles, name, desc, tags });

    renderManga();

    document.getElementById('mangaName').value = '';
    document.getElementById('mangaDesc').value = '';
    document.getElementById('mangaTags').value = '';
    document.getElementById('thumbnail').value = '';
    pngInputsContainer.innerHTML = '';
    pngInputsContainer.appendChild(createPngRow());

    alert('Upload complete');
  } catch (err) {
    console.error(err);
    alert('Upload failed: ' + (err.message || err));
  } finally {
    submitManga.disabled = false;
    submitManga.textContent = 'Upload';
  }
};

cancelUpload.onclick = () => uploadModal.style.display = 'none';
openUploadModal.onclick = () => {
  if (!loggedIn) { alert('Please login first'); return; }
  uploadModal.style.display = 'flex';
};
closeUpload.onclick = () => uploadModal.style.display = 'none';
closeDetail.onclick = () => detailModal.style.display = 'none';

/* Search */
searchBar.addEventListener('input', () => {
  const q = searchBar.value.trim().toLowerCase();
  const cards = Array.from(listContainer.children);
  cards.forEach(card => {
    const title = card.querySelector('h3').innerText.toLowerCase();
    card.style.display = title.includes(q) ? '' : 'none';
  });
});

/* Start button */
document.getElementById('startBtn').onclick = () => window.scrollTo({ top: document.body.scrollHeight/4, behavior: 'smooth' });

/* Close modals by clicking outside */
window.addEventListener('click', (e) => {
  if (e.target === loginModal) loginModal.style.display = 'none';
  if (e.target === uploadModal) uploadModal.style.display = 'none';
  if (e.target === detailModal) detailModal.style.display = 'none';
});

/* Initial render */
renderManga();
