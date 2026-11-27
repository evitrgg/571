'use strict';
/* ===== מעקב בגרויות 571 — PWA (port of the Android app) ===== */
const SOURCES = ['בגרויות', 'ארכימדס', 'מריאן'];
const SHORT = ['1a', '1b', '1c', '1d'];
const ALL = SHORT.concat(['2', '3', '4', '5', '6', '7', '8']);
const QN = { '1a': '1א · שאלה קצרה', '1b': '1ב · שאלה קצרה', '1c': '1ג · שאלה קצרה', '1d': '1ד · שאלה קצרה', '2': '2 · סדרות', '3': '3 · הסתברות', '4': '4 · גאומטריה', '5': '5 · טריגו במישור', '6': '6 · חקירה', '7': '7 · חקירה', '8': '8 · בעיית קיצון' };
const SN = { '1a': '1א', '1b': '1ב', '1c': '1ג', '1d': '1ד' };
const TC = { '1a': '#14B8A6', '1b': '#06B6D4', '1c': '#0EA5E9', '1d': '#3B82F6', '2': '#6366F1', '3': '#8B5CF6', '4': '#D946EF', '5': '#EC4899', '6': '#F97316', '7': '#F59E0B', '8': '#EF4444' };
QN.short = 'שאלות קצרות (1א–1ד)'; TC.short = '#0EA5E9';
const sn = k => SN[k] || k, tc = k => TC[k] || 'var(--pri)';
const EX = Object.fromEntries(CATALOG.map(e => [e.id, e]));
const IC = {
  back: '<svg viewBox="0 0 24 24"><path d="M4 12h16M14 6l6 6-6 6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>'
};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);

