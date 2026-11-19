import { mountLayout } from './layout.js';
import { mountChat } from './chat.js';
import { load, decide, currentStage, esc, fmtTime, stageTag } from './store.js';

mountLayout('staff');
mountChat('담당 공무원');

const STAGES = ['정상', '검토필요', '차단후보'];
// 변경 사유는 선택형으로 한 번에 고른다 — 긴 사유를 쓰게 하면 AI 를 따르려는 유인이 커진다(기획서 4.3)
const REASONS = ['정당한 비판·요구임', '비꼬기·비하가 있음', '욕설·위협이 뚜렷함', '성희롱 표현이 있음', '사투리·구어체 오인', '기타'];
const $ = (s) => document.querySelector(s);
let tab = '검토필요';
let selected = null;
let showRaw = false;
let changing = false;

function renderTabs() {
  const all = load().complaints;
  $('#tabs').innerHTML = STAGES.map((s) => {
    const n = all.filter((c) => currentStage(c) === s).length;
    return `<button class="chip" role="tab" aria-selected="${s === tab}" data-tab="${s}">${stageTag(s)}<span class="count">${n}</span></button>`;
  }).join('');
  const { settings } = load();
  $('#mode-note').innerHTML = settings.aiPaused
    ? '<div class="notice" style="margin-bottom:18px"><strong>수동 모드</strong> — 관리자가 AI 표시를 멈췄습니다. 새 민원은 1차 표현 목록 결과만 표시됩니다.</div>'
    : '';
}

function renderList() {
  const items = load().complaints.filter((c) => currentStage(c) === tab);
  if (!items.length) { $('#list').innerHTML = `<p class="empty">${esc(tab)} 단계 민원이 없습니다.</p>`; return; }
  $('#list').innerHTML = items.map((c) => `
    <button class="row" type="button" data-id="${c.id}" aria-current="${c.id === selected}">
      <div>${stageTag(currentStage(c))}</div>
      <div><div class="row-title">${esc(c.title)}</div><div class="row-text">${esc(c.summary || c.softened)}</div></div>
      <div class="row-meta"><span class="caption-sm">${fmtTime(c.createdAt)}</span>${c.final ? `<span class="badge final">${c.final.changed ? '변경' : '확정'}</span>` : '<span class="badge">확인 전</span>'}${c.demo ? '<span class="badge">가상 예시</span>' : ''}${c.appeal ? '<span class="badge demo">소명 있음</span>' : ''}</div>
    </button>`).join('');
}

