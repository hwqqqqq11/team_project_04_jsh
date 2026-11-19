// 공공데이터포털 키 — Encoding 키(%2B 같은 글자 포함)와 Decoding 키(+ / = 그대로) 둘 다 동작하게 한다.
// URLSearchParams 는 값을 한 번 더 인코딩하므로, 항상 「Decoding 본」을 만들어 넘긴다.
import { fetchJson, keyEmpty } from './http.js';

export function decodedKey(raw) {
  if (!raw) return raw;
  if (/%[0-9A-Fa-f]{2}/.test(raw)) {
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
  return raw;
}

// 공공데이터포털 오류 응답(XML·JSON)을 이유로 바꾼다
export function portalReason(body) {
  const t = typeof body === 'string' ? body : JSON.stringify(body || {});
  if (/SERVICE_KEY_IS_NOT_REGISTERED|등록되지 않은|returnReasonCode>30/.test(t)) return '승인 안 됨 — 등록되지 않은 키(30)';
  if (/SERVICE ACCESS DENIED|returnReasonCode>20/.test(t)) return '승인 안 됨 — 이 API 활용 신청 필요(20)';
  if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS|returnReasonCode>22/.test(t)) return '사용량 초과(22)';
  if (/NO_OPENAPI_SERVICE_ERROR|Unexpected errors|API not found|API_NOT_FOUND/i.test(t)) return '기능 주소 확인 필요(12)';
  return null;
}

export async function callPortal(base, params, ms = 12000) {
  const raw = process.env.DATA_GO_KR_KEY;
  if (!raw) throw keyEmpty('DATA_GO_KR_KEY');
  const qs = new URLSearchParams({ serviceKey: decodedKey(raw), ...params });
  const url = `${base}?${qs.toString()}`;
  const body = await fetchJson(url, {}, ms).catch((e) => {
    const r = portalReason(e.message);
    if (r) { const x = new Error(r); x.portal = true; throw x; }
    throw e;
  });
  const r = portalReason(body);
  if (r) { const x = new Error(r); x.portal = true; throw x; }
  return body;
}
