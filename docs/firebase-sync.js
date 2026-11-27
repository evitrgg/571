// firebase-sync.js — התחברות עם Google, סנכרון התקדמות בין מכשירים ופאנל מנהל נסתר.
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
  // המפתח ב-localStorage שבו האפליקציה שומרת את ההתקדמות
  storageKey: "REPLACE_ME",
  // כמה שאלות יש בסך הכל (לחישוב אחוזים בייצוא). 0 = לא לחשב אחוז
  totalQuestions: 0,
  // האלמנט שלוחצים עליו 5 פעמים כדי לחשוף את כפתור המנהל
  adminTapTarget: "h1",
  adminTaps: 5,
};

// מתאמים: איך ההתקדמות נראית ב-localStorage.
// ברירת מחדל: אובייקט JSON מהצורה { "questionId": true, ... }
function toDone(raw) {
  // raw = המחרוזת מ-localStorage  ->  { id: true }
  try {
    const obj = JSON.parse(raw || "{}");
    const done = {};
    for (const k in obj) if (obj[k]) done[k] = true;
    return done;
  } catch { return {}; }
}
function fromDone(done, rawOld) {
  // { id: true } -> מחרוזת לשמירה ב-localStorage
  return JSON.stringify(done);
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

const rawSetItem = Storage.prototype.setItem;
const readRaw = () => localStorage.getItem(CFG.storageKey);
const sameDone = (a, b) => JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort());
const userRef = () => doc(db, "users", user.uid);

// כל שינוי של האפליקציה ב-localStorage מפעיל דחיפה לענן (בלי לשנות את קוד האפליקציה)
Storage.prototype.setItem = function (k, v) {
  rawSetItem.call(this, k, v);
  if (this === localStorage && k === CFG.storageKey && !applyingRemote) schedulePush();
};

function schedulePush() {
  if (!user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 800);
}

async function push() {
  if (!user) return;
  const done = toDone(readRaw());
  try {
    await updateDoc(userRef(), { done, doneCount: Object.keys(done).length, lastSeen: serverTimestamp() });
  } catch (e) { console.warn("sync push failed", e); }
}

function applyRemote(done) {
  applyingRemote = true;
  rawSetItem.call(localStorage, CFG.storageKey, fromDone(done, readRaw()));
  applyingRemote = false;
  // אם האפליקציה מאזינה לאירוע ומבצעת preventDefault — היא מרעננת את עצמה.
  // אחרת נרענן את הדף פעם אחת בלבד לכל סשן.
  const ev = new CustomEvent("bagrut-progress-updated", { cancelable: true, detail: { done } });
  const handled = !window.dispatchEvent(ev);
  if (!handled && !sessionStorage.getItem("bagrut_reloaded")) {
    sessionStorage.setItem("bagrut_reloaded", "1");
    location.reload();
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
  unsub = onSnapshot(userRef(), (snap) => {
    if (snap.metadata.hasPendingWrites || !snap.exists()) return;
    const cloud = snap.data().done || {};
    const local = toDone(readRaw());
    if (!localStorage.getItem(flag)) {
      // התחברות ראשונה במכשיר הזה: איחוד, כדי לא לאבד כלום
      const merged = { ...cloud, ...local };
      rawSetItem.call(localStorage, flag, "1");
      if (!sameDone(merged, local)) applyRemote(merged);
      if (!sameDone(merged, cloud)) updateDoc(userRef(), { done: merged, doneCount: Object.keys(merged).length, lastSeen: serverTimestamp() });
      return;
    }
    if (!sameDone(cloud, local)) applyRemote(cloud);
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

/* ============================ UI ============================ */
const css = document.createElement("style");
css.textContent = `
#bg-badge{position:fixed;bottom:14px;left:14px;z-index:9998;font:14px system-ui,sans-serif;direction:rtl}
#bg-badge button{border:0;border-radius:20px;padding:9px 14px;background:#2563eb;color:#fff;cursor:pointer;box-shadow:0 2px 8px #0003}
#bg-panel{position:fixed;bottom:60px;left:14px;z-index:9998;background:#fff;color:#111;border-radius:12px;padding:12px;box-shadow:0 4px 20px #0004;direction:rtl;font:14px system-ui,sans-serif;display:flex;flex-direction:column;gap:8px;min-width:190px}
#bg-panel button{border:1px solid #ddd;background:#f8f8f8;border-radius:8px;padding:8px;cursor:pointer}
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
  if (isAdmin && adminRevealed) mk("📊 פאנל מנהל", openAdmin);
  document.body.appendChild(panel);
}

// חשיפת כפתור המנהל: 5 לחיצות מהירות על הכותרת
(function () {
  let taps = 0, t;
  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest(CFG.adminTapTarget)) return;
    taps++; clearTimeout(t); t = setTimeout(() => (taps = 0), 1500);
    if (taps >= CFG.adminTaps) { taps = 0; if (isAdmin) { adminRevealed = true; togglePanel(); closePanel(); togglePanel(); } }
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
