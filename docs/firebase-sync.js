// firebase-sync.js — התחברות עם Google, סנכרון התקדמות (IndexedDB), ייצוא/ייבוא Excel של בגרויות ופאנל מנהל נסתר.
// שימוש: <script type="module" src="firebase-sync.js"></script> (בסוף ה-body ב-index.html)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, signOut, deleteUser,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
  collection, getDocs, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ====================== הגדרות — לשנות כאן ====================== */
const CFG = {
  dbName: "bagrut",
  storeName: "kv",
  progressKey: "progress",
  totalQuestions: typeof CATALOG !== "undefined"
    ? CATALOG.reduce((sum, e) => sum + (e.keys ? e.keys.length : 0), 0)
    : 0,
  adminTapTarget: "h1",
  adminTaps: 5,
};

function openKV() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(CFG.dbName, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(CFG.storeName);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function readProgressMap() {
  const db = await openKV();
  return new Promise((res, rej) => {
    const tx = db.transaction(CFG.storeName, "readonly");
    const q = tx.objectStore(CFG.storeName).get(CFG.progressKey);
    q.onsuccess = () => res(q.result && typeof q.result === "object" ? q.result : {});
    q.onerror = () => rej(q.error);
  });
}

async function writeProgressMap(map) {
  const db = await openKV();
  return new Promise((res, rej) => {
    const tx = db.transaction(CFG.storeName, "readwrite");
    tx.objectStore(CFG.storeName).put(map, CFG.progressKey);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// מתאמים: מפת ההתקדמות ב-IndexedDB ({ "exam|key": { done, note, img, pdfPage } }) <-> { "exam|key": true }
function toDone(progressMap) {
  const done = {};
  for (const [k, v] of Object.entries(progressMap || {})) {
    if (v && v.done) done[k] = true;
  }
  return done;
}

function fromDone(doneObj, existingMap = {}) {
  const next = { ...existingMap };
  for (const k of Object.keys(next)) {
    if (!doneObj[k] && next[k]) {
      next[k] = { ...next[k], done: false };
    }
  }
  for (const k of Object.keys(doneObj || {})) {
    if (doneObj[k]) {
      const prev = next[k] || { note: "", img: false, pdfPage: null };
      next[k] = { ...prev, done: true };
    }
  }
  return next;
}
/* =============================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyAvIq3dw6DZHF3HFXHuPa1H_NqjyVjsmuk",
  authDomain: "bagrut571-8402c.firebaseapp.com",
  projectId: "bagrut571-8402c",
  storageBucket: "bagrut571-8402c.firebasestorage.app",
  messagingSenderId: "535274045619",
  appId: "1:535274045619:web:c06827269b395b564b70c6",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let user = null;
let isAdmin = false;
let adminRevealed = false;
let unsub = null;
let applyingRemote = false;
let pushTimer = null;

const sameDone = (a, b) => JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort());
const userRef = () => doc(db, "users", user.uid);

window.addEventListener("bagrut-local-progress-changed", () => {
  if (!applyingRemote) schedulePush();
});

function schedulePush() {
  if (!user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 800);
}

async function push() {
  if (!user) return;
  const map = await readProgressMap();
  const done = toDone(map);
  try {
    await updateDoc(userRef(), { done, doneCount: Object.keys(done).length, lastSeen: serverTimestamp() });
  } catch (e) { console.warn("sync push failed", e); }
}

async function applyRemote(done) {
  applyingRemote = true;
  const current = await readProgressMap();
  const nextMap = fromDone(done, current);
  await writeProgressMap(nextMap);
  if (typeof window.S !== "undefined") {
    window.S.progress = nextMap;
  }
  applyingRemote = false;

  if (typeof window.refresh === "function") {
    window.refresh();
  } else {
    const ev = new CustomEvent("bagrut-progress-updated", { cancelable: true, detail: { done, progress: nextMap } });
    const handled = !window.dispatchEvent(ev);
    if (!handled && !sessionStorage.getItem("bagrut_reloaded")) {
      sessionStorage.setItem("bagrut_reloaded", "1");
      location.reload();
    }
  }
}

async function ensureProfile(u) {
  const snap = await getDoc(doc(db, "users", u.uid));
  if (!snap.exists()) {
    let grade = (prompt("באיזו שכבה אתה? (למשל י\"ב 2027)") || "").trim().slice(0, 40);
    await setDoc(doc(db, "users", u.uid), {
      name: u.displayName || "", email: u.email || "", grade,
      createdAt: serverTimestamp(), lastSeen: serverTimestamp(),
      done: {}, doneCount: 0,
    });
  }
}

function startSync() {
  if (unsub) unsub();
  const flag = "bagrut_synced_" + user.uid;
  unsub = onSnapshot(userRef(), async (snap) => {
    if (snap.metadata.hasPendingWrites || !snap.exists()) return;
    const cloud = snap.data().done || {};
    const localMap = await readProgressMap();
    const local = toDone(localMap);
    if (!localStorage.getItem(flag)) {
      const merged = { ...cloud, ...local };
      localStorage.setItem(flag, "1");
      if (!sameDone(merged, local)) await applyRemote(merged);
      if (!sameDone(merged, cloud)) await updateDoc(userRef(), { done: merged, doneCount: Object.keys(merged).length, lastSeen: serverTimestamp() });
      return;
    }
    if (!sameDone(cloud, local)) await applyRemote(cloud);
  });
}

onAuthStateChanged(auth, async (u) => {
  user = u;
  isAdmin = false;
  if (unsub) { unsub(); unsub = null; }
  if (u) {
    await ensureProfile(u);
    try { isAdmin = (await getDoc(doc(db, "admins", u.uid))).exists(); } catch {}
    startSync();
  }
  renderBadge();
});

async function login() {
  const provider = new GoogleAuthProvider();
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")
      await signInWithRedirect(auth, provider);
    else if (e.code !== "auth/popup-closed-by-user") alert("ההתחברות נכשלה: " + e.code);
  }
}

async function deleteAccount() {
  if (!confirm("למחוק את החשבון וההתקדמות שלך מהענן? ההתקדמות במכשיר הזה תישאר.")) return;
  try {
    await setDoc(doc(db, "deletedUsers", user.uid), { name: user.displayName || "", at: serverTimestamp() });
    await deleteDoc(doc(db, "users", user.uid));
    await deleteUser(user);
  } catch (e) {
    if (e.code === "auth/requires-recent-login") { await signOut(auth); alert("התחבר שוב ונסה למחוק שוב."); }
    else alert("המחיקה נכשלה: " + e.code);
  }
}

/* ====== ייצוא / ייבוא טבלת Excel (CSV) של הבגרויות בלבד ====== */
async function exportBagrutOnlyCSV() {
  const map = await readProgressMap();
  const exams = typeof CATALOG !== "undefined" ? CATALOG.filter(e => e.source === "בגרויות") : [];
  const rows = [["מזהה_מבחן", "שם_מבחן", "שאלה", "סטטוס", "הערה"]];
  for (const e of exams) {
    for (const k of (e.keys || [])) {
      const item = map[e.id + "|" + k] || {};
      rows.push([
        e.id,
        e.title || "",
        k,
        item.done ? "בוצע" : "לא בוצע",
        item.note || ""
      ]);
    }
  }
  const csv = "\uFEFF" + rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "bagrut-exams-progress.csv";
  a.click();
}

function importBagrutOnlyCSV() {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = ".csv,text/csv";
  inp.onchange = async () => {
    const file = inp.files && inp.files[0];
    if (!file) return;
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).filter(Boolean);
    const map = await readProgressMap();
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(",");
      const clean = cols.map(c => c.replace(/^"|"$/g, "").replace(/""/g, '"').trim());
      const [examId, , qKey, status, note] = clean;
      if (!examId || !qKey) continue;
      const id = examId + "|" + qKey;
      const prev = map[id] || { done: false, note: "", img: false, pdfPage: null };
      map[id] = {
        ...prev,
        done: status === "בוצע" || status === "כן" || status === "1" || status.toLowerCase() === "true",
        note: note !== undefined ? note : prev.note
      };
    }
    await applyRemote(toDone(map));
    await writeProgressMap(map);
    if (typeof window.S !== "undefined") window.S.progress = map;
    if (typeof window.refresh === "function") window.refresh();
    alert("הייבוא מקובץ ה-CSV הושלם.");
  };
  inp.click();
}

/* ============================ UI ============================ */
const css = document.createElement("style");
css.textContent = `
#bg-badge{position:fixed;bottom:14px;left:14px;z-index:9998;font:14px system-ui,sans-serif;direction:rtl}
#bg-badge button{border:0;border-radius:20px;padding:9px 14px;background:#2563eb;color:#fff;cursor:pointer;box-shadow:0 2px 8px #0003}
#bg-panel{position:fixed;bottom:60px;left:14px;z-index:9998;background:#fff;color:#111;border-radius:12px;padding:12px;box-shadow:0 4px 20px #0004;direction:rtl;font:14px system-ui,sans-serif;display:flex;flex-direction:column;gap:8px;min-width:210px}
#bg-panel button{border:1px solid #ddd;background:#f8f8f8;border-radius:8px;padding:8px;cursor:pointer;text-align:right}
#bg-admin{position:fixed;inset:0;z-index:9999;background:#fff;color:#111;overflow:auto;padding:16px;direction:rtl;font:14px system-ui,sans-serif}
#bg-admin table{border-collapse:collapse;width:100%;margin-top:12px}
#bg-admin th,#bg-admin td{border:1px solid #ddd;padding:6px 8px;text-align:right;white-space:nowrap}
#bg-admin .wrap{overflow-x:auto}
#bg-admin .cards{display:flex;gap:10px;flex-wrap:wrap}
#bg-admin .card{background:#f1f5f9;border-radius:10px;padding:10px 16px}
#bg-admin .card b{display:block;font-size:22px}
`;
document.head.appendChild(css);

const badge = document.createElement("div");
badge.id = "bg-badge";
document.body.appendChild(badge);
let panel = null;

function closePanel() { if (panel) { panel.remove(); panel = null; } }

function renderBadge() {
  closePanel();
  badge.innerHTML = "";
  const b = document.createElement("button");
  if (!user) { b.textContent = "התחבר לשמירת ההתקדמות"; b.onclick = login; }
  else {
    b.textContent = "☁ " + (user.displayName || "חשבון").split(" ")[0];
    b.onclick = togglePanel;
  }
  badge.appendChild(b);
}

function togglePanel() {
  if (panel) return closePanel();
  panel = document.createElement("div");
  panel.id = "bg-panel";
  const mk = (t, fn) => { const x = document.createElement("button"); x.textContent = t; x.onclick = () => { closePanel(); fn(); }; panel.appendChild(x); };
  mk("סנכרן עכשיו", push);
  mk("התנתק", () => signOut(auth));
  mk("מחק את החשבון שלי", deleteAccount);
  if (adminRevealed) {
    mk("📥 ייצוא Excel (בגרויות בלבד)", exportBagrutOnlyCSV);
    mk("📤 ייבוא Excel (בגרויות בלבד)", importBagrutOnlyCSV);
  }
  if (isAdmin && adminRevealed) mk("📊 פאנל מנהל", openAdmin);
  document.body.appendChild(panel);
}

// חשיפת כלי הייצוא/ייבוא ופאנל המנהל: 5 לחיצות מהירות על הכותרת
(function () {
  let taps = 0, t;
  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest(CFG.adminTapTarget)) return;
    taps++; clearTimeout(t); t = setTimeout(() => (taps = 0), 1500);
    if (taps >= CFG.adminTaps) {
      taps = 0;
      adminRevealed = true;
      if (user) { closePanel(); togglePanel(); }
      else alert("כלי הייצוא והייבוא נחשפו. התחבר לחשבון כדי לפתוח את התפריט.");
    }
  });
})();

