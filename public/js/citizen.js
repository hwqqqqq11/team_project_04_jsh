import { mountLayout, toast } from './layout.js';
import { mountChat } from './chat.js';
import { init, load, addComplaint, appeal, esc, fmtTime } from './store.js';

mountLayout('citizen');
mountChat('민원인');
await init('mine');

const APPEAL_DAYS = 7; // [팀 설계안] 소명 기한 — 시제품 기준
const $ = (s) => document.querySelector(s);
const form = $('#form');
const titleEl = $('#title');
const textEl = $('#text');
const submitBtn = $('#submit');
const errEl = $('#form-error');
const modal = $('#modal');
const done = $('#done');

// [가상 예시] — 기획서 표 2 에서 골랐다(욕설 대신 위협·성희롱·비꼬기 예시로 시연)
const SAMPLES = [
  { label: '정상', title: '골목 가로등 고장', text: '성북동 골목 가로등이 일주일째 꺼져 있어 밤길이 위험합니다. 빨리 고쳐 주세요.' },
  { label: '정상(강한 불만)', title: '도로 보수 재요청', text: '도대체 몇 번을 건의해야 도로를 고쳐 줍니까? 정말 답답하고 화가 납니다.' },
  { label: '비꼬기', title: '직원 근무 태도', text: '구청 직원분들은 하루 종일 커피만 마시며 신선놀음 하시나 봐요.' },
  { label: '위협', title: '처리 기한 요구', text: '내일까지 처리 안 되면 칼 들고 찾아가서 가만 안 둔다. 보도블록 깨진 거 당장 고쳐.' },
  { label: '성희롱', title: '전화 응대 후 글', text: '목소리 들으니 기분 좋네, 민원 들어주면 맛있는 거 사줄게, 예쁘게 하고 나와.' },
];
$('#samples').innerHTML = SAMPLES.map((s, i) => `<button type="button" class="chip" data-i="${i}">${esc(s.label)}</button>`).join('');
$('#samples').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  const s = SAMPLES[+b.dataset.i];
  titleEl.value = s.title;
  textEl.value = s.text;
  textEl.focus();
});

let last = null;          // 마지막 분류 결과
let editingAfterGuide = false; // 안내 창에서 「직접 고치기」를 골랐는지

async function classify(text) {
  const { settings } = load();
  const r = await fetch('/api/classify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, aiPaused: settings.aiPaused }),
    signal: AbortSignal.timeout(50000),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || `오류 ${r.status}`);
  return d;
}

function busy(on, label = 'AI가 글을 확인하는 중… (길면 30초쯤 걸려요)') {
  submitBtn.disabled = on;
  submitBtn.textContent = on ? label : '제출하기';
}

async function finish(result, choice, guided) {
  const c = {
    id: `c-${Date.now()}`, mine: true, createdAt: Date.now(), title: titleEl.value.trim() || '(제목 없음)',
    maskedText: result.maskedText, hiddenText: result.hiddenText, softened: result.softened, summary: result.summary,
    stage: result.stage, mode: result.mode, note: result.note, agree: result.agree,
    first: result.first, second: result.second, fixes: result.fixes, piiFound: result.piiFound,
    choice, guided, final: null, appeal: null, sig: result.sig,
  };
  try { await addComplaint(c); }
  catch (err) { errEl.textContent = `접수하지 못했습니다(${err.message}). 잠시 뒤 다시 제출해 주세요.`; return; }
  form.hidden = true;
  done.hidden = false;
  done.innerHTML = `
    <p class="done-title">접수되었습니다</p>
    <p>${choice === '그대로' ? '일부 표현은 가려진 채 담당자에게 전달됩니다.' : '담당자가 확인한 뒤 답변을 드립니다.'} 처리 기간은 주말·공휴일을 빼고 7일입니다.</p>
    ${result.piiFound?.length ? `<p class="caption">AI에 보내기 전에 가린 정보: ${esc(result.piiFound.join(', '))}</p>` : ''}
    <div class="btn-row" style="margin-top:24px"><button class="btn" type="button" id="again">새 민원 쓰기</button></div>`;
  done.focus();
  $('#again').addEventListener('click', () => {
    form.reset(); form.hidden = false; done.hidden = true; editingAfterGuide = false; titleEl.focus();
  });
  renderMine();
}

