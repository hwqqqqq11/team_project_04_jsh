// 민원 저장소 API. 저장소(KV)가 없으면 { enabled:false } 를 돌려주고, 화면은 브라우저 저장소로 동작한다.
//   GET  /api/db            담당자·관리자: 전체(로그인 필요)
//   GET  /api/db?ids=a,b    민원인: 자기 민원만(아이디를 아는 민원만)
//   POST /api/db {op}       add(민원인) · appeal(민원인) · decide(담당자) · pause(관리자) · reset(관리자)
import { readBody, send } from './_lib/http.js';
import { kvEnabled } from './_lib/kv.js';
import { can, signResult } from './_lib/auth.js';
import { guard } from './_lib/limit.js';
import * as db from './_lib/dbstore.js';

const STAGES = ['정상', '검토필요', '차단후보'];
const APPEAL_MS = 7 * 86400000;
const str = (v, n) => String(v ?? '').slice(0, n);

export default async function handler(req, res) {
  if (!kvEnabled()) return send(res, 200, { enabled: false });
  try {
    if (req.method === 'GET') return await get(req, res);
    if (req.method === 'POST') return await post(req, res);
    send(res, 405, { error: 'GET · POST 만 받습니다' });
  } catch (err) {
    console.error(err);
    send(res, 502, { error: `저장소 오류: ${str(err.message, 120)}` });
  }
}

async function get(req, res) {
  const u = new URL(req.url, 'http://x');
  const ids = u.searchParams.get('ids');
  if (ids !== null) {
    if (!(await guard(req, res, 'dbget', 60, 60))) return;
    const want = new Set(ids.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50));
    const all = await db.getAll();
    const complaints = all.complaints.filter((c) => want.has(c.id));
    return send(res, 200, {
      enabled: true,
      complaints,
      history: all.history.filter((h) => want.has(h.complaintId)),
      settings: { aiPaused: !!all.settings.aiPaused },
    });
  }
  if (!can(req, 'staff')) return send(res, 401, { error: '로그인이 필요합니다' });
  send(res, 200, { enabled: true, ...(await db.getAll()) });
}

async function post(req, res) {
  const body = await readBody(req);
  const { op } = body;

  if (op === 'add') {
    if (!(await guard(req, res, 'dbadd', 20, 600))) return;
    const c = body.complaint || {};
    if (!STAGES.includes(c.stage)) return send(res, 400, { error: '단계 값이 올바르지 않습니다' });
    if (c.sig !== signResult(c)) return send(res, 400, { error: '분류 결과가 확인되지 않습니다. 다시 제출해 주세요.' });
    if ((await db.countComplaints()) >= db.MAX_COMPLAINTS) return send(res, 503, { error: '시제품 저장 한도에 도달했습니다. 관리자에게 문의하세요.' });
    const now = Date.now();
    const clean = {
      id: `c-${now}-${db.rid()}`, mine: true, createdAt: now, title: str(c.title, 60) || '(제목 없음)',
      maskedText: str(c.maskedText, 4200), hiddenText: str(c.hiddenText, 4200), softened: str(c.softened, 4200), summary: str(c.summary, 400),
      stage: c.stage, mode: ['ai', 'manual', 'ai-failed'].includes(c.mode) ? c.mode : 'ai', note: str(c.note, 300), agree: c.agree,
      first: c.first || null, second: c.second || null, fixes: Array.isArray(c.fixes) ? c.fixes.slice(0, 5) : [], piiFound: Array.isArray(c.piiFound) ? c.piiFound.slice(0, 10) : [],
      choice: ['없음', '제안대로', '직접', '그대로'].includes(c.choice) ? c.choice : '없음', guided: !!c.guided, final: null, appeal: null,
    };
    if (JSON.stringify(clean).length > 40000) return send(res, 413, { error: '내용이 너무 깁니다' });
    const h = db.hist({
      at: now, complaintId: clean.id, action: clean.mode === 'manual' ? '1차 표시(수동 모드)' : 'AI 표시', to: clean.stage,
      reason: clean.note, actor: '시스템', model: clean.second?.model || (clean.mode === 'manual' ? '표현 목록' : '—'),
    });
    await db.saveComplaint(clean, [h]);
    return send(res, 200, { ok: true, complaint: clean, history: [h] });
  }

  if (op === 'appeal') {
    if (!(await guard(req, res, 'dbappeal', 10, 600))) return;
    const c = await db.getComplaint(str(body.id, 80));
    const text = str(body.text, 1000).trim();
    if (!c || !text) return send(res, 400, { error: '소명할 민원이나 내용이 없습니다' });
    if (c.final?.stage !== '차단후보' || c.appeal) return send(res, 409, { error: '소명을 낼 수 없는 상태입니다' });
    if (Date.now() > c.final.at + APPEAL_MS) return send(res, 409, { error: '소명 기한이 지났습니다' });
    c.appeal = { text, at: Date.now() };
    const h = db.hist({ complaintId: c.id, action: '소명 접수', from: c.final.stage, to: c.final.stage, reason: '민원인 소명 — 사람이 다시 검토', actor: '민원인' });
    await db.saveComplaint(c, [h]);
    return send(res, 200, { ok: true, complaint: c, history: [h] });
  }

  if (op === 'decide') {
    if (!can(req, 'staff')) return send(res, 401, { error: '로그인이 필요합니다' });
    const c = await db.getComplaint(str(body.id, 80));
    if (!c || !STAGES.includes(body.stage)) return send(res, 400, { error: '민원이나 단계 값이 올바르지 않습니다' });
    const from = c.final?.stage || c.stage;
    c.final = { stage: body.stage, at: Date.now(), by: '담당 공무원', reason: str(body.reason, 60), changed: !!body.changed };
    const h = db.hist({ complaintId: c.id, action: body.changed ? '단계 변경' : '단계 확정', from, to: body.stage, reason: c.final.reason, actor: '담당 공무원', model: c.second?.model || '—' });
    await db.saveComplaint(c, [h]);
    return send(res, 200, { ok: true, complaint: c, history: [h] });
  }

  if (op === 'pause') {
    if (!can(req, 'admin')) return send(res, 401, { error: '관리자 로그인이 필요합니다' });
    const settings = { ...(await db.getSettings()), aiPaused: !!body.value };
    const h = db.hist({ action: settings.aiPaused ? 'AI 표시 중지(수동 모드)' : 'AI 표시 다시 켬', actor: '관리자' });
    await db.saveSettings(settings, [h]);
    return send(res, 200, { ok: true, settings, history: [h] });
  }

  if (op === 'reset') {
    if (!can(req, 'admin')) return send(res, 401, { error: '관리자 로그인이 필요합니다' });
    await db.resetAll();
    return send(res, 200, { ok: true });
  }

  send(res, 400, { error: '알 수 없는 요청입니다' });
}