function renderDetail() {
  const box = $('#detail');
  const c = load().complaints.find((x) => x.id === selected);
  if (!c) { box.innerHTML = '<p class="empty">왼쪽 목록에서 민원을 고르세요.</p>'; return; }
  const s = c.second || {};
  const hist = load().history.filter((h) => h.complaintId === c.id);
  const aiLine = c.mode === 'manual' ? '수동 모드 — AI 판단 없음'
    : s.source === 'live' ? `${esc(s.provider)} · ${esc(s.model)}` : s.provider === '시연 값' ? '시연 값 · [가상 예시]' : 'AI 판단 없음';
  const showHidden = currentStage(c) !== '정상';
  box.innerHTML = `
    <div class="detail-head">
      <div><p class="caption-sm" style="margin:0">${fmtTime(c.createdAt)} 접수${c.choice !== '없음' ? ` · 민원인 안내 창 선택: ${esc(c.choice)}` : ''}</p><h2 class="h-lg" style="margin:4px 0 0">${esc(c.title)}</h2></div>
      <div>${stageTag(currentStage(c))} ${c.final ? `<span class="badge final">담당자 ${c.final.changed ? '변경' : '확정'}</span>` : '<span class="badge">AI 표시 · 확인 전</span>'}</div>
    </div>
    ${c.note ? `<p class="caption">${esc(c.note)}</p>` : ''}
    <div class="panel"><div class="panel-label"><span>순화본</span><span class="ai-mark">AI가 만든 문장</span></div><p>${esc(c.softened)}</p></div>
    <div class="panel"><div class="panel-label"><span>핵심 요약</span><span class="ai-mark">AI가 만든 문장</span></div><p>${esc(c.summary)}</p></div>
    <div class="versus">
      <div class="panel"><div class="panel-label"><span>AI 판단 이유 · ${esc(s.stage || '—')}</span></div><p>${esc(s.reason || '—')}</p></div>
      <div class="panel"><div class="panel-label"><span>정상 민원일 수 있는 근거</span></div><p>${esc(s.normalBasis || '—')}</p></div>
    </div>
    <p class="caption-sm">1차 표현 목록: ${esc(c.first?.stage || '—')}${c.first?.hits?.length ? ` (${esc(c.first.hits.map((h) => h.type).filter((v, i, a) => a.indexOf(v) === i).join(', '))})` : ''} · 2차 AI: ${aiLine}${s.tried?.length ? ` · 앞 순서 실패: ${esc(s.tried.map((t) => `${t.provider} ${t.reason}`).join(', '))}` : ''}</p>
    <button class="btn secondary sm" type="button" id="raw-btn" aria-expanded="${showRaw}">${showRaw ? '원문 닫기' : '원문 보기'}</button>
    ${showRaw ? `<div class="raw" style="margin-top:8px"><div class="panel-label"><span>원문${showHidden ? ' (문제 표현 ○○ 가림)' : ''} · 개인정보 *** 가림</span></div><p>${esc(showHidden ? c.hiddenText : c.maskedText)}</p>${showHidden && c.hiddenText !== c.maskedText ? '<button class="btn outline sm" type="button" id="full-btn" style="margin-top:12px">가린 표현까지 보기</button><p id="full" hidden style="margin-top:12px"></p>' : ''}</div>` : ''}
    ${c.appeal ? `<div class="panel" style="margin-top:8px"><div class="panel-label"><span>민원인 소명 · ${fmtTime(c.appeal.at)}</span></div><p>${esc(c.appeal.text)}</p></div>` : ''}
    <div class="decide">
      <p class="h-md">단계 정하기</p>
      <p class="caption" style="margin-top:0">AI 표시는 참고자료입니다. AI와 다르게 판단해도 됩니다.</p>
      ${changing ? `
        <div class="chips" role="radiogroup" aria-label="바꿀 단계" id="to-stage">${STAGES.filter((x) => x !== currentStage(c)).map((x, i) => `<button class="chip ${i === 0 ? 'on' : ''}" type="button" role="radio" aria-checked="${i === 0}" data-to="${x}">${x}</button>`).join('')}</div>
        <p class="caption-sm" style="margin:12px 0 0">사유(선택)</p>
        <div class="reasons" id="reasons">${REASONS.map((r) => `<button class="chip" type="button" data-r="${r}" aria-pressed="false">${r}</button>`).join('')}</div>
        <div class="btn-row"><button class="btn" type="button" id="save-change">변경 저장</button><button class="btn secondary" type="button" id="cancel-change">취소</button></div>`
      : `<div class="btn-row"><button class="btn" type="button" id="confirm">${esc(currentStage(c))}(으)로 확정</button><button class="btn secondary" type="button" id="change">단계 변경</button></div>`}
    </div>
    <div class="section" style="margin-top:32px">
      <p class="h-md">판단 이력</p>
      <ul class="timeline">${hist.map((h) => `<li><span class="caption-sm">${fmtTime(h.at)}</span><span><strong>${esc(h.action)}</strong> ${h.from ? `${esc(h.from)} → ` : ''}${esc(h.to || '')} · ${esc(h.actor)}${h.reason ? ` · ${esc(h.reason)}` : ''}${h.model && h.model !== '—' ? ` <span class="muted">(${esc(h.model)})</span>` : ''}</span></li>`).join('')}</ul>
      <p class="fine">시제품은 이 브라우저에 저장합니다. 실제 도입 때는 고칠 수 없는 서버 기록으로 바꿔야 합니다.</p>
    </div>`;

  box.querySelector('#raw-btn').addEventListener('click', () => { showRaw = !showRaw; renderDetail(); });
  box.querySelector('#full-btn')?.addEventListener('click', (e) => {
    const p = box.querySelector('#full');
    p.hidden = false;
    p.textContent = c.maskedText;
    e.target.remove();
  });
  box.querySelector('#confirm')?.addEventListener('click', () => { decide(c.id, currentStage(c), '', false); refresh(); });
  box.querySelector('#change')?.addEventListener('click', () => { changing = true; renderDetail(); });
  box.querySelector('#cancel-change')?.addEventListener('click', () => { changing = false; renderDetail(); });
  box.querySelector('#to-stage')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-to]'); if (!b) return;
    box.querySelectorAll('#to-stage .chip').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
  });
  box.querySelector('#reasons')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    box.querySelectorAll('#reasons .chip').forEach((x) => { const on = x === b && !x.classList.contains('on'); x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
  });
  box.querySelector('#save-change')?.addEventListener('click', () => {
    const to = box.querySelector('#to-stage .chip.on')?.dataset.to;
    const r = box.querySelector('#reasons .chip.on')?.dataset.r || '';
    if (!to) return;
    decide(c.id, to, r, true);
    changing = false;
    tab = to;
    refresh();
  });
}

function refresh() { renderTabs(); renderList(); renderDetail(); }

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  tab = b.dataset.tab; selected = null; showRaw = false; changing = false; refresh();
});
$('#list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]'); if (!b) return;
  selected = b.dataset.id; showRaw = false; changing = false; refresh();
  if (window.matchMedia('(max-width: 1023px)').matches) $('#detail').focus();
});

// 처음엔 검토필요 탭의 첫 민원을 연다
const first = load().complaints.find((c) => currentStage(c) === tab);
selected = first?.id || null;
refresh();
window.addEventListener('storage', refresh);