/* ---------- storage (IndexedDB) ---------- */
const idb = new Promise((res, rej) => { const r = indexedDB.open('bagrut', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = (m, f) => idb.then(db => new Promise((res, rej) => { const t = db.transaction('kv', m); const q = f(t.objectStore('kv')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }));
const kv = { get: k => tx('readonly', s => s.get(k)), set: (k, v) => tx('readwrite', s => s.put(v, k)), del: k => tx('readwrite', s => s.delete(k)) };
const S = { progress: {}, links: {}, shifts: {}, settings: { goolUrl: GOOL_URL, offset: 4 }, tab: 0 };
const save = k => kv.set(k, S[k]).catch(() => toast('השמירה נכשלה'));

/* ---------- stats / catalog logic (same as Catalog.kt) ---------- */
const pr = (e, k) => S.progress[e + '|' + k];
const isDone = (e, k) => !!(pr(e, k) && pr(e, k).done);
function counts(exams, only) { let d = 0, t = 0; for (const e of exams) for (const k of e.keys) { if (only && (Array.isArray(only) ? !only.includes(k) : k !== only)) continue; t++; if (isDone(e.id, k)) d++; } return [d, t]; }
const pct = (exams, only) => { const [d, t] = counts(exams, only); return t ? Math.floor(d * 100 / t) : 0; };
const remaining = e => e.keys.filter(k => !isDone(e.id, k));
function pageFor(e, ref, k) {
  const p = pr(e.id, k); if (p && p.pdfPage != null) return p.pdfPage;
  const base = ref.pages[k] != null ? ref.pages[k] : ref.first;
  const delta = ref.estimated && ref.url == null ? (S.shifts[e.id] || 0) : 0;
  return Math.max(1, base + delta);
}
const solKey = e => 'sol:' + e.id;
const solutionFor = e => S.links[solKey(e)] || e.solutionUrl || null;
const solSearch = e => 'https://www.google.com/search?q=' + encodeURIComponent('פתרון מלא מחוון שאלון 571 ' + e.title + ' בגרות מתמטיקה 5 יחידות');
const openUrl = u => window.open(u, '_blank', 'noopener');
function ensure(e, k) { const id = e + '|' + k; return S.progress[id] || (S.progress[id] = { done: false, note: '', img: false, pdfPage: null }); }
function toggle(e, k) { const p = ensure(e, k); p.done = !p.done; save('progress'); refresh(); if (navigator.vibrate) navigator.vibrate(8); }

/* ---------- small UI helpers ---------- */
const ring = (p, d, sw, col, track, inner) => { const r = (d - sw) / 2, c = 2 * Math.PI * r; return `<div class="ring" style="width:${d}px;height:${d}px"><svg width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${sw}"/><circle cx="${d / 2}" cy="${d / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${c * p / 100} ${c}"/></svg><span>${inner}</span></div>`; };
const pbar = (p, col) => `<div class="pb"><i style="width:${p}%;background:${col}"></i></div>`;
const pill = (t, on, a, v = '') => `<button class="pill ${on ? 'on' : ''}" data-a="${a}" data-v="${esc(v)}">${t}</button>`;
const doneBtn = (e, k, d) => `<span class="dn ${d ? 'on' : ''}" data-a="tog" data-e="${e}" data-k="${k}" role="button">${d ? '✓ הושלם' : 'סיימתי'}</span>`;
const topBar = (t, s, extra = '') => `<div class="bar"><button class="ib" data-a="back" aria-label="חזרה">${IC.back}</button><div class="t"><h1>${esc(t)}</h1>${s ? `<div class="sub">${esc(s)}</div>` : ''}</div>${extra}</div>`;
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

/* ---------- layers + history (so the Android back button / swipe works) ---------- */
const root = $('#root'), stack = [];
const home = document.createElement('div'); home.className = 'layer'; home.style.animation = 'none'; root.appendChild(home);
const topL = () => stack[stack.length - 1];
let replaceNext = false;
function push(cls, render, o = {}) {
  const el = document.createElement('div'); el.className = 'layer ' + (cls || ''); root.appendChild(el);
  const L = Object.assign({ el, render() { render(el, L); } }, o); stack.push(L);
  history[replaceNext ? 'replaceState' : 'pushState']({ d: stack.length }, ''); replaceNext = false; L.render(); return L;
}
function popTop(silent) { const L = stack.pop(); if (!L) return; L.onClose && L.onClose(); L.el.classList.add('out'); setTimeout(() => L.el.remove(), 230); }
history.replaceState({ d: 0 }, '');
addEventListener('popstate', () => { const d = (history.state && history.state.d) || 0; while (stack.length > d) popTop(); refresh(); });
function refresh() { homeRender(); stack.forEach(L => L.refresh ? L.refresh() : L.render()); }

function dialog(title, body, acts, mount) {
  return push('dlgL', (el, L) => {
    el.innerHTML = `<div class="scrim" data-a="back"></div><div class="dlg"><h3>${title}</h3>${body}<div class="acts">${acts.map((a, i) => `<button class="btn tx" data-i="${i}">${a[0]}</button>`).join('')}</div></div>`;
    el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const r = acts[+b.dataset.i][1] && acts[+b.dataset.i][1](el); if (r !== false) history.back(); });
    mount && mount(el);
  }, { refresh() { } });
}
function sheet(title, sub, body, o = {}) {
  return push('sheetL', el => {
    el.innerHTML = `<div class="scrim" data-a="back"></div><div class="sheet"><div class="grab"></div><div class="in"><h3 style="margin:0;font-size:18px">${title}</h3>${sub ? `<div class="sub">${sub}</div>` : ''}${body}</div></div>`;
  }, o);
}
function pickFile(accept, cb) { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => { if (i.files[0]) cb(i.files[0]); }; i.click(); }

/* ---------- HOME ---------- */
let deferredInstall = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; refresh(); });
const standalone = () => matchMedia('(display-mode:standalone)').matches || navigator.standalone;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installBanner() {
  if (standalone() || localStorage.getItem('noInstall')) return '';
  if (deferredInstall) return `<div class="install"><div class="grow">אפשר להתקין את האפליקציה על המכשיר</div><button class="btn" style="padding:6px 14px" data-a="install">התקן</button><button class="ib" style="width:32px;height:32px" data-a="noinst">${IC.close}</button></div>`;
  if (isIOS()) return `<div class="install"><div class="grow">להתקנה: לחץ על כפתור השיתוף ב-Safari (הריבוע עם החץ), ואז <b>"הוסף למסך הבית"</b>.</div><button class="ib" style="width:32px;height:32px" data-a="noinst">${IC.close}</button></div>`;
  return '';
}
function homeRender() {
  const sc = $('.scroll', home), st = sc ? sc.scrollTop : 0;
  const [da, ta] = counts(CATALOG), pa = pct(CATALOG), src = SOURCES[S.tab], exams = CATALOG.filter(e => e.source === src);
  const keys = ['short'].concat(ALL.filter(k => !SHORT.includes(k))).filter(k => exams.some(e => e.keys.some(x => k === 'short' ? SHORT.includes(x) : x === k)));
  home.innerHTML = `<div class="scroll">
  <div class="hero"><div class="row"><h1>מעקב בגרויות 571</h1><button class="ib" data-a="settings" aria-label="הגדרות">${IC.gear}</button></div>
  <div class="big">${ring(pa, 104, 11, '#fff', 'rgba(255,255,255,.25)', pa + '%')}<div><div class="dim">התקדמות כללית</div><b dir="ltr">${da} / ${ta}</b><div class="dim">שאלות · נותרו ${ta - da}</div></div></div></div>
  ${installBanner()}
  <div class="seg">${SOURCES.map((s, i) => `<button class="${S.tab === i ? 'on' : ''}" data-a="tab" data-v="${i}">${s}<small>${pct(CATALOG.filter(e => e.source === s))}%</small></button>`).join('')}</div>
  <div style="margin-top:6px"><h2>סוגי שאלות · ${src}</h2><div class="sub">לחץ על סוג שאלה כדי לראות את ההשלמות שלך בו</div></div>
  ${keys.map(k => { const kq = k === 'short' ? SHORT : k, [d, t] = counts(exams, kq), p = pct(exams, kq); return `<button class="card" data-a="type" data-k="${k}" data-s="${src}"><div class="flex"><span class="dot" style="background:${tc(k)}"></span><span class="ttl grow">${QN[k]}</span><b style="color:${tc(k)}">${p}%</b></div>${pbar(p, tc(k))}<div class="xs">${d} מתוך ${t} הושלמו</div></button>`; }).join('')}
  <div style="margin-top:10px"><h2>המבחנים</h2><div class="sub">לחץ על האחוז כדי לראות מה נותר במבחן</div></div>
  ${exams.map(e => { const [d, t] = counts([e]), p = pct([e]), ok = d === t; return `<div class="card" role="button" data-a="exam" data-e="${e.id}"><div class="flex"><div class="grow"><div class="ttl">${esc(e.title)}</div>${pbar(p, ok ? 'var(--sec)' : 'var(--pri)')}<div class="xs">${d} מתוך ${t} שאלות</div></div><div class="badge ${ok ? 'ok' : ''}" ${ok ? '' : `data-a="rem" data-e="${e.id}"`}>${ok ? '✓' : p + '%'}${ok ? '' : `<small>נותרו ${t - d}</small>`}</div></div></div>`; }).join('')}
  </div>`;
  const n = $('.scroll', home); if (n) n.scrollTop = st;
}

