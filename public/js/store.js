// 민원 저장소.
//  · 서버 저장소(KV)가 연결돼 있으면(/api/db 가 enabled) 서버에 저장 — 기기가 달라도 담당자 화면에서 보이고, 판단 이력은 서버가 남긴다.
//  · 연결돼 있지 않으면 브라우저 localStorage(시제품 방식) — 같은 브라우저 안에서만 세 화면이 데이터를 나눠 본다.
import { seed } from './seed.js';

const KEY = 'sbfilter.v1';
const MINE = 'sbfilter.mine.v1'; // 서버 방식에서 이 브라우저가 낸 민원 아이디
let mem = null;
let mode = 'local';
let scope = 'all';

export const storageMode = () => mode;

const loadMine = () => { try { return JSON.parse(localStorage.getItem(MINE) || '[]'); } catch { return []; } };
const rememberMine = (id) => { try { localStorage.setItem(MINE, JSON.stringify([id, ...loadMine()].slice(0, 50))); } catch { /* 저장 불가 */ } };

function localLoad() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : seed();
  } catch { return seed(); }
}
function localSave() {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* 저장 불가(사생활 보호 창 등) — 이 탭 안에서만 유지 */ }
}

// 화면을 열 때 한 번 부른다. scope: 'all'(담당자·관리자) | 'mine'(민원인)
export async function init(sc = 'all') {
  scope = sc;
  let d = null;
  try {
    const url = sc === 'mine' ? `/api/db?ids=${encodeURIComponent(loadMine().join(','))}` : '/api/db';
    const r = await fetch(url);
    if (r.status === 401) { const e = new Error('로그인이 필요합니다'); e.status = 401; throw e; }
    d = r.ok ? await r.json() : null;
  } catch (e) { if (e.status === 401) throw e; }
  if (d?.enabled) {
    mode = 'server';
    mem = { complaints: d.complaints || [], history: d.history || [], settings: d.settings || { aiPaused: false }, version: 1 };
  } else {
    mode = 'local';
    mem = localLoad();
  }
  return mem;
}

export function load() {
  if (!mem) mem = localLoad();
  return mem;
}

// 다른 기기·탭에서 바뀐 것을 가져와 달라졌을 때만 cb 를 부른다
export function startSync(cb, ms = 15000) {
  if (mode === 'local') { window.addEventListener('storage', () => { mem = localLoad(); cb(); }); return; }
  setInterval(async () => {
    if (document.hidden) return;
    const before = JSON.stringify([mem.complaints, mem.history, mem.settings]);
    try { await init(scope); } catch { return; }
    if (JSON.stringify([mem.complaints, mem.history, mem.settings]) !== before) cb();
  }, ms);
}

async function post(body) {
  const r = await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || `오류 ${r.status}`); e.status = r.status; throw e; }
  return d;
}
function merge(d) {
  if (d.complaint) {
    const i = mem.complaints.findIndex((x) => x.id === d.complaint.id);
    if (i >= 0) mem.complaints[i] = d.complaint; else mem.complaints.unshift(d.complaint);
  }
  for (const h of d.history || []) mem.history.unshift(h);
  if (d.settings) mem.settings = d.settings;
}

export async function reset() {
  if (mode === 'server') { await post({ op: 'reset' }); await init(scope); return mem; }
  mem = seed(); localSave(); return mem;
}

export const currentStage = (c) => c.final?.stage || c.stage;

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export async function addComplaint(c) {
  if (mode === 'server') {
    const d = await post({ op: 'add', complaint: c });
    merge(d); rememberMine(d.complaint.id);
    return d.complaint;
  }
  const db = load();
  db.complaints.unshift(c);
  db.history.unshift({ id: `h-${uid()}`, complaintId: c.id, at: c.createdAt, action: c.mode === 'manual' ? '1차 표시(수동 모드)' : 'AI 표시', from: null, to: c.stage, reason: c.note || '', actor: '시스템', model: c.second?.model || (c.mode === 'manual' ? '표현 목록' : '—') });
  localSave();
  return c;
}

export async function decide(id, toStage, reason, changed) {
  if (mode === 'server') { merge(await post({ op: 'decide', id, stage: toStage, reason, changed })); return; }
  const db = load();
  const c = db.complaints.find((x) => x.id === id);
  if (!c) return;
  const from = currentStage(c);
  c.final = { stage: toStage, at: Date.now(), by: '담당 공무원', reason, changed };
  db.history.unshift({ id: `h-${uid()}`, complaintId: id, at: Date.now(), action: changed ? '단계 변경' : '단계 확정', from, to: toStage, reason: reason || '', actor: '담당 공무원', model: c.second?.model || '—' });
  localSave();
}

export async function appeal(id, text) {
  if (mode === 'server') { merge(await post({ op: 'appeal', id, text })); return; }
  const db = load();
  const c = db.complaints.find((x) => x.id === id);
  if (!c) return;
  c.appeal = { text, at: Date.now() };
  db.history.unshift({ id: `h-${uid()}`, complaintId: id, at: Date.now(), action: '소명 접수', from: currentStage(c), to: currentStage(c), reason: '민원인 소명 — 사람이 다시 검토', actor: '민원인', model: '—' });
  localSave();
}

export async function setAiPaused(v) {
  if (mode === 'server') { merge(await post({ op: 'pause', value: v })); return; }
  const db = load();
  db.settings.aiPaused = v;
  db.history.unshift({ id: `h-${uid()}`, complaintId: null, at: Date.now(), action: v ? 'AI 표시 중지(수동 모드)' : 'AI 표시 다시 켬', from: null, to: null, reason: '', actor: '관리자', model: '—' });
  localSave();
}

// ---------- 작은 도우미 ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtTime = (t) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const stageTag = (s) => `<span class="stage s-${esc(s)}">${esc(s)}</span>`;
export const srcBadge = (src) => (src === 'live' ? '<span class="badge live">실시간</span>' : '<span class="badge demo">시연 값</span>');
