// 국가법령정보 공동활용(open.law.go.kr) — LAW_OC 로 현행 법령·자치법규의 시행일을 확인한다.
// 실패하면 이유(키 비어 있음 · 승인 안 됨 · 시간 초과)와 「시연 값」(답변참고문서에 적힌 현행본)을 함께 준다.
import { readBody, send, fetchJson, keyEmpty, reasonOf } from './_lib/http.js';
import { docInfo } from './_lib/rag.js';

// 답변참고문서 이름 → 국가법령정보 검색 대상
export const LAW_DOCS = {
  '민원 처리에 관한 법률': { target: 'law', query: '민원 처리에 관한 법률' },
  '민원 처리에 관한 법률 시행령': { target: 'law', query: '민원 처리에 관한 법률 시행령' },
  '개인정보 보호법': { target: 'law', query: '개인정보 보호법' },
  '개인정보 보호법_제37조의2 자동화된 결정': { target: 'law', query: '개인정보 보호법' },
  '개인정보의 안전성 확보조치 기준': { target: 'admrul', query: '개인정보의 안전성 확보조치 기준' },
  '인공지능 발전과 신뢰 기반 조성 등에 관한 기본법': { target: 'law', query: '인공지능 발전과 신뢰 기반 조성 등에 관한 기본법' },
  '인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 시행령': { target: 'law', query: '인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 시행령' },
  '행정기본법': { target: 'law', query: '행정기본법' },
  '서울특별시 성북구 민원업무담당 공무원 등의 보호 및 지원에 관한 조례': { target: 'ordin', query: '성북구 민원업무담당 공무원 등의 보호 및 지원에 관한 조례' },
  '서울특별시 성북구 지능정보화 기본 조례': { target: 'ordin', query: '성북구 지능정보화 기본 조례' },
};

const cache = new Map();
const fmt = (d) => (d && /^\d{8}$/.test(d) ? `${d.slice(0, 4)}.${+d.slice(4, 6)}.${+d.slice(6, 8)}.` : d || null);
const squash = (s) => String(s || '').replace(/\s/g, '');

async function lookupLive({ target, query }) {
  const oc = process.env.LAW_OC;
  if (!oc) throw keyEmpty('LAW_OC');
  const qs = new URLSearchParams({ OC: oc, target, type: 'JSON', query, display: '20' });
  const j = await fetchJson(`https://www.law.go.kr/DRF/lawSearch.do?${qs}`, {}, 10000);
  if (typeof j === 'string') {
    const e = new Error(/검증|인증|OC/.test(j) ? '승인 안 됨 — OC 확인 또는 API 신청 필요' : '응답 형식 오류');
    e.status = /검증|인증|OC/.test(j) ? 403 : undefined;
    throw e;
  }
  const root = j.LawSearch || j.OrdinSearch || j.AdmRulSearch || Object.values(j)[0] || {};
  let items = root.law || root.ordin || root.admrul || [];
  if (!Array.isArray(items)) items = [items];
  const nameOf = (x) => x['법령명한글'] || x['자치법규명'] || x['행정규칙명'] || '';
  const want = squash(query);
  const hit = items.find((x) => squash(nameOf(x)) === want)
    || items.find((x) => squash(nameOf(x)).endsWith(want))
    || items.find((x) => squash(nameOf(x)).includes(want));
  if (!hit) {
    const e = new Error('검색 결과 없음');
    e.status = 404;
    throw e;
  }
  return {
    name: nameOf(hit),
    enforced: fmt(hit['시행일자']),
    promulgated: fmt(hit['공포일자'] || hit['발령일자']),
    number: hit['공포번호'] || hit['발령번호'] || null,
    org: hit['지자체기관명'] || hit['소관부처명'] || null,
  };
}

export async function lawStatus(doc) {
  const spec = LAW_DOCS[doc];
  if (!spec) return null;
  if (cache.has(doc) && Date.now() - cache.get(doc).at < 6 * 3600 * 1000) return cache.get(doc).value;
  const info = docInfo(doc) || {};
  let value;
  try {
    const live = await lookupLive(spec);
    value = { doc, source: 'live', ...live, docCurrent: info.current };
  } catch (err) {
    value = { doc, source: 'demo', reason: reasonOf(err), demo: info.current ? `${info.current} (답변참고문서 기준, 확인일 ${info.checked})` : '답변참고문서에 현행본 정보 없음' };
  }
  cache.set(doc, { at: Date.now(), value });
  return value;
}

export default async function handler(req, res) {
  const body = req.method === 'POST' ? await readBody(req) : {};
  const url = new URL(req.url, 'http://x');
  const docs = body.docs || (url.searchParams.get('doc') ? [url.searchParams.get('doc')] : Object.keys(LAW_DOCS));
  const out = await Promise.all(docs.filter((d) => LAW_DOCS[d]).map(lawStatus));
  send(res, 200, { items: out });
}