/* ---------- remaining sheet ---------- */
function remainingSheet(e) {
  const L = sheet('', '', '', {});
  L.render = L.refresh = () => {
    const left = remaining(e);
    L.el.innerHTML = `<div class="scrim" data-a="back"></div><div class="sheet"><div class="grab"></div><div class="in"><h3 style="margin:0;font-size:18px">${left.length ? 'נותרו ' + left.length + ' שאלות' : 'כל השאלות הושלמו 🎉'}</h3><div class="sub">${esc(e.title)}</div>${left.map(k => `<button class="qrow" data-a="pickRem" data-e="${e.id}" data-k="${k}"><span class="dot" style="width:10px;height:10px;background:${tc(k)}"></span><span class="grow">${QN[k]}</span><b style="color:var(--pri);font-size:14px">פתח</b></button>`).join('')}</div></div>`;
  };
  L.render();
}

/* ---------- settings ---------- */
function settingsDialog() {
  const s = S.settings;
  const curCode = (typeof window.getBagrutSyncCode === 'function' ? window.getBagrutSyncCode() : localStorage.getItem('bagrut_sync_code')) || '';
  const applySet = el => {
    const u = $('#su', el).value.trim();
    S.settings = { goolUrl: u || GOOL_URL, offset: parseInt($('#so', el).value) || 4 };
    save('settings');
    const codeInput = $('#scode', el);
    if (codeInput) {
      window.dispatchEvent(new CustomEvent('bagrut-set-sync-code', { detail: codeInput.value.trim().toUpperCase() }));
    }
    refresh();
  };
  dialog('הגדרות ו-PDF', `
  <label class="fld">קוד סנכרון (למשל 571-ABCD)<input id="scode" value="${esc(curCode)}" placeholder="השאר ריק לניתוק"></label>
  <label class="fld">קישור ל-PDF של שאלון 571<textarea id="su" rows="3" style="min-height:70px;direction:ltr;text-align:left">${esc(s.goolUrl)}</textarea></label>
  <label class="fld">דפים לפני עמוד מס' 1 (כריכה + מבוא + תוכן = 4)<input id="so" class="h" inputmode="numeric" value="${s.offset}"></label>
  <div class="acts" style="flex-direction:column;align-items:stretch">
   <button class="btn tx" id="sre">שמור והורד מחדש</button><button class="btn tx" id="spk">בחר קובץ PDF מהמכשיר</button>
   <button class="btn tx" id="sex">גיבוי: ייצוא ההתקדמות לקובץ</button><button class="btn tx" id="sim">שחזור מקובץ גיבוי</button>
   ${deferredInstall ? '<button class="btn tx" id="sin">התקן את האפליקציה</button>' : ''}</div>`,
    [['שמור', applySet], ['ביטול']], el => {
      const codeEl = $('#scode', el);
      if (codeEl) {
        codeEl.onchange = () => {
          window.dispatchEvent(new CustomEvent('bagrut-set-sync-code', { detail: codeEl.value.trim().toUpperCase() }));
        };
      }
      $('#sre', el).onclick = async () => { applySet(el); docs.delete(S.settings.goolUrl); await kv.del('pdf:' + S.settings.goolUrl); history.back(); toast('הקובץ יורד מחדש בפתיחת שאלה'); };
      $('#spk', el).onclick = () => pickFile('application/pdf,.pdf', async f => { applySet(el); await storePdf(S.settings.goolUrl, f); history.back(); toast('הקובץ נשמר במכשיר'); });
      $('#sex', el).onclick = exportBackup; $('#sim', el).onclick = () => pickFile('application/json,.json', importBackup);
      const si = $('#sin', el); if (si) si.onclick = installApp;
    });
}

