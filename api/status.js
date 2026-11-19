// 키 상태 — 이름별로 「값 있음 / 비어 있음」만 알려 준다. 값은 절대 내보내지 않는다.
import { send } from './_lib/http.js';
import { pickModel, KEY_NAME } from './_lib/models.js';
import { reasonOf } from './_lib/http.js';

const NAMES = ['CLAUDE_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'LAW_OC', 'DATA_GO_KR_KEY'];

export default async function handler(req, res) {
  const keys = NAMES.map((n) => ({ name: n, has: !!process.env[n] }));
  const url = new URL(req.url, 'http://x');
  let models = null;
  if (url.searchParams.get('models') === '1') {
    models = await Promise.all(Object.keys(KEY_NAME).map(async (p) => {
      try { const { model } = await pickModel(p); return { provider: p, model }; }
      catch (e) { return { provider: p, model: null, reason: reasonOf(e) }; }
    }));
  }
  send(res, 200, { keys, models });
}
