// AI 모델 이름은 코드에 박지 않고, 각 키로 「모델 목록」을 조회해서 고른다.
// 목록에 선호 모델이 없으면 목록의 첫 대화용 모델을 쓴다. 고른 결과는 메모리에 잠시 기억한다.
import Anthropic from '@anthropic-ai/sdk';
import { fetchJson, keyEmpty } from './http.js';

const PREFER = {
  // 분류는 건마다 불리므로 비용 대비 빠른 sonnet 을 먼저 쓴다. 바꾸려면 환경변수 CLAUDE_MODEL 에 모델 이름을 넣는다
  claude: ['claude-sonnet-5-5', 'claude-sonnet-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-haiku-5-5'],
  groq: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'moonshotai/kimi-k2-instruct', 'qwen/qwen3-32b', 'llama-3.1-8b-instant'],
  // 목록에 있어도 「새 사용자에게는 더 이상 제공 안 함」(404) 인 옛 모델이 있어, 항상 최신을 가리키는 별칭을 먼저 쓴다
  gemini: ['gemini-flash-latest', 'gemini-pro-latest'],
};

// 목록 안에서 버전 숫자가 큰 순서(같으면 flash → pro → lite 순)로 정렬
function byNewest(list) {
  const ver = (id) => parseFloat((id.match(/(\d+(?:\.\d+)?)/) || [, '0'])[1]);
  const rank = (id) => (/lite/.test(id) ? 2 : /pro/.test(id) ? 1 : 0);
  return [...list].sort((a, b) => ver(b) - ver(a) || rank(a) - rank(b));
}

// 쓰지 않을 모델: 404(이름 문제)는 계속, 503(일시 과부하)은 10분 동안
const bad = { claude: new Map(), groq: new Map(), gemini: new Map() };
const isBad = (p, id) => (bad[p].get(id) || 0) > Date.now();

const cache = {}; // provider -> { model, at, list }
const TTL = 30 * 60 * 1000;

async function listClaude(key) {
  const client = new Anthropic({ apiKey: key, timeout: 10000, maxRetries: 0 });
  const ids = [];
  for await (const m of client.models.list()) ids.push(m.id);
  return ids;
}

async function listGroq(key) {
  const j = await fetchJson('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  }, 10000);
  return (j.data || [])
    .filter((m) => m.active !== false)
    .map((m) => m.id)
    .filter((id) => !/whisper|tts|guard|embed|playai|orpheus/i.test(id));
}

async function listGemini(key) {
  const j = await fetchJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': key },
  }, 10000);
  return (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((id) => /^gemini/.test(id) && !/image|tts|embedding|live|audio/i.test(id));
}

const LISTERS = { claude: listClaude, groq: listGroq, gemini: listGemini };
export const KEY_NAME = { claude: 'CLAUDE_API_KEY', groq: 'GROQ_API_KEY', gemini: 'GEMINI_API_KEY' };

export async function pickModel(provider) {
  const key = process.env[KEY_NAME[provider]];
  if (!key) throw keyEmpty(KEY_NAME[provider]);
  const c = cache[provider];
  if (c && Date.now() - c.at < TTL) return { key, model: c.model };
  const list = await LISTERS[provider](key);
  if (!list.length) {
    const e = new Error('모델 목록이 비어 있음');
    e.status = 404;
    throw e;
  }
  const usable = list.filter((id) => !isBad(provider, id));
  const ordered = provider === 'gemini' ? byNewest(usable.filter((id) => !/preview|exp/.test(id))) : usable;
  const forced = provider === 'claude' ? (process.env.CLAUDE_MODEL || '').trim() : '';
  const model = (forced && usable.includes(forced) ? forced : null) || PREFER[provider].find((p) => usable.includes(p)) || ordered[0] || usable[0];
  if (!model) {
    const e = new Error('쓸 수 있는 모델이 없음(모두 404)');
    e.status = 404;
    throw e;
  }
  cache[provider] = { model, at: Date.now(), list };
  return { key, model };
}

// 404·503 이 나면 그 모델을 잠시(또는 계속) 빼고, 다음 호출 때 목록에서 다른 모델을 고르게 한다
export function forgetModel(provider, model, status) {
  if (model) bad[provider].set(model, status === 404 ? Infinity : Date.now() + 10 * 60 * 1000);
  delete cache[provider];
}

export function cachedList(provider) { return cache[provider]?.list || null; }