function zoomable(stage, getEl, max) {
  const pts = new Map(); const Z = { s: 1, x: 0, y: 0 }; let g = null, lastTap = 0;
  const apply = () => { const el = getEl(); if (el) el.style.transform = `translate(${Z.x}px,${Z.y}px) scale(${Z.s})`; };
  const info = () => { const a = [...pts.values()]; const cx = a.reduce((m, p) => m + p.x, 0) / a.length, cy = a.reduce((m, p) => m + p.y, 0) / a.length; const d = a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0; return { cx, cy, d }; };
  stage.addEventListener('pointerdown', ev => { if (ev.target.closest('button')) return; stage.setPointerCapture(ev.pointerId); pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); const i = info(); g = { ...i, s: Z.s, moved: 0, t: Date.now(), n: pts.size }; });
  stage.addEventListener('pointermove', ev => {
    if (!pts.has(ev.pointerId) || !g) return; pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const i = info(); g.moved += Math.abs(i.cx - g.cx) + Math.abs(i.cy - g.cy);
    if (pts.size > 1 && g.d) Z.s = Math.min(max, Math.max(1, Z.s * i.d / g.d));
    Z.x += i.cx - g.cx; Z.y += i.cy - g.cy; g.cx = i.cx; g.cy = i.cy;
    if (Z.s === 1) { Z.x = 0; Z.y = 0; } else { const el = getEl(); const w = (el ? el.clientWidth : 300) * Z.s / 2, h = (el ? el.clientHeight : 300) * Z.s / 2; Z.x = Math.max(-w, Math.min(w, Z.x)); Z.y = Math.max(-h, Math.min(h, Z.y)); }
    apply();
  });
  const up = ev => {
    if (!pts.has(ev.pointerId)) return; pts.delete(ev.pointerId);
    if (g && g.n === 1 && g.moved < 8 && Date.now() - g.t < 300) { const n = Date.now(); if (n - lastTap < 320) { if (Z.s > 1) { Z.s = 1; Z.x = Z.y = 0; } else Z.s = Math.min(max, 2.5); apply(); lastTap = 0; } else lastTap = n; }
    if (pts.size) { const i = info(); g = { ...i, s: Z.s, moved: 99, t: 0, n: pts.size }; } else g = null;
  };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  return { reset() { Z.s = 1; Z.x = Z.y = 0; apply(); } };
}
function installApp() { if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; refresh(); } }
async function exportBackup() {
  const images = {};
  for (const id in S.progress) if (S.progress[id].img) { const b = await kv.get('img:' + id); if (b) images[id] = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); }
  const data = JSON.stringify({ v: 1, progress: S.progress, links: S.links, shifts: S.shifts, settings: S.settings, images });
  const file = new File([data], 'bagrut-571-backup.json', { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
}
async function importBackup(f) {
  try {
    const d = JSON.parse(await f.text()); if (!d.progress) throw 0;
    S.progress = d.progress; S.links = d.links || {}; S.shifts = d.shifts || {}; S.settings = Object.assign(S.settings, d.settings || {});
    for (const id in d.images || {}) await kv.set('img:' + id, await (await fetch(d.images[id])).blob());
    ['progress', 'links', 'shifts', 'settings'].forEach(save); refresh(); toast('הגיבוי שוחזר');
  } catch (e) { toast('קובץ הגיבוי לא תקין'); }
}

/* ---------- TYPE screen ---------- */
function typeScreen(k, src) {
  push('', (el, L) => {
    const grp = k === 'short', kk = grp ? (L.sub || SHORT.find(x => CATALOG.some(e => e.source === src && e.keys.includes(x)))) : k;
    const exams = CATALOG.filter(e => e.source === src && e.keys.includes(kk));
    const [d, t] = counts(exams, kk), p = pct(exams, kk), f = L.f || 0, c = tc(kk);
    const shown = exams.filter(e => { const dn = isDone(e.id, kk); return f === 1 ? !dn : f === 2 ? dn : true; });
    const [gd, gt] = grp ? counts(CATALOG.filter(e => e.source === src), SHORT) : [0, 0];
    const sc = $('.scroll', el), st = sc ? sc.scrollTop : 0;
    el.innerHTML = topBar(grp ? 'שאלות קצרות' : QN[k], src + (grp ? ` · ${gd} מתוך ${gt} הושלמו` : '')) + `<div class="scroll">
    ${grp ? `<div class="seg">${SHORT.filter(x => CATALOG.some(e => e.source === src && e.keys.includes(x))).map(x => `<button class="${x === kk ? 'on' : ''}" data-a="tsub" data-v="${x}">שאלה ${sn(x)}<small>${pct(CATALOG.filter(e => e.source === src), x)}%</small></button>`).join('')}</div>` : ''}
    <div class="card big"><div class="flex" style="gap:16px"><span data-a="tf" data-v="1" role="button" style="border-radius:50%">${ring(p, 88, 10, c, 'var(--sv)', p + '%')}</span><div><div class="ttl">${d} מתוך ${t} מבחנים הושלמו</div><div class="sub">${t - d === 0 ? 'סיימת את כולם 🎉' : 'לחץ על האחוז כדי לראות את ' + (t - d) + ' שנותרו'}</div></div></div></div>
    <div class="flex" style="gap:8px">${pill(`הכל (${t})`, f === 0, 'tf', 0)}${pill(`נותרו (${t - d})`, f === 1, 'tf', 1)}${pill(`הושלמו (${d})`, f === 2, 'tf', 2)}</div>
    ${shown.length ? '' : `<div class="empty">${f === 1 ? 'אין שאלות שנותרו 🎉' : 'עדיין אין כאן שאלות'}</div>`}
    ${shown.map(e => { const q = pr(e.id, kk), dn = !!(q && q.done), ex = [q && q.img ? 'יש תמונה' : '', q && q.note && q.note.trim() ? 'יש הערה' : ''].filter(Boolean).join(' · '); return `<div class="card ${dn ? 'done' : ''}" role="button" data-a="q" data-e="${e.id}" data-k="${kk}"><div class="flex"><div class="grow"><div class="ttl">${esc(e.title)}</div>${ex ? `<div class="sub">${ex}</div>` : ''}</div>${doneBtn(e.id, kk, dn)}</div></div>`; }).join('')}</div>`;
    const n = $('.scroll', el); if (n) n.scrollTop = st;
  });
}

/* ---------- EXAM screen ---------- */
function examScreen(e) {
  push('', (el, L) => {
    const [d, t] = counts([e]), p = pct([e]), keys = L.left ? remaining(e) : e.keys;
    const link = S.links[e.id] || e.defaultUrl, sol = solutionFor(e);
    const sc = $('.scroll', el), st = sc ? sc.scrollTop : 0;
    el.innerHTML = topBar(e.title, e.source) + `<div class="scroll">
    <div class="card big" style="display:flex;flex-direction:column;gap:12px"><div class="flex" style="gap:16px">${ring(p, 72, 8, d === t ? 'var(--sec)' : 'var(--pri)', 'var(--sv)', p + '%')}<div><div class="ttl">${d} מתוך ${t} שאלות</div><div class="sub">${d === t ? 'המבחן הושלם 🎉' : 'נותרו ' + (t - d)}</div></div></div>
    <div class="btns"><button class="btn ol" data-a="link">${link ? 'פתח שאלון' : 'חפש שאלון'}</button><button class="btn ol" data-a="sol">${sol ? 'מחוון מלא' : 'חפש מחוון'}</button><button class="btn ol" data-a="editLinks">קישורים</button></div></div>
    <div class="flex" style="gap:8px">${pill(`הכל (${e.keys.length})`, !L.left, 'ef', 0)}${pill(`נותרו (${t - d})`, !!L.left, 'ef', 1)}</div>
    ${e.pdf ? '<div class="sub">לחץ על שאלה כדי לראות אותה</div>' : ''}
    ${keys.length ? '' : '<div class="empty">כל השאלות במבחן הזה הושלמו 🎉</div>'}
    ${keys.map(k => { const q = pr(e.id, k), dn = !!(q && q.done), ex = [q && q.img ? 'יש תמונה' : '', q && q.note && q.note.trim() ? 'יש הערה' : ''].filter(Boolean).join(' · '); return `<div class="card ${dn ? 'done' : ''}" role="button" data-a="q" data-e="${e.id}" data-k="${k}"><div class="flex"><span class="stripe" style="background:${tc(k)}"></span><div class="grow"><div class="ttl">${QN[k]}</div>${ex ? `<div class="sub">${ex}</div>` : ''}</div>${doneBtn(e.id, k, dn)}</div></div>`; }).join('')}</div>`;
    const n = $('.scroll', el); if (n) n.scrollTop = st;
  }, { exam: e });
}
function editLinks(e) {
  dialog('קישורים למבחן', `<label class="fld">קישור לשאלון (PDF / אתר)<input id="l1" value="${esc(S.links[e.id] || e.defaultUrl || '')}"></label><label class="fld">קישור למחוון / פתרון מלא<input id="l2" value="${esc(S.links[solKey(e)] || e.solutionUrl || '')}"></label>`,
    [['שמור', el => { S.links[e.id] = $('#l1', el).value.trim(); S.links[solKey(e)] = $('#l2', el).value.trim(); save('links'); refresh(); }], ['ביטול']]);
}

/* ---------- PDF handling ---------- */
const docs = new Map();
const storePdf = async (url, blob) => { docs.delete(url); await kv.set('pdf:' + url, blob); };
async function getPdf(url, onProg) {
  if (docs.has(url)) return docs.get(url);
  if (typeof pdfjsLib === 'undefined') await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; sc.onload = ok; sc.onerror = () => no(new Error('pdf.js לא נטען — נדרש חיבור לאינטרנט בפעם הראשונה')); document.head.appendChild(sc); });
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  let blob = await kv.get('pdf:' + url);
  if (!blob) {
    const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
    const len = +r.headers.get('content-length') || 0, rd = r.body && r.body.getReader();
    if (rd) { const parts = []; let got = 0; for (; ;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; if (len && onProg) onProg(Math.floor(got * 100 / len)); } blob = new Blob(parts, { type: 'application/pdf' }); }
    else blob = await r.blob();
    if (!blob.size) throw new Error('empty file');
    await kv.set('pdf:' + url, blob);
  }
  try { const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise; docs.set(url, doc); return doc; }
  catch (e) { await kv.del('pdf:' + url); throw e; }
}
const pdfUrl = ref => ref.url || S.settings.goolUrl;
function savePage(e, k, page, ref) {
  ensure(e.id, k).pdfPage = page; const base = ref.pages[k];
  if (ref.estimated && ref.url == null && base != null) { S.shifts[e.id] = page - base; save('shifts'); }
  save('progress'); refresh();
}


