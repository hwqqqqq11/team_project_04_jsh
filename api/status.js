// 키 상태 — 이름별로 「값 있음 / 비어 있음」만 알려 준다. 값은 절대 내보내지 않는다.
import { send } from './_lib/http.js';
import { pickModel, KEY_NAME } from './_lib/models.js';
import { reasonOf } from './_lib/http.js';
import { guard } from './_lib/limit.js';
import { can } from './_lib/auth.js';

const NAMES = ['CLAUDE_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'LAW_OC', 'DATA_GO_KR_KEY'];

export default async function handler(req, res) {
  if (!(await guard(req, res, 'status', 30, 60))) return;
  const keys = NAMES.map((n) => ({ name: n, has: !!process.env[n] }));
  const url = new URL(req.url, 'http://x');
  let models = null;
  if (url.searchParams.get('models') === '1') {
    // 모델 목록 조회는 AI 키를 쓰므로 관리자만
    if (!can(req, 'admin')) return send(res, 401, { error: '관리자 로그인이 필요합니다' });
    models = await Promise.all(Object.keys(KEY_NAME).map(async (p) => {
      try { const { model } = await pickModel(p); return { provider: p, model }; }
      catch (e) { return { provider: p, model: null, reason: reasonOf(e) }; }
    }));
  }
  send(res, 200, { keys, models });
}
