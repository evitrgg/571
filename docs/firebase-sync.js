// firebase-sync.js — סנכרון התקדמות לפי קוד (ללא כפתור צף) מול IndexedDB ('bagrut' / 'kv' / 'progress')

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

// הסרת אלמנטים ישנים של כפתורים צפים אם קיימים
for (const oldId of ["bg-badge", "bg-panel", "bg-admin", "bg-code-sync", "bg-code-badge"]) {
  const el = document.getElementById(oldId);
  if (el) el.remove();
}

const DB_NAME = "bagrut";
const STORE_NAME = "kv";
const PROGRESS_KEY = "progress";
const CODE_KEY = "bagrut_sync_code";

let currentCode = (localStorage.getItem(CODE_KEY) || "").trim().toUpperCase();
let unsub = null;
let applyingRemote = false;
let lastSig = "";

function notify(msg) {
  if (typeof window.toast === "function") window.toast(msg);
  else console.log("[sync]", msg);
}

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

function applyToUI(map) {
  if (window.S) window.S.progress = map;
  if (typeof window.refresh === "function") window.refresh();
}

async function syncNow(showStatus = false) {
  if (!currentCode) return;
  try {
    const localMap = (window.S && window.S.progress) ? window.S.progress : await readProgress();
    const localDone = getDoneMap(localMap);
    const ref = doc(db, "syncCodes", currentCode);
    const snap = await getDoc(ref);
    const cloudDone = snap.exists() ? (snap.data().done || {}) : {};

    const unionDone = { ...cloudDone, ...localDone };
    const mergedMap = mergeDone(unionDone, localMap);

    applyingRemote = true;
    await writeProgress(mergedMap);
    applyToUI(mergedMap);
    applyingRemote = false;

    const s = sigOf(unionDone);
    lastSig = s;

    await setDoc(ref, {
      code: currentCode,
      done: unionDone,
      doneCount: Object.keys(unionDone).length,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    if (showStatus) {
      notify(`מחובר לקוד ${currentCode} (${Object.keys(unionDone).length} שאלות)`);
    }
  } catch (err) {
    console.warn("syncNow failed:", err);
    if (showStatus) notify("שגיאה בחיבור לסנכרון — בדוק חיבור וכללי Firestore");
  }
}

function connectCode(rawCode, showStatus = false) {
  const clean = (rawCode || "").trim().toUpperCase();
  if (unsub) { unsub(); unsub = null; }
  currentCode = clean;

  if (!clean) {
    localStorage.removeItem(CODE_KEY);
    lastSig = "";
    if (showStatus) notify("הסנכרון בקוד נותק");
    return;
  }

  localStorage.setItem(CODE_KEY, clean);
  syncNow(showStatus);

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
    applyToUI(mergedMap);
    applyingRemote = false;

    if (sigOf(cloudDone) !== s) {
      await setDoc(ref, {
        code: clean,
        done: unionDone,
        doneCount: Object.keys(unionDone).length,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {});
    }
  }, (err) => {
    console.warn("onSnapshot error:", err);
  });
}

window.addEventListener("bagrut-local-progress-changed", () => {
  if (!currentCode || applyingRemote) return;
  syncNow(false);
});

window.addEventListener("bagrut-set-sync-code", (e) => {
  connectCode(e.detail || "", true);
});

window.getBagrutSyncCode = () => currentCode;

if (currentCode) {
  connectCode(currentCode, false);
}