/* ---------- QUESTION VIEWER ---------- */
function openQ(e, k) { if (e.pdf) viewer(e, k); else details(e, k); }
function viewer(exam, key0) {
  const ref = exam.pdf, aVals = Object.values(ref.answers), ansLo = aVals.length ? Math.min(...aVals.map(a => a[0])) : null, ansHi = aVals.length ? Math.max(...aVals.map(a => a[0])) : null;
  const V = { key: key0, showAns: false, crop: true, doc: null, err: null, tok: 0, prog: null };
  const shift = () => ref.url == null ? S.settings.offset : 0;
  const ans = () => ref.answers[V.key];
  const setKey = k => { V.key = k; V.page = pageFor(exam, ref, k); V.aPage = ans() ? ans()[0] : (ansLo != null ? ansLo : 1); };
  setKey(key0);
  const total = () => V.doc ? V.doc.numPages : null;
  let el;
  const L = push('', e0 => {
    el = e0;
    el.innerHTML = `<div id="vbar"></div><div class="pills" id="vch"></div><div class="stage" id="vst" style="margin-top:8px"></div><div id="vhint"></div><div class="vctl" id="vctl"></div><div class="vfoot" id="vfoot"></div>`;
    const z = zoomable($('#vst', el), () => $('canvas', el), 5); V.zoom = z; ui(); load();
  }, { viewer: true });
  L.refresh = () => ui();
  function lim() {
    const sh = shift(), t = total(), lo = ref.estimated ? 1 : ref.first;
    const hi = ref.estimated ? (t != null ? t - sh : Infinity) : Math.min(ref.last != null ? ref.last : Infinity, (t != null ? t : Infinity) - sh);
    return { lo, hi, sh };
  }
  function ui() {
    const { lo, hi } = lim(), cur = pr(exam.id, V.key), dn = !!(cur && cur.done), shown = V.showAns ? V.aPage : V.page;
    const cLo = V.showAns ? (ansLo != null ? ansLo : 1) : lo, cHi = V.showAns ? (ansHi != null ? ansHi : 1) : hi, a = ans();
    const same = exam.keys.filter(k => k !== V.key && pageFor(exam, ref, k) === V.page), savedHere = cur && cur.pdfPage === V.page;
    $('#vbar', el).innerHTML = `<div class="bar"><button class="ib" data-a="back" aria-label="סגור">${IC.close}</button><div class="t"><h1>${esc(exam.title)}</h1><div class="sub">${QN[V.key]}${V.showAns ? ' · תשובה סופית' : ''}</div></div>${aVals.length ? pill(V.showAns ? 'חזרה לשאלה' : 'הצג תשובה', V.showAns, 'vAns') : ''}</div>`;
    $('#vch', el).innerHTML = exam.keys.map(k => `<button class="pill ${k === V.key ? 'on' : ''}" data-a="vKey" data-v="${k}">${isDone(exam.id, k) ? '✓ ' : ''}${sn(k)}</button>`).join('');
    const hints = [];
    if (!V.showAns && same.length) hints.push('בעמוד הזה גם: ' + same.map(sn).join(', '));
    if (!V.showAns && ref.estimated && !(cur && cur.pdfPage != null)) hints.push('העמוד משוער. אם זו לא השאלה - דפדף ולחץ "שמור עמוד" (שאר שאלות המבחן יתוקנו לפי זה).');
    if (V.showAns && SHORT.includes(V.key)) hints.push('תשובות שאלה 1 (סעיפים א-ד) מופיעות יחד.');
    $('#vhint', el).innerHTML = hints.map(h => `<div class="hint">${h}</div>`).join('');
    $('#vctl', el).innerHTML = `<button class="btn ol" data-a="vPrev" ${shown > cLo ? '' : 'disabled'}>הקודם</button><button class="btn tx" data-a="vJump" style="color:var(--on);font-weight:600">עמוד ${shown}</button><button class="btn ol" data-a="vNext" ${shown < cHi ? '' : 'disabled'}>הבא</button><span class="grow"></span>` +
      (V.showAns ? `<button class="btn tx" data-a="vCrop" ${a ? '' : 'disabled'}>${V.crop ? 'כל העמוד' : 'רק התשובה'}</button>` : `<button class="btn tx" data-a="vSave" ${savedHere ? 'disabled' : ''}>${savedHere ? '✓ נשמר' : 'שמור עמוד'}</button>`);
    const sol = solutionFor(exam);
    $('#vfoot', el).innerHTML = `<button class="btn ${dn ? 'ok' : ''}" data-a="vDone">${dn ? '✓ הושלם (לחץ לביטול)' : 'סיימתי את השאלה'}</button>` +
      (V.showAns ? `<button class="btn ol" data-a="vSol">${sol ? 'מחוון מלא' : 'חפש מחוון'}</button>` : `<button class="btn ol" data-a="vDet">הערות / תמונה</button>`);
  }
  function msg(h) { $('#vst', el).innerHTML = `<div class="msg">${h}</div>`; }
  async function open() {
    V.err = null; V.doc = null; msg('<div class="spin"></div><div id="vp">טוען… (בפעם הראשונה הקובץ יורד למכשיר)</div>');
    try { V.doc = await getPdf(pdfUrl(ref), p => { const n = $('#vp', el); if (n) n.textContent = 'מוריד… ' + p + '%'; }); }
    catch (e) { V.err = e; }
    ui(); load();
  }
  V.open = open;
  async function load() {
    const my = ++V.tok;
    if (V.err) { const u = pdfUrl(ref); msg(`לא הצלחתי לטעון את ה-PDF.\nבדוק חיבור לאינטרנט, או בחר את הקובץ מהמכשיר.<button class="btn" data-a="vRetry">נסה שוב</button><button class="btn ol" data-a="vPick">בחר קובץ PDF מהמכשיר</button><button class="btn tx" data-a="vWeb">פתח בדפדפן</button>`); return; }
    if (!V.doc) { if (!V.opening) { V.opening = true; await open(); V.opening = false; } return; }
    if (V.showAns && !ans()) { msg('אין תשובה סופית לשאלה הזו בקובץ.\nאפשר לדפדף בעמודי התשובות, או לפתוח מחוון.'); V.zoom.reset(); return; }
    const sh = lim().sh, shown = V.showAns ? V.aPage : V.page, n = shown + sh;
    if (n < 1 || n > V.doc.numPages) { msg('העמוד הזה לא קיים בקובץ'); return; }
    msg('<div class="spin"></div>');
    try {
      const pg = await V.doc.getPage(n), v0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: 1500 / v0.width });
      const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      if (my !== V.tok) return;
      let out = c; const a = ans();
      if (V.showAns && V.crop && a && V.aPage === a[0]) {
        const y0 = Math.max(0, Math.min(c.height - 1, Math.floor(c.height * a[1] / 1000))), y1 = Math.max(y0 + 1, Math.min(c.height, Math.floor(c.height * a[2] / 1000)));
        out = document.createElement('canvas'); out.width = c.width; out.height = y1 - y0; out.getContext('2d').drawImage(c, 0, y0, c.width, y1 - y0, 0, 0, c.width, y1 - y0);
      }
      const st = $('#vst', el); st.innerHTML = ''; st.appendChild(out); V.zoom.reset();
    } catch (e) { if (my === V.tok) msg('שגיאה בהצגת העמוד'); }
  }
  L.V = V; L.ui = ui; L.load = load; L.exam = exam; L.ref = ref; L.setKey = setKey; L.lim = lim; L.ansLo = ansLo; L.ansHi = ansHi;
}