/* ========================== פאנל מנהל ========================== */
const fmt = (ts) => (ts && ts.toDate ? ts.toDate().toLocaleDateString("he-IL") : "");

async function openAdmin() {
  if (!isAdmin) return;
  const wrap = document.createElement("div");
  wrap.id = "bg-admin";
  wrap.textContent = "טוען...";
  document.body.appendChild(wrap);

  let users = [], deleted = 0;
  try {
    users = (await getDocs(collection(db, "users"))).docs.map((d) => ({ id: d.id, ...d.data() }));
    deleted = (await getDocs(collection(db, "deletedUsers"))).size;
  } catch (e) { wrap.textContent = "שגיאה בטעינה: " + e.code; return; }

  const now = Date.now(), DAY = 864e5;
  const active7 = users.filter((u) => u.lastSeen?.toDate && now - u.lastSeen.toDate() < 7 * DAY).length;
  const inactive14 = users.filter((u) => !u.lastSeen?.toDate || now - u.lastSeen.toDate() > 14 * DAY).length;
  const avg = users.length ? Math.round(users.reduce((s, u) => s + (u.doneCount || 0), 0) / users.length) : 0;
  const pct = (u) => (CFG.totalQuestions ? Math.round(((u.doneCount || 0) / CFG.totalQuestions) * 100) + "%" : "");

  wrap.innerHTML = "";
  const top = document.createElement("div");
  top.style.cssText = "display:flex;gap:8px;align-items:center;justify-content:space-between";
  const h = document.createElement("h2"); h.textContent = "פאנל מנהל";
  const btns = document.createElement("div");
  const mkb = (t, fn) => { const x = document.createElement("button"); x.textContent = t; x.style.cssText = "margin-inline-start:8px;padding:8px 12px"; x.onclick = fn; btns.appendChild(x); };
  mkb("ייצוא ל-Excel", () => exportCSV(users, pct));
  mkb("סגור", () => wrap.remove());
  top.append(h, btns); wrap.appendChild(top);

  const cards = document.createElement("div"); cards.className = "cards";
  [["נרשמו", users.length], ["פעילים ב-7 ימים", active7], ["לא פעילים 14+ ימים", inactive14],
   ["מחקו חשבון", deleted], ["ממוצע שאלות שבוצעו", avg]].forEach(([l, v]) => {
    const c = document.createElement("div"); c.className = "card";
    const b = document.createElement("b"); b.textContent = v;
    c.append(b, document.createTextNode(l)); cards.appendChild(c);
  });
  wrap.appendChild(cards);

  const box = document.createElement("div"); box.className = "wrap";
  const tbl = document.createElement("table");
  const head = ["שם", "שכבה", "שאלות שבוצעו", "אחוז", "נרשם", "פעילות אחרונה"];
  const tr0 = document.createElement("tr");
  head.forEach((t) => { const th = document.createElement("th"); th.textContent = t; tr0.appendChild(th); });
  tbl.appendChild(tr0);
  users.sort((a, b) => (b.doneCount || 0) - (a.doneCount || 0)).forEach((u) => {
    const tr = document.createElement("tr");
    [u.name, u.grade, u.doneCount || 0, pct(u), fmt(u.createdAt), fmt(u.lastSeen)].forEach((v) => {
      const td = document.createElement("td"); td.textContent = v ?? ""; tr.appendChild(td);
    });
    tbl.appendChild(tr);
  });
  box.appendChild(tbl); wrap.appendChild(box);
}

function exportCSV(users, pct) {
  const qids = [...new Set(users.flatMap((u) => Object.keys(u.done || {})))].sort();
  const rows = [["שם", "אימייל", "שכבה", "נרשם", "פעילות אחרונה", "שאלות שבוצעו", "אחוז", ...qids]];
  users.forEach((u) => rows.push([
    u.name, u.email, u.grade, fmt(u.createdAt), fmt(u.lastSeen), u.doneCount || 0, pct(u),
    ...qids.map((q) => (u.done && u.done[q] ? 1 : "")),
  ]));
  const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "bagrut-progress.csv";
  a.click();
}

renderBadge();
