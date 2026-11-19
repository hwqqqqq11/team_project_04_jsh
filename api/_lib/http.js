// 요청 본문 읽기와 JSON 응답 — Vercel 과 로컬 server.js 양쪽에서 똑같이 동작한다
export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

// 실패 이유를 사람이 읽는 말로 바꾼다
export function reasonOf(err) {
  if (!err) return '알 수 없는 오류';
  if (err.code === 'KEY_EMPTY') return '키 비어 있음';
  if (err.name === 'AbortError' || err.name === 'TimeoutError' || /timed? ?out|timeout/i.test(err.message || '')) return '시간 초과';
  const s = err.status;
  if (s === 401 || s === 403) return `승인 안 됨(${s}) — 키 또는 활용 신청 확인`;
  if (s === 404) return '404 — 모델 이름(또는 주소)부터 의심';
  if (s === 429) return '사용량 초과(429)';
  if (s) return `오류 ${s}`;
  return err.message ? `오류: ${String(err.message).slice(0, 120)}` : '알 수 없는 오류';
}

export function keyEmpty(name) {
  const e = new Error(`${name} 비어 있음`);
  e.code = 'KEY_EMPTY';
  return e;
}

// fetch + 시간 제한. 응답이 2xx 가 아니면 status 를 붙여 던진다
export async function fetchJson(url, opts = {}, ms = 15000) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
  const text = await r.text();
  if (!r.ok) {
    const e = new Error(text.slice(0, 200));
    e.status = r.status;
    throw e;
  }
  try { return JSON.parse(text); } catch { return text; }
}