/* ---------- DETAILS sheet (notes + own photo) ---------- */
const urls = new Map();
async function imgUrl(id) { const b = await kv.get('img:' + id); if (!b) return null; if (urls.has(id)) URL.revokeObjectURL(urls.get(id)); const u = URL.createObjectURL(b); urls.set(id, u); return u; }
async function attachImage(e, k, file) {
  const bmp = await createImageBitmap(file).catch(() => null); let blob = file;
  if (bmp) { const s = Math.min(1, 1800 / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .85)); }
  await kv.set('img:' + e + '|' + k, blob); ensure(e, k).img = true; save('progress'); refresh();
}
function details(exam, key) {
  const id = exam.id + '|' + key; let note = ensure(exam.id, key).note || '';
  const L = sheet('', '', '', { onClose() { const p = ensure(exam.id, key); if (p.note !== note) { p.note = note; save('progress'); refresh(); } } });
  L.render = L.refresh = async () => {
    const p = ensure(exam.id, key), ta = $('textarea', L.el); if (ta) note = ta.value;
    const u = p.img ? await imgUrl(id) : null;
    L.el.innerHTML = `<div class="scrim" data-a="back"></div><div class="sheet"><div class="grab"></div><div class="in"><h3 style="margin:0;font-size:18px">${esc(exam.title)} · ${QN[key]}</h3>
    ${u ? `<img class="thumb" src="${u}" data-a="zoomImg" data-v="${esc(id)}" alt="תמונת השאלה"><div class="sub">לחץ על התמונה להגדלה</div>` : ''}
    <div class="flex" style="gap:8px"><button class="btn ol" data-a="addImg">${p.img ? 'החלף תמונה' : 'הוסף תמונת שאלה'}</button>${p.img ? '<button class="btn tx" data-a="rmImg">הסר</button>' : ''}</div>
    <label class="fld">הערות<textarea id="nt">${esc(note)}</textarea></label>
    <button class="btn ${p.done ? 'ok' : ''}" data-a="dDone">${p.done ? '✓ הושלם (לחץ לביטול)' : 'סיימתי את השאלה'}</button></div></div>`;
    $('#nt', L.el).oninput = ev => { note = ev.target.value; clearTimeout(L.t); L.t = setTimeout(() => { ensure(exam.id, key).note = note; save('progress'); }, 600); };
  };
  L.exam = exam; L.key = key; L.render();
}
function zoomImg(id) {
  const L = push('zoomL', async el => {
    const u = urls.get(id) || await imgUrl(id);
    el.innerHTML = `<button class="x" data-a="back">סגור</button><img src="${u}" alt="">`; zoomable(el, () => $('img', el), 6);
  }, { refresh() { } });
}

