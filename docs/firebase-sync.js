// firebase-sync.js — סנכרון לייב מיידי לפי קוד (למחשב ולטלפון), מתוך ההגדרות

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
const CODE_KEY = "bagrut_sync_code";

let activeCode = (localStorage.getItem(CODE_KEY) || "").trim().toUpperCase();
let unsub = null;
let applyingRemote = false;
let lastSig = "";

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function readProgress() {
  const database = await openDB();
  return new Promise((res, rej) => {
    const tx = database.transaction(STORE_NAME, "readonly");
    const q = tx.objectStore(STORE_NAME).get(PROGRESS_KEY);
    q.onsuccess = () => res(q.result && typeof q.result === "object" ? q.result : {});
    q.onerror = () => rej(q.error);
  });
}

async function writeProgress(map) {
  const database = await openDB();
  return new Promise((res, rej) => {
    const tx = database.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(map, PROGRESS_KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

function getDoneMap(progressMap) {
  const done = {};
  for (const [k, v] of Object.entries(progressMap || {})) {
    if (v && v.done) done[k] = true;
  }
  return done;
}

function mergeDone(doneUnion, baseMap) {
  const next = { ...(baseMap || {}) };
  for (const k of Object.keys(doneUnion || {})) {
    if (doneUnion[k]) {
      const prev = next[k] || { done: false, note: "", img: false, pdfPage: null };
      next[k] = { ...prev, done: true };
    }
  }
  return next;
}

const sigOf = obj => Object.keys(obj || {}).filter(k => obj[k]).sort().join("|");

function applyMapToApp(map) {
  if (window.S) {
    window.S.progress = map;
  }
  if (typeof window.refresh === "function") {
    window.refresh();
  }
}

async function syncNow() {
  if (!activeCode) return;
  const localMap = (window.S && window.S.progress) ? window.S.progress : await readProgress();
  const localDone = getDoneMap(localMap);
  const ref = doc(db, "syncCodes", activeCode);
  const snap = await getDoc(ref);
  const cloudDone = snap.exists() ? (snap.data().done || {}) : {};

  // מאחד את השאלות שבוצעו מכל מכשיר כדי להוסיף לכמות הקיימת
  const unionDone = { ...cloudDone, ...localDone };
  const mergedMap = mergeDone(unionDone, localMap);

  applyingRemote = true;
  await writeProgress(mergedMap);
  applyMapToApp(mergedMap);
  applyingRemote = false;

  const s = sigOf(unionDone);
  lastSig = s;

  await setDoc(ref, {
    code: activeCode,
    done: unionDone,
    doneCount: Object.keys(unionDone).length,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

function connectCode(code) {
  const clean = (code || "").trim().toUpperCase();
  if (unsub) { unsub(); unsub = null; }
  activeCode = clean;

  if (!clean) {
    localStorage.removeItem(CODE_KEY);
    lastSig = "";
    return;
  }

  localStorage.setItem(CODE_KEY, clean);

  // סנכרון מיידי ברגע שמחברים קוד
  syncNow().catch(err => console.warn("Immediate sync error:", err));

  const ref = doc(db, "syncCodes", clean);
  unsub = onSnapshot(ref, async (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    const cloudDone = snap.data().done || {};
    const localMap = (window.S && window.S.progress) ? window.S.progress : await readProgress();
    const localDone = getDoneMap(localMap);
    const unionDone = { ...localDone, ...cloudDone };
    const s = sigOf(unionDone);

    if (s === lastSig && sigOf(cloudDone) === lastSig) return;
    lastSig = s;

    applyingRemote = true;
    const mergedMap = mergeDone(unionDone, localMap);
    await writeProgress(mergedMap);
    applyMapToApp(mergedMap);
    applyingRemote = false;

    if (sigOf(cloudDone) !== s) {
      await setDoc(ref, {
        code: clean,
        done: unionDone,
        doneCount: Object.keys(unionDone).length,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {});
    }
  });
}

// דחיפה מיידית כשמסמנים/מבטלים שאלה באפליקציה
window.addEventListener("bagrut-local-progress-changed", () => {
  if (!activeCode || applyingRemote) return;
  syncNow().catch(err => console.warn("Push change error:", err));
});

// האזנה לקוד שמוזן מתוך ההגדרות (במחשב ובטלפון)
window.addEventListener("bagrut-set-sync-code", (e) => {
  connectCode(e.detail || "");
});

window.getBagrutSyncCode = () => activeCode;

if (activeCode) {
  connectCode(activeCode);
}
