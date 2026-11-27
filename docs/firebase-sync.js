// firebase-sync.js — סנכרון התקדמות לפי קוד מול IndexedDB ('bagrut' / 'kv' / 'progress')

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

// ---- state = { key: { done: bool, ts: ms } } ; הרשומה העדכנית (ts) מנצחת ----
function getStateMap(progressMap) {
  const st = {};
  for (const [k, v] of Object.entries(progressMap || {})) {
    if (v && (v.done || v.ts)) st[k] = { done: !!v.done, ts: v.ts || 0 };
  }
  return st;
}

function readCloud(data) {
  if (data.state) return data.state;
  const st = {};
  for (const k of Object.keys(data.done || {})) {
    if (data.done[k]) st[k] = { done: true, ts: 0 };
  }
  return st;
}

function mergeState(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) {
    const o = out[k];
    if (!o || v.ts > o.ts || (v.ts === o.ts && v.done && !o.done)) out[k] = v;
  }
  return out;
}

function applyState(state, baseMap) {
  const next = { ...(baseMap || {}) };
  for (const [k, v] of Object.entries(state)) {
    const prev = next[k] || { done: false, note: "", img: false, pdfPage: null };
    next[k] = { ...prev, done: v.done, ts: v.ts };
  }
  return next;
}

const sigOf = st =>
  Object.keys(st || {}).sort().map(k => k + ":" + (st[k].done ? 1 : 0) + ":" + st[k].ts).join("|");
const countDone = st => Object.values(st).filter(v => v.done).length;

async function currentProgress() {
  await (window.bagrutReady || Promise.resolve());
  return (window.S && window.S.progress) || await readProgress();
}

function applyToUI(map) {
  if (window.S) window.S.progress = map;
  if (typeof window.refresh === "function") window.refresh();
}

async function reconcile(ref, code, localMap, localState, cloudState) {
  const merged = mergeState(localState, cloudState);
  const s = sigOf(merged);
  if (s !== sigOf(localState)) {
    applyingRemote = true;
    try {
      const m = applyState(merged, localMap);
      await writeProgress(m);
      applyToUI(m);
    } finally {
      applyingRemote = false;
    }
  }
  if (s !== sigOf(cloudState)) {
    await setDoc(ref, {
      code, state: merged, doneCount: countDone(merged), updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  return merged;
}

async function syncNow(showStatus = false) {
  if (!currentCode) return;
  const code = currentCode;
  try {
    const localMap = await currentProgress();
    const ref = doc(db, "syncCodes", code);
    const snap = await getDoc(ref);
    const cloudState = snap.exists() ? readCloud(snap.data()) : {};
    const merged = await reconcile(ref, code, localMap, getStateMap(localMap), cloudState);
    if (showStatus) notify(`מחובר לקוד ${code} (${countDone(merged)} שאלות)`);
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
    if (showStatus) notify("הסנכרון בקוד נותק");
    return;
  }

  localStorage.setItem(CODE_KEY, clean);
  syncNow(showStatus);

  const ref = doc(db, "syncCodes", clean);
  unsub = onSnapshot(ref, async (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    try {
      const localMap = await currentProgress();
      await reconcile(ref, clean, localMap, getStateMap(localMap), readCloud(snap.data()));
    } catch (e) {
      console.warn("snapshot sync failed:", e);
    }
  }, (err) => console.warn("onSnapshot error:", err));
}

let syncTimer;
window.addEventListener("bagrut-local-progress-changed", () => {
  if (!currentCode || applyingRemote) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(false), 400);
});

window.addEventListener("bagrut-set-sync-code", (e) => connectCode(e.detail || "", true));

window.getBagrutSyncCode = () => currentCode;

if (currentCode) connectCode(currentCode, false);