/* ---------- actions (event delegation) ---------- */
const A = {
  back: () => history.back(),
  tab: d => { S.tab = +d.v; localStorage.setItem('tab', d.v); homeRender(); },
  type: d => typeScreen(d.k, d.s),
  exam: d => examScreen(EX[d.e]),
  rem: d => remainingSheet(EX[d.e]),
  pickRem: d => { const e = EX[d.e]; popTop(); replaceNext = true; openQ(e, d.k); },
  settings: settingsDialog,
  tog: d => toggle(d.e, d.k),
  q: d => openQ(EX[d.e], d.k),
  tsub: d => { const L = topL(); L.sub = d.v; L.f = 0; L.render(); },
  tf: d => { const L = topL(); L.f = +d.v; L.render(); },
  ef: d => { const L = topL(); L.left = !!+d.v; L.render(); },
  link: () => { const e = topL().exam; openUrl(S.links[e.id] || e.defaultUrl || 'https://www.google.com/search?q=' + encodeURIComponent('שאלון ' + e.title + ' מתמטיקה 5 יחידות 571')); },
  sol: () => { const e = topL().exam; openUrl(solutionFor(e) || solSearch(e)); },
  editLinks: () => editLinks(topL().exam),
  install: installApp, noinst: () => { localStorage.setItem('noInstall', '1'); homeRender(); },
  /* viewer */
  vAns: () => { const L = viewer_(); L.V.showAns = !L.V.showAns; L.ui(); L.load(); },
  vKey: d => { const L = viewer_(); L.setKey(d.v); L.ui(); L.load(); const b = $('#vch .on', L.el); b && b.scrollIntoView({ inline: 'center', block: 'nearest' }); },
  vPrev: () => vStep(-1), vNext: () => vStep(1),
  vCrop: () => { const L = viewer_(); L.V.crop = !L.V.crop; L.ui(); L.load(); },
  vSave: () => { const L = viewer_(); savePage(L.exam, L.V.key, L.V.page, L.ref); },
  vDone: () => { const L = viewer_(); toggle(L.exam.id, L.V.key); },
  vDet: () => { const L = viewer_(); details(L.exam, L.V.key); },
  vSol: () => { const e = viewer_().exam; openUrl(solutionFor(e) || solSearch(e)); },
  vRetry: () => { const L = viewer_(); L.V.err = null; L.V.doc = null; L.V.opening = false; L.load(); },
  vPick: () => { const L = viewer_(); pickFile('application/pdf,.pdf', async f => { await storePdf(pdfUrl(L.ref), f); A.vRetry(); }); },
  vWeb: () => openUrl(new URL(pdfUrl(viewer_().ref), location.href).href),
  vJump: () => { const L = viewer_(), V = L.V; const shown = V.showAns ? V.aPage : V.page;
    dialog('מעבר לעמוד', `<label class="fld">${L.ref.url == null ? 'מספר העמוד המודפס' : 'מספר עמוד'}<input id="jp" class="h" inputmode="numeric" value="${shown}"></label>`, [['עבור', el => {
      const n = parseInt($('#jp', el).value); if (!isNaN(n)) { if (V.showAns && L.ansLo != null) V.aPage = Math.min(L.ansHi, Math.max(L.ansLo, n)); else { const t = V.doc ? V.doc.numPages - L.lim().sh : Infinity; V.page = Math.min(t, Math.max(1, n)); } }
      setTimeout(() => { L.ui(); L.load(); }, 0);
    }], ['ביטול']], el => { const i = $('#jp', el); setTimeout(() => { i.focus(); i.select(); }, 280); }); },
  /* details */
  addImg: () => { const L = topL(); pickFile('image/*', f => attachImage(L.exam.id, L.key, f)); },
  rmImg: async () => { const L = topL(), p = ensure(L.exam.id, L.key); p.img = false; await kv.del('img:' + L.exam.id + '|' + L.key); save('progress'); refresh(); },
  dDone: () => { const L = topL(); toggle(L.exam.id, L.key); },
  zoomImg: d => zoomImg(d.v)
};
function viewer_() { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].viewer) return stack[i]; }
function vStep(dlt) { const L = viewer_(), V = L.V; if (V.showAns) V.aPage += dlt; else V.page += dlt; L.ui(); L.load(); }
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-a]'); if (!t || !A[t.dataset.a]) return;
  ev.preventDefault(); A[t.dataset.a](t.dataset, ev);
});
addEventListener('keydown', ev => { if (ev.key === 'Escape' && stack.length) history.back(); });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('contextmenu', e => { if (!/INPUT|TEXTAREA/.test(e.target.tagName)) e.preventDefault(); });
document.addEventListener('dblclick', e => e.preventDefault());

/* ---------- boot ---------- */
(async function boot() {
  try {
    const [p, l, s, st] = await Promise.all([kv.get('progress'), kv.get('links'), kv.get('shifts'), kv.get('settings')]);
    if (p) S.progress = p; if (l) S.links = l; if (s) S.shifts = s; if (st) Object.assign(S.settings, st);
  } catch (e) { toast('האחסון במכשיר לא זמין — ההתקדמות לא תישמר'); }
  S.tab = Math.min(2, +localStorage.getItem('tab') || 0);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  homeRender();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