function openModal(result) {
  const fixes = result.fixes?.length
    ? result.fixes.map((f) => `<div class="fix"><div class="fix-from">${esc(f.from)}</div><div class="fix-to">→ ${esc(f.to)}</div><div class="fix-why">${esc(f.why)} · <span class="ai-mark">AI가 만든 문장</span></div></div>`).join('')
    : `<div class="fix"><div>${esc(result.hiddenText)}</div><div class="fix-why">${esc(result.first.hits.map((h) => h.type).filter((v, i, a) => a.indexOf(v) === i).join(', '))} 표현이 있습니다.</div></div>`;
  $('#fixes').innerHTML = fixes;
  modal.classList.add('open');
  modal.querySelector('[data-choice]').focus();
}
function closeModal() { modal.classList.remove('open'); }
modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); textEl.focus(); } });

modal.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-choice]');
  if (!b) return;
  const choice = b.dataset.choice;
  closeModal();
  if (choice === '그대로') return await finish(last, '그대로', true);
  if (choice === '직접') {
    editingAfterGuide = true;
    $('#text-help').textContent = '표현을 고친 뒤 다시 제출하세요. 요구 내용은 그대로 두셔도 됩니다.';
    textEl.focus();
    return;
  }
  // 제안대로: AI 순화본으로 바꾸고 다시 확인해서 접수
  textEl.value = last.softened;
  busy(true, '고친 글로 접수 중…');
  try {
    const again = await classify(textEl.value);
    await finish(again, '제안대로', true);
  } catch (err) {
    errEl.textContent = `다시 확인하지 못했습니다(${err.message}). 그대로 제출하거나 잠시 뒤 다시 시도하세요.`;
  } finally { busy(false); }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.textContent = '';
  if (!titleEl.value.trim() || !textEl.value.trim()) { errEl.textContent = '제목과 내용을 모두 적어 주세요.'; return; }
  busy(true);
  try {
    last = await classify(textEl.value);
    if (last.stage === '차단후보') openModal(last);
    else await finish(last, editingAfterGuide ? '직접' : '없음', editingAfterGuide);
  } catch (err) {
    errEl.textContent = err.name === 'TimeoutError' ? '시간이 너무 오래 걸렸습니다. 잠시 뒤 다시 제출해 주세요.' : `제출하지 못했습니다(${err.message}). 인터넷 연결을 확인하고 다시 눌러 주세요.`;
  } finally { busy(false); }
});

function renderMine() {
  const mine = load().complaints.filter((c) => c.mine);
  const box = $('#mine');
  if (!mine.length) { box.innerHTML = '<p class="empty">아직 제출한 민원이 없습니다. 왼쪽에서 첫 민원을 써 보세요.</p>'; return; }
  box.innerHTML = mine.map((c) => {
    let status = '<span class="badge">접수됨 · 담당자 확인 전</span>';
    let more = '';
    if (c.final) {
      if (c.final.stage === '차단후보') {
        const left = Math.ceil((c.final.at + APPEAL_DAYS * 86400000 - Date.now()) / 86400000);
        status = '<span class="badge final">일부 표현 가림 유지</span>';
        more = `<p class="caption" style="margin:8px 0 0">담당자가 일부 표현을 가린 채 처리하기로 했습니다${c.final.reason ? ` (이유: ${esc(c.final.reason)})` : ''}. 민원 처리에는 영향이 없습니다.</p>`;
        if (c.appeal) more += `<p class="caption">소명 의견을 냈습니다(${fmtTime(c.appeal.at)}). 담당자가 다시 검토합니다.</p>`;
        else if (left > 0) more += `<form class="appeal" data-id="${c.id}" style="margin-top:12px"><label class="field" style="margin-bottom:12px"><span class="field-label">소명 의견 (${left}일 남음 · 시제품 기준 ${APPEAL_DAYS}일)</span><textarea class="textarea" style="min-height:100px" required maxlength="1000" placeholder="표현이 왜 문제가 아니라고 보는지 적어 주세요"></textarea></label><button class="btn sm" type="submit">소명 의견 내기</button></form>`;
        else more += '<p class="caption">소명 기한이 지났습니다. 감사담당관(02-2241-4901)에 문의하세요.</p>';
      } else {
        status = '<span class="badge">담당자 확인 완료</span>';
      }
    }
    return `<div class="row" style="cursor:default;grid-template-columns:1fr"><div><div class="row-title">${esc(c.title)}</div><div class="caption-sm">${fmtTime(c.createdAt)}${c.choice !== '없음' ? ` · 안내 창 선택: ${esc(c.choice)}` : ''}</div><div style="margin-top:8px">${status}</div>${more}</div></div>`;
  }).join('');
  box.querySelectorAll('form.appeal').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = f.querySelector('textarea').value.trim();
    if (!t) return;
    try { await appeal(f.dataset.id, t); renderMine(); }
    catch (err) { toast(`소명을 내지 못했습니다(${err.message})`); }
  }));
}
renderMine();
