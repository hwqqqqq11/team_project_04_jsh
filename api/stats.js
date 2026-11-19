// 관리자 화면 「참고 통계」 — 국민권익위원회 민원빅데이터 분석정보(공공데이터포털) 「오늘의 민원 이슈」
// 이 서비스의 판정 근거가 아닌 참고 자료다. 실패하면 이유(키 비어 있음 · 승인 안 됨 · 시간 초과)와 시연 값을 준다.
// ※ 성북구 단위 「지역 인구수 대비 민원 현황」은 기능 주소를 아직 확인하지 못했다(OpenAPI 기술문서 확인 필요).
import { send, reasonOf } from './_lib/http.js';
import { callPortal } from './_lib/publicapi.js';

const BASE = 'https://apis.data.go.kr/1140100/minAnalsInfoView5';
const OP = 'minTodayTopicInfo5';

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

// 시연 값 — 실제 통계가 아님을 화면에 표시한다
const DEMO_TOPICS = ['불법 주정차 단속', '도로 파손·포트홀', '가로등 고장', '생활 소음', '쓰레기 무단 투기'];

let cache = null;

function pickTopics(body) {
  const list = body?.response?.body?.items?.item || body?.body?.items || body?.items || body?.data || body?.list || [];
  const arr = Array.isArray(list) ? list : [list];
  return arr.map((x) => (typeof x === 'string' ? x : x.topic || x.keyword || x.title || x.label || Object.values(x)[0]))
    .filter(Boolean).slice(0, 10);
}

export default async function handler(req, res) {
  if (cache && Date.now() - cache.at < 3600 * 1000) return send(res, 200, cache.value);
  const day = ymd(new Date(Date.now() - 86400000));
  let value;
  try {
    const body = await callPortal(`${BASE}/${OP}`, { dataType: 'json', searchDate: day, target: 'pttn,dfpt,saeol', todayTopicTopN: '10' });
    const topics = pickTopics(body);
    if (!topics.length) throw new Error('응답이 비어 있음');
    value = { source: 'live', title: '오늘의 민원 이슈(전국)', date: day, topics };
  } catch (err) {
    value = { source: 'demo', reason: err.portal ? err.message : reasonOf(err), title: '오늘의 민원 이슈(전국)', date: day, topics: DEMO_TOPICS };
  }
  cache = { at: Date.now(), value };
  send(res, 200, value);
}
