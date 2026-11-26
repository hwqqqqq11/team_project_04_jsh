// 호출 횟수 제한 — IP 하나가 AI 를 마구 부르지 못하게 한다(비용 보호).
// 저장소(KV)가 있으면 서버 함수끼리 합쳐서 세고, 없으면 함수 하나 안에서만 센다(대략적인 보호).
import { kvEnabled, kvPipeline } from './kv.js';
import { send } from './http.js';

const mem = new Map();

export function clientIp(req) {
  return String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

export async function guard(req, res, bucket, max, windowSec) {
  const key = `sb:rl:${bucket}:${clientIp(req)}`;
  let n = null;
  if (kvEnabled()) {
    try {
      const r = await kvPipeline([['INCR', key], ['EXPIRE', key, windowSec, 'NX']]);
      n = Number(r?.[0]?.result);
    } catch { n = null; }
  }
  if (n == null || Number.isNaN(n)) {
    const now = Date.now();
    const cur = mem.get(key);
    if (!cur || cur.until < now) { mem.set(key, { n: 1, until: now + windowSec * 1000 }); n = 1; }
    else { cur.n += 1; n = cur.n; }
    if (mem.size > 5000) for (const [k, v] of mem) if (v.until < now) mem.delete(k);
  }
  if (n > max) {
    res.setHeader('Retry-After', String(windowSec));
    send(res, 429, { error: `요청이 너무 많습니다. ${windowSec}초에 ${max}번까지 쓸 수 있어요. 잠시 뒤 다시 시도하세요.` });
    return false;
  }
  return true;
}
