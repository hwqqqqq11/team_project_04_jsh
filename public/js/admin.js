import { mountLayout, toast } from './layout.js';
import { requireRole } from './gate.js';
import { mountChat } from './chat.js';
import { init, startSync, storageMode, load, setAiPaused, reset, currentStage, esc, fmtTime, stageTag, srcBadge } from './store.js';

mountLayout('admin');
mountChat('관리자');
await requireRole('admin');
await init('all');

const $ = (s) => document.querySelector(s);
const STAGES = ['정상', '검토필요', '차단후보'];
let histFilter = '전체';

const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—');

function renderPause() {
  const on = load().settings.aiPaused;
  $('#pause').setAttribute('aria-checked', String(on));
  $('#pause-desc').textContent = on
    ? '지금 수동 모드입니다. 새 민원은 AI를 부르지 않고 1차 표현 목록 결과만 표시합니다.'
    : 'AI가 판단을 계속 잘못하면 켜세요. 새 민원부터 AI 표시가 멈추고 담당자가 직접 판단합니다.';
}

function renderKpis() {
  const { complaints } = load();
  const reviewed = complaints.filter((c) => c.final);
  // 판단 변경률: 담당자의 최종 단계가 AI 표시 단계와 다른 비율(기획서 3.8)
  const changed = reviewed.filter((c) => c.final.stage !== c.stage);
  const guided = complaints.filter((c) => c.guided);
  const fixed = guided.filter((c) => c.choice === '제안대로' || c.choice === '직접');
  const byStage = STAGES.map((s) => `${s} ${complaints.filter((c) => currentStage(c) === s).length}`).join(' · ');
  const kpi = (v, label, formula) => `<div class="kpi"><div class="kpi-value">${v}</div><div class="kpi-label">${label}</div><div class="kpi-formula">${formula}</div></div>`;
  $('#kpis').innerHTML = [
    kpi(complaints.length, '전체 민원', byStage),
    kpi(pct(changed.length, reviewed.length), '판단 변경률', `변경 ${changed.length} ÷ 검토 ${reviewed.length} × 100`),
    kpi(pct(fixed.length, guided.length), '수정 수용률', `고쳐 낸 ${fixed.length} ÷ 안내 창 ${guided.length} × 100 · 시연 참여자 기준`),
    kpi(complaints.length - reviewed.length, '확인 전 민원', '담당자가 아직 확정·변경하지 않은 건수'),
  ].join('');
}

function renderBars() {
  const { complaints } = load();
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d;
  });
  const counts = days.map((d) => {
    const next = d.getTime() + 86400000;
    const inDay = complaints.filter((c) => c.createdAt >= d.getTime() && c.createdAt < next);
    return Object.fromEntries(STAGES.map((s) => [s, inDay.filter((c) => currentStage(c) === s).length]));
  });
  const max = Math.max(1, ...counts.map((c) => STAGES.reduce((a, s) => a + c[s], 0)));
  const total = (c) => STAGES.reduce((a, s) => a + c[s], 0);
  const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  // 칸 안에는 단계별 건수(칸이 너무 낮으면 생략), 아래 날짜 옆에는 하루 합계를 적는다
  $('#bars').innerHTML = counts.map((c, i) => `<div class="bar" title="${md(days[i])} · ${STAGES.map((s) => `${s} ${c[s]}`).join(', ')}">${STAGES.map((s) => `<span class="b-${s}" style="height:${(c[s] / max) * 100}%">${c[s] && c[s] / max >= 0.14 ? c[s] : ''}</span>`).join('')}</div>`).join('');
  $('#bars').setAttribute('role', 'img');
  $('#bars').setAttribute('aria-label', `최근 7일 단계별 건수: ${days.map((d, i) => `${md(d)} ${total(counts[i])}건`).join(', ')}`);
  $('#bar-labels').innerHTML = days.map((d, i) => `<span>${md(d)}<b>${total(counts[i])}건</b></span>`).join('');
}

function renderMis() {
  const list = load().complaints.filter((c) => c.final && c.final.stage !== c.stage);
  $('#mis').innerHTML = list.length
    ? list.map((c) => `<div class="row" style="cursor:default"><div>${stageTag(c.stage)}<div class="caption-sm">→ ${esc(c.final.stage)}</div></div><div><div class="row-title">${esc(c.title)}</div><div class="row-text">${esc(c.summary)}</div></div><div class="row-meta"><span class="caption-sm">${esc(c.final.reason || '사유 없음')}</span><span class="caption-sm">${esc(c.second?.model || '')}</span></div></div>`).join('')
    : '<p class="empty">아직 없습니다. 분류 현황판에서 단계를 바꾸면 여기에 쌓입니다.</p>';
}

