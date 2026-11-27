// firebase-sync.js — סנכרון התקדמות לפי קוד פשוט (ללא Google) מול IndexedDB ('bagrut' / 'kv' / 'progress')

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
let pushTimer = null;
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

async function syncPush() {
  if (!activeCode) return;
  const localMap = await readProgress();
  const localDone = getDoneMap(localMap);
  const ref = doc(db, "syncCodes", activeCode);
  const snap = await getDoc(ref);
  const cloudDone = snap.exists() ? (snap.data().done || {}) : {};

  // מאחד את מה שבוצע כך שהכמות מצטברת בין המכשירים
  const unionDone = { ...cloudDone, ...localDone };
  const mergedMap = mergeDone(unionDone, localMap);

  if (sigOf(getDoneMap(mergedMap)) !== sigOf(localDone)) {
    applyingRemote = true;
    await writeProgress(mergedMap);
    if (window.S) window.S.progress = mergedMap;
    applyingRemote = false;
    if (typeof window.refresh === "function") window.refresh();
  }

  lastSig = sigOf(unionDone);
  await setDoc(ref, {
    code: activeCode,
    done: unionDone,
    doneCount: Object.keys(unionDone).length,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

function schedulePush() {
  if (!activeCode || applyingRemote) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    syncPush().catch(err => console.warn("syncPush:", err));
  }, 500);
}

function setCode(code) {
  const clean = (code || "").trim().toUpperCase();
  if (unsub) { unsub(); unsub = null; }
  activeCode = clean;

  if (!clean) {
    localStorage.removeItem(CODE_KEY);
    renderCodeBtn();
    return;
  }

  localStorage.setItem(CODE_KEY, clean);
  renderCodeBtn();
  syncPush().catch(() => {});

  const ref = doc(db, "syncCodes", clean);
  unsub = onSnapshot(ref, async (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    const cloudDone = snap.data().done || {};
    const localMap = await readProgress();
    const localDone = getDoneMap(localMap);
    const unionDone = { ...localDone, ...cloudDone };
    const s = sigOf(unionDone);

    if (s === lastSig && s === sigOf(localDone)) return;
    lastSig = s;

    applyingRemote = true;
    const mergedMap = mergeDone(unionDone, localMap);
    await writeProgress(mergedMap);
    if (window.S) window.S.progress = mergedMap;
    applyingRemote = false;

    if (typeof window.refresh === "function") window.refresh();

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

window.addEventListener("bagrut-local-progress-changed", schedulePush);

const wrap = document.createElement("div");
wrap.id = "bg-code-sync";
wrap.style.cssText = "position:fixed;bottom:14px;left:14px;z-index:9998;font:14px system-ui,sans-serif;direction:rtl";
document.body.appendChild(wrap);

function renderCodeBtn() {
  wrap.innerHTML = "";
  const btn = document.createElement("button");
  btn.style.cssText = "border:0;border-radius:999px;padding:9px 14px;background:#4F46E5;color:#fff;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.28);font-weight:600";
  btn.textContent = activeCode ? `קוד: ${activeCode}` : "חיבור עם קוד";
  btn.onclick = () => {
    const input = prompt("הזן קוד סנכרון (למשל 571-TEST) כדי לסנכרן מה שבוצע בין מכשירים. השאר ריק לניתוק:", activeCode || "571-");
    if (input === null) return;
    setCode(input);
  };
  wrap.appendChild(btn);
}

renderCodeBtn();
if (activeCode) setCode(activeCode);
