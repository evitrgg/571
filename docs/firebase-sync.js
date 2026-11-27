// firebase-sync.js — סנכרון התקדמות לפי קוד פשוט (ללא התחברות Google) מול IndexedDB ('bagrut' / 'kv' / 'progress')

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAvIq3dw6DZHF3HFXHuPa1H_NqjyVjsmuk",
  authDomain: "bagrut571-8402c.firebaseapp.com",
  projectId: "bagrut571-8402c",
  storageBucket: "bagrut571-8402c.firebasestorage.app",
  messagingSenderId: "535274045619",
  appId: "1:535274045619:web:c06827269b395b564b70c6",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const DB_NAME = "bagrut";
const STORE_NAME = "kv";
const PROGRESS_KEY = "progress";
const CODE_STORAGE_KEY = "bagrut_sync_code";

let currentCode = (localStorage.getItem(CODE_STORAGE_KEY) || "").trim().toUpperCase();
let unsub = null;
let applyingRemote = false;
let pushTimer = null;
let lastSignature = "";

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function readLocalProgress() {
  const database = await openDB();
  return new Promise((res, rej) => {
    const tx = database.transaction(STORE_NAME, "readonly");
    const q = tx.objectStore(STORE_NAME).get(PROGRESS_KEY);
    q.onsuccess = () => res(q.result && typeof q.result === "object" ? q.result : {});
    q.onerror = () => rej(q.error);
  });
}

async function writeLocalProgress(map) {
  const database = await openDB();
  return new Promise((res, rej) => {
    const tx = database.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(map, PROGRESS_KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// מחזיר מפה של { "exam|key": true } עבור כל השאלות שבוצעו
function extractDone(progressMap) {
  const done = {};
  for (const [id, val] of Object.entries(progressMap || {})) {
    if (val && val.done) done[id] = true;
  }
  return done;
}

// מאחד שאלות שבוצעו מכל צד (כך שמה שבוצע בחלקים השונים מצטבר ונשמר)
function mergeDoneIntoProgress(doneUnion, existingMap) {
  const next = { ...(existingMap || {}) };
  for (const id of Object.keys(doneUnion || {})) {
    if (doneUnion[id]) {
      const prev = next[id] || { done: false, note: "", img: false, pdfPage: null };
      next[id] = { ...prev, done: true };
    }
  }
  return next;
}

function signature(doneObj) {
  return Object.keys(doneObj || {}).filter(k => doneObj[k]).sort().join("|");
}

function syncUIState() {
  if (typeof window.S !== "undefined") {
    readLocalProgress().then(map => {
      window.S.progress = map;
      if (typeof window.refresh === "function") window.refresh();
    });
  } else if (typeof window.refresh === "function") {
    window.refresh();
  }
}

async function pushNow() {
  if (!currentCode) return;
  const localMap = await readLocalProgress();
  const localDone = extractDone(localMap);
  const ref = doc(db, "syncCodes", currentCode);
  const snap = await getDoc(ref);
  const cloudDone = snap.exists() ? (snap.data().done || {}) : {};

  // איחוד מה שבוצע מקומית ובענן
  const combinedDone = { ...cloudDone, ...localDone };
  const mergedMap = mergeDoneIntoProgress(combinedDone, localMap);

  if (signature(mergedMap) !== signature(localMap)) {
    applyingRemote = true;
    await writeLocalProgress(mergedMap);
    if (typeof window.S !== "undefined") window.S.progress = mergedMap;
    applyingRemote = false;
    syncUIState();
  }

  const sig = signature(combinedDone);
  lastSignature = sig;
  await setDoc(ref, {
    code: currentCode,
    done: combinedDone,
    doneCount: Object.keys(combinedDone).length,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

function schedulePush() {
  if (!currentCode || applyingRemote) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushNow().catch(err => console.warn("Sync push error:", err));
  }, 600);
}

function connectCode(code) {
  const clean = (code || "").trim().toUpperCase();
  if (unsub) { unsub(); unsub = null; }
  currentCode = clean;
  if (clean) {
    localStorage.setItem(CODE_STORAGE_KEY, clean);
  } else {
    localStorage.removeItem(CODE_STORAGE_KEY);
    renderBadge();
    return;
  }

  renderBadge();
  const ref = doc(db, "syncCodes", clean);
  pushNow().catch(() => {});

  unsub = onSnapshot(ref, async (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    const cloudDone = snap.data().done || {};
    const localMap = await readLocalProgress();
    const localDone = extractDone(localMap);
    const combined = { ...localDone, ...cloudDone };
    const sig = signature(combined);

    if (sig === lastSignature && sig === signature(localDone)) return;
    lastSignature = sig;

    applyingRemote = true;
    const mergedMap = mergeDoneIntoProgress(combined, localMap);
    await writeLocalProgress(mergedMap);
    if (typeof window.S !== "undefined") window.S.progress = mergedMap;
    applyingRemote = false;

    if (typeof window.refresh === "function") {
      window.refresh();
    }

    if (signature(cloudDone) !== sig) {
      await setDoc(ref, {
        code: clean,
        done: combined,
        doneCount: Object.keys(combined).length,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {});
    }
  });
}

window.addEventListener("bagrut-local-progress-changed", schedulePush);

/* ===== כפתור חיבור עם קוד (בלי Google) ===== */
const badge = document.createElement("div");
badge.id = "bg-code-badge";
badge.style.cssText = "position:fixed;bottom:14px;left:14px;z-index:9998;font:14px system-ui,sans-serif;direction:rtl";
document.body.appendChild(badge);

function renderBadge() {
  badge.innerHTML = "";
  const btn = document.createElement("button");
  btn.style.cssText = "border:0;border-radius:20px;padding:9px 14px;background:#4F46E5;color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)";
  btn.textContent = currentCode ? `קוד: ${currentCode}` : "סנכרון בקוד";
  btn.onclick = () => {
    const val = prompt(
      "הזן קוד סנכרון (אותו קוד בטלפון ובמחשב). השאר ריק לניתוק:",
      currentCode || "571-"
    );
    if (val === null) return;
    connectCode(val.trim().toUpperCase());
  };
  badge.appendChild(btn);
}

renderBadge();
if (currentCode) connectCode(currentCode);
