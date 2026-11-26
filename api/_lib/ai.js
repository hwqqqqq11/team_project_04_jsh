// AI 호출: CLAUDE_API_KEY → GROQ_API_KEY → GEMINI_API_KEY 순서.
// 앞이 실패하면(키 비어 있음 · 오류 · 시간 초과) 다음으로 넘어가고, 누가 답했는지와 실패 이유를 함께 돌려준다.
import Anthropic from '@anthropic-ai/sdk';
import { pickModel, forgetModel } from './models.js';
import { fetchJson, reasonOf } from './http.js';

const ORDER = ['claude', 'groq', 'gemini'];
const TIMEOUT = 25000;
const LABEL = { claude: 'Claude', groq: 'Groq', gemini: 'Gemini' };

// Claude 모델 중 서버 쪽 대체 모델(fallbacks)을 받는 모델
const FALLBACK_OK = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

async function callClaude({ key, model }, { system, user, maxTokens }) {
  const client = new Anthropic({ apiKey: key, timeout: TIMEOUT, maxRetries: 0 });
  const params = {
    model,
    max_tokens: maxTokens,
    system,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: user }],
  };
  let resp;
  if (FALLBACK_OK.has(model)) {
    try {
      resp = await client.beta.messages.create({
        ...params,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    } catch (err) {
      // 베타 기능이 막히거나 바뀐 경우(400)에는 일반 호출로 한 번 더 — 서비스가 멈추지 않게
      if (err.status !== 400) throw err;
      resp = await client.messages.create(params);
    }
  } else {
    resp = await client.messages.create(params);
  }
  if (resp.stop_reason === 'refusal') {
    const e = new Error('Claude 가 답하지 않음(refusal)');
    e.status = 'refusal';
    throw e;
  }
  const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { text, model: resp.model || model };
}

async function callGroq({ key, model }, { system, user, maxTokens, json }) {
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  };
  if (json) body.response_format = { type: 'json_object' };
  const j = await fetchJson('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, TIMEOUT);
  return { text: j.choices?.[0]?.message?.content || '', model };
}

async function callGemini({ key, model }, { system, user, maxTokens, json }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  const j = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, TIMEOUT);
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return { text, model };
}

const CALLERS = { claude: callClaude, groq: callGroq, gemini: callGemini };

// 응답에서 JSON 하나를 꺼낸다(앞뒤 설명이나 ``` 가 붙어도)
export function parseJson(text) {
  if (!text) return null;
  const t = text.replace(/```json|```/g, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

/**
 * @returns {{ ok: boolean, text?: string, data?: any, provider?: string, providerLabel?: string, model?: string, tried: {provider:string, reason:string}[] }}
 */
export async function callAI({ system, user, maxTokens = 2000, json = true }) {
  const tried = [];
  for (const p of ORDER) {
    // 404(모델 이름 문제)·503(일시 과부하)이면 같은 회사의 다음 모델로 더 시도한다
    for (let attempt = 0; attempt < 3; attempt++) {
      let picked = null;
      try {
        picked = await pickModel(p);
        const out = await CALLERS[p](picked, { system, user, maxTokens, json });
        const data = json ? parseJson(out.text) : null;
        if (json && !data) throw new Error('응답이 JSON 형식이 아님');
        return { ok: true, text: out.text, data, provider: p, providerLabel: LABEL[p], model: out.model, tried };
      } catch (err) {
        tried.push({ provider: LABEL[p], reason: `${reasonOf(err)}${picked ? ` [${picked.model}]` : ''}` });
        if ((err.status === 404 || err.status === 503) && picked) { forgetModel(p, picked.model, err.status); continue; }
        break;
      }
    }
  }
  return { ok: false, tried };
}
