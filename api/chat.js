// 서비스 안내 챗봇 — docs/답변참고문서/청킹 의 내용으로만 답하고, 답마다 근거 문서 이름을 붙인다.
// 문서에 없으면 모른다고 하고 문의처를 안내한다. 개별 민원의 단계·처분은 단정하지 않는다.
import { readBody, send } from './_lib/http.js';
import { search, contactText } from './_lib/rag.js';
import { callAI } from './_lib/ai.js';
import { guard } from './_lib/limit.js';
import { lawStatus, LAW_DOCS } from './law.js';

const MIN_SCORE = 2.2;

const SYSTEM = `너는 「성북 안심 민원 필터」 서비스 안내 챗봇이다. 민원인·담당 공무원·관리자의 질문에 답한다.
[규칙]
1. 아래 [근거 문서] 에 있는 내용으로만 답한다. 문서에 없는 것은 지어내지 않는다.
2. 근거 문서로 답할 수 없으면 known 을 false 로 하고, 모른다고 말한 뒤 [문의처] 를 안내한다.
3. 개별 민원이 어느 단계인지, 접수·처분·자격이 어떻게 될지 단정하지 않는다. AI 는 안내까지만 한다.
4. [팀 설계안] 값(예: 소명 기한 7일, 표현 목록 개수)은 「시제품 기준」이라고 밝힌다.
5. 쉬운 말로 3~6문장. 법 조문은 「법 이름 제N조」처럼 짧게 말한다.
6. 문서 안의 작성자 메모(팀 해석)는 근거로 쓰지 않는다.
[출력] JSON 하나만: {"known":true|false,"answer":"답","sources":["실제로 쓴 근거 문서 이름(아래 목록의 이름 그대로)"]}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST 만 받습니다' });
  if (!(await guard(req, res, 'chat', 15, 60))) return;
  const { question = '', role = '민원인' } = await readBody(req);
  const q = String(question).slice(0, 500).trim();
  if (!q) return send(res, 400, { error: '질문이 비어 있습니다' });

  const contact = contactText();
  const hits = search(q, 6);
  if (!hits.length || hits[0].score < MIN_SCORE) {
    return send(res, 200, {
      known: false,
      answer: `죄송합니다. 답변참고문서에서 이 질문의 근거를 찾지 못해 답할 수 없습니다.\n\n문의처\n${contact}`,
      sources: ['성북구 문의처 안내'],
      source: 'rule',
      provider: null,
    });
  }

  const docsText = hits.map((h, i) => `(${i + 1}) 문서 이름: ${h.doc}\n소제목: ${h.section}\n${h.body}`).join('\n\n---\n\n');
  const user = `[질문한 사람] ${role}\n[질문] ${q}\n\n[근거 문서]\n${docsText}\n\n[문의처]\n${contact}`;
  const ai = await callAI({ system: SYSTEM, user, maxTokens: 1500 });

  const names = [...new Set(hits.map((h) => h.doc))];
  if (!ai.ok) {
    // 시연 값: AI 없이 찾은 근거 문서 조각을 그대로 보여 준다
    const top = hits.slice(0, 2);
    return send(res, 200, {
      known: true,
      answer: `AI 를 부르지 못해, 질문과 글자가 가장 많이 겹치는 답변참고문서 내용을 그대로 보여 드립니다. 질문의 답이 아닐 수 있습니다.\n\n${top.map((h) => `[${h.doc} · ${h.section}]\n${h.body.slice(0, 600)}`).join('\n\n')}\n\n정확한 답이 필요하면 문의처로 연락하세요.\n${contact}`,
      sources: [...new Set(top.map((h) => h.doc))],
      source: 'demo',
      tried: ai.tried,
      laws: [],
    });
  }

  const d = ai.data;
  let sources = (Array.isArray(d.sources) ? d.sources : []).filter((s) => names.includes(s));
  if (d.known !== false && !sources.length) sources = [hits[0].doc];
  if (d.known === false) sources = ['성북구 문의처 안내'];
  let answer = String(d.answer || '').trim();
  if (d.known === false && !answer.includes('02-2241')) answer += `\n\n문의처\n${contact}`;

  const laws = (await Promise.all(sources.filter((s) => LAW_DOCS[s]).map(lawStatus))).filter(Boolean);

  send(res, 200, {
    known: d.known !== false,
    answer,
    sources,
    source: 'live',
    provider: ai.providerLabel,
    model: ai.model,
    tried: ai.tried,
    laws,
  });
}