function renderHist() {
  const { history, complaints } = load();
  const kinds = ['전체', 'AI 표시', '단계 확정', '단계 변경', '소명 접수', '관리자'];
  $('#hist-filter').innerHTML = kinds.map((k) => `<button class="chip ${k === histFilter ? 'on' : ''}" type="button" data-k="${k}" aria-pressed="${k === histFilter}">${k}</button>`).join('');
  const rows = [...history].sort((a, b) => b.at - a.at).filter((h) => histFilter === '전체' || (histFilter === '관리자' ? h.actor === '관리자' : h.action.startsWith(histFilter))).slice(0, 100);
  const title = (id) => complaints.find((c) => c.id === id)?.title || '—';
  $('#hist').innerHTML = rows.map((h) => `<tr><td>${fmtTime(h.at)}</td><td>${esc(title(h.complaintId))}</td><td>${esc(h.action)}</td><td>${h.from ? `${esc(h.from)} → ` : ''}${esc(h.to || '')}</td><td>${esc(h.reason)}</td><td>${esc(h.actor)}</td><td>${esc(h.model)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">기록이 없습니다.</td></tr>';
}

async function renderStats() {
  try {
    const d = await (await fetch('/api/stats')).json();
    $('#stats').innerHTML = `
      <p class="h-md">${esc(d.title)} ${srcBadge(d.source)}</p>
      <p class="caption" style="margin-top:0">국민권익위원회 민원빅데이터 · 기준일 ${esc(d.date)}${d.source === 'demo' ? ` · 실시간 실패 이유: ${esc(d.reason)}` : ''}</p>
      <ul class="status-list">${d.topics.map((t, i) => `<li><span>${i + 1}. ${esc(t)}</span></li>`).join('')}</ul>
      <p class="fine">이 서비스의 판정 근거가 아닌 참고 자료입니다.${d.source === 'demo' ? ' 위 목록은 시연 값이며 실제 통계가 아닙니다.' : ''}</p>`;
  } catch (e) {
    $('#stats').innerHTML = `<p class="caption">참고 통계를 불러오지 못했습니다(${esc(e.message)}).</p>`;
  }
}

async function renderStatus() {
  try {
    const d = await (await fetch('/api/status?models=1')).json();
    const model = (p) => d.models?.find((m) => m.provider === p);
    const label = { CLAUDE_API_KEY: ['AI 1순위 · Claude', 'claude'], GROQ_API_KEY: ['AI 2순위 · Groq', 'groq'], GEMINI_API_KEY: ['AI 3순위 · Gemini', 'gemini'], LAW_OC: ['국가법령정보(챗봇 근거 시행일)'], DATA_GO_KR_KEY: ['공공데이터포털(참고 통계)'] };
    $('#status').innerHTML = d.keys.map((k) => {
      const [name, p] = label[k.name] || [k.name];
      const m = p ? model(p) : null;
      const right = !k.has ? '<span class="badge demo">비어 있음</span>'
        : m ? (m.model ? `<span class="badge live">${esc(m.model)}</span>` : `<span class="badge demo">${esc(m.reason)}</span>`) : '<span class="badge live">값 있음</span>';
      return `<li><span><strong>${esc(name)}</strong><br><span class="caption-sm">${esc(k.name)}</span></span>${right}</li>`;
    }).join('');
  } catch (e) {
    $('#status').innerHTML = `<li>상태를 확인하지 못했습니다(${esc(e.message)})</li>`;
  }
}

function refresh() { renderPause(); renderKpis(); renderBars(); renderMis(); renderHist(); }

$('#pause').addEventListener('click', async () => {
  try { await setAiPaused(!load().settings.aiPaused); refresh(); } catch (e) { toast(`바꾸지 못했습니다(${e.message})`); }
});
$('#hist-filter').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; histFilter = b.dataset.k; renderHist(); });
$('#reset').addEventListener('click', async () => {
  if (!confirm(`${storageMode() === 'server' ? '서버에 저장된' : '이 브라우저에 저장된'} 민원·이력을 모두 지우고 [가상 예시] 10건으로 되돌릴까요?`)) return;
  try { await reset(); refresh(); } catch (e) { toast(`되돌리지 못했습니다(${e.message})`); }
});
startSync(refresh);
refresh();
renderStats();
renderStatus();
