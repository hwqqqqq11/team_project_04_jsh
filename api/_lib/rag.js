// 답변참고문서 찾기 — 서버는 docs/답변참고문서/청킹 만 읽는다(원본·청킹전은 읽지 않음)
// 방식: 글자 2개 묶음(바이그램) 겹침 점수 + 드문 묶음일수록 가중치(IDF). 키워드 줄은 2배.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'docs', '답변참고문서', '청킹');
let CHUNKS = null;

function bigrams(s) {
  const t = String(s || '').toLowerCase().replace(/[^가-힣a-z0-9]/g, '');
  const out = new Set();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

// 질문에 흔히 붙는 말은 점수에서 뺀다
const STOP = new Set(['어떻', '떻게', '나요', '하나', '되나', '는지', '인가', '할수', '수있', '있나', '있는', '하는', '에서', '으로', '합니', '니다', '습니', '나요', '면서', '제가', '저는', '무엇', '언제', '누구', '어디', '은어']);

export function loadChunks() {
  if (CHUNKS) return CHUNKS;
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.md'));
  CHUNKS = files.map((file) => {
    const raw = fs.readFileSync(path.join(DIR, file), 'utf8');
    const m = file.match(/^(.*)_(\d{2})_(.*)\.md$/);
    const doc = m ? m[1] : file.replace(/\.md$/, '');
    const section = m ? m[3] : '';
    const kw = (raw.match(/^키워드:(.*)$/m) || [, ''])[1];
    const body = raw.replace(/^출처:.*$/m, '').replace(/^키워드:.*$/m, '').trim();
    return { file, doc, section, isInfo: section === '문서정보', kw, body, grams: bigrams(body), kwGrams: bigrams(kw + doc + section) };
  });
  // IDF
  const df = new Map();
  for (const c of CHUNKS) for (const g of new Set([...c.grams, ...c.kwGrams])) df.set(g, (df.get(g) || 0) + 1);
  CHUNKS.df = df;
  return CHUNKS;
}

export function search(query, k = 5) {
  const chunks = loadChunks();
  const N = chunks.length;
  const q = [...bigrams(query)].filter((g) => !STOP.has(g));
  if (!q.length) return [];
  const scored = chunks.map((c) => {
    let s = 0;
    for (const g of q) {
      const idf = Math.log(1 + N / (chunks.df.get(g) || N));
      if (c.kwGrams.has(g)) s += 2 * idf;
      if (c.grams.has(g)) s += idf;
    }
    if (c.isInfo) s *= 0.5;
    return { ...c, score: s / Math.sqrt(q.length) };
  });
  return scored.filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

// 분류 지시문에 붙일 판단 기준(운영 기준 문서의 3단계 분류 기준 조각)
export function criteriaText() {
  const c = loadChunks().find((x) => x.doc === '성북 안심 민원 필터 서비스 운영 기준' && x.section.includes('3단계분류기준'));
  return c ? c.body : '';
}

// 문서 정보 조각에서 「현행본」 줄을 꺼낸다(법령 API 시연 값으로 쓴다)
export function docInfo(doc) {
  const c = loadChunks().find((x) => x.doc === doc && x.isInfo);
  if (!c) return null;
  const pick = (label) => (c.body.match(new RegExp(`-\\s*${label}:\\s*(.*)`)) || [, null])[1];
  return { current: pick('현행본'), checked: pick('확인일'), url: pick('출처') };
}

export function contactText() {
  const c = loadChunks().find((x) => x.doc === '성북구 문의처 안내' && !x.isInfo);
  return c ? c.body : '성북구청 감사담당관 02-2241-4901';
}
