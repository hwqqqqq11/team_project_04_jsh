// 서버 저장소(Redis REST) — Vercel 마켓플레이스의 Upstash Redis(KV) 를 연결하면 환경변수가 자동으로 생긴다.
//   KV_REST_API_URL + KV_REST_API_TOKEN  (또는 UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
// 없으면 kvEnabled() 가 false 이고, 화면은 브라우저 저장소(시제품 방식)로 돌아간다.
const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

export const kvEnabled = () => !!(url() && token());

async function call(path, body) {
  const r = await fetch(`${url().replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || `저장소 오류 ${r.status}`); e.status = r.status; throw e; }
  return j;
}

// kv('HGET', 'key', 'field') → 결과값
export async function kv(...cmd) {
  const j = await call('', cmd);
  if (j.error) throw new Error(j.error);
  return j.result;
}

// kvPipeline([['INCR','a'], ['GET','b']]) → [{result}, ...]
export async function kvPipeline(cmds) {
  return call('/pipeline', cmds);
}

// HGETALL 은 [필드, 값, 필드, 값…] 로 온다 → 객체로
export function pairs(flat) {
  const o = {};
  for (let i = 0; i + 1 < (flat || []).length; i += 2) o[flat[i]] = flat[i + 1];
  return o;
}
