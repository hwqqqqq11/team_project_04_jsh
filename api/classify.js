// 민원 글 분류: ① 개인정보 가림 → ② 1차 표현 목록 → ③ 2차 AI 문맥 판단 → ④ 둘이 다르면 검토필요
// AI 는 표시·제안만 한다. 최종 단계는 담당 공무원이 정한다.
import { readBody, send } from './_lib/http.js';
import { maskPII } from './_lib/mask.js';
import { checkWords, hideWords } from './_lib/wordlist.js';
import { callAI } from './_lib/ai.js';
import { criteriaText } from './_lib/rag.js';

const STAGES = ['정상', '검토필요', '차단후보'];

const SYSTEM = `너는 성북구청 「구청장에게 바란다」 글 민원을 담당 공무원이 보기 전에 표시하는 보조 도구다.
결정하지 않고 표시·제안만 한다. 최종 판단은 담당 공무원이 한다.

[판단 기준]
${criteriaText()}

[주의]
- 구정에 대한 강한 불만·비판, 업무 능력 비판, 징계 청구 같은 정당한 권리 행사는 그 자체로 정상이다.
- 사투리·구어체·맞춤법 오류·고령층 문장은 그것만으로 문제 삼지 않는다.
- 비꼬기·돌려 말한 비하·은어처럼 애매하면 검토필요.
- 욕설·인격 모욕·신체 위협·성희롱이 뚜렷하면 차단후보.
- *** 는 개인정보를 가린 자리다. 그대로 둔다.

[순화본 규칙]
- 민원의 요구·사실관계(장소, 날짜, 횟수, 요청 내용)는 하나도 빼거나 바꾸지 않는다.
- 욕설·모욕·위협·성희롱 표현만 정중한 말로 바꾸거나 뺀다. 문제 표현이 없으면 원문 그대로 둔다.

[출력] 아래 JSON 하나만 출력한다. 다른 말은 쓰지 않는다.
{"stage":"정상|검토필요|차단후보",
 "evidence":["문제가 된 문장(원문에서 그대로 인용, 없으면 빈 배열)"],
 "reason":"판단 이유 한 줄",
 "normal_basis":"정상 민원일 수 있는 근거 한 줄(예: 도로 보수 요구)",
 "softened":"순화본 전체",
 "summary":"핵심 요약 1~2문장",
 "fixes":[{"from":"문제 문장","to":"제안 문장","why":"이유 한 줄"}]}`;

function firstSummary(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST 만 받습니다' });
  const { text = '', aiPaused = false } = await readBody(req);
  const original = String(text).slice(0, 4000);
  if (!original.trim()) return send(res, 400, { error: '민원 내용이 비어 있습니다' });

  const t0 = Date.now();
  const pii = maskPII(original);
  const first = checkWords(pii.text);
  const firstMs = Date.now() - t0;
  const hidden = hideWords(pii.text, first.hits);

  const base = {
    maskedText: pii.text,          // 개인정보만 가린 글 — 「원문 보기」용
    hiddenText: hidden,            // 개인정보 + 목록 표현(○○) 가린 글
    piiFound: pii.found,
    first: { stage: first.stage, hits: first.hits, ms: firstMs, listSize: first.listSize },
  };

  // 관리자가 AI 표시를 멈춘 수동 모드: 1차 결과만 표시
  if (aiPaused) {
    return send(res, 200, {
      ...base,
      stage: first.stage === '정상' ? '정상' : '검토필요',
      mode: 'manual',
      second: null,
      softened: hidden,
      summary: firstSummary(hidden),
      fixes: [],
      note: '수동 모드 — AI 판단 없이 1차 목록 결과만 표시합니다.',
    });
  }

  const ai = await callAI({ system: SYSTEM, user: `[민원 글]\n${pii.text}`, maxTokens: 2500 });

  if (!ai.ok || !STAGES.includes(ai.data?.stage)) {
    return send(res, 200, {
      ...base,
      stage: '검토필요',
      mode: 'ai-failed',
      second: { source: 'demo', tried: ai.tried, reason: 'AI 판단 없음 → 검토필요(사람이 판단)' },
      softened: hidden,
      summary: firstSummary(hidden),
      fixes: [],
      note: 'AI 를 부르지 못해 1차 목록 결과와 가린 글만 보여 줍니다.',
    });
  }

  const d = ai.data;
  const agree = d.stage === first.stage;
  const stage = agree ? d.stage : '검토필요';
  return send(res, 200, {
    ...base,
    stage,
    mode: 'ai',
    agree,
    second: {
      source: 'live',
      stage: d.stage,
      evidence: Array.isArray(d.evidence) ? d.evidence.slice(0, 5) : [],
      reason: d.reason || '',
      normalBasis: d.normal_basis || '',
      provider: ai.providerLabel,
      model: ai.model,
      tried: ai.tried,
    },
    softened: d.softened || hidden,
    summary: d.summary || firstSummary(hidden),
    fixes: Array.isArray(d.fixes) ? d.fixes.slice(0, 5) : [],
    note: agree ? '' : `1차(${first.stage})와 2차 AI(${d.stage}) 판단이 달라 검토필요로 보냅니다.`,
  });
}
