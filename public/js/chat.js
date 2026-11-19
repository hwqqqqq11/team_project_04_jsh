// 서비스 안내 챗봇 위젯 — 답변참고문서로만 답하고, 근거 문서 이름과 답한 AI 를 함께 보여 준다
import { esc, srcBadge } from './store.js';

const SUGGEST = {
  민원인: [
    "제 민원 글이 '차단후보'로 분류되면 접수가 거부되거나 처리 기간이 늦어지나요?",
    '구청 행정을 강하게 비판하면 악성 민원이나 차단후보로 분류되나요?',
    'AI가 욕설을 순화하면서 제 요구사항까지 바꾸지는 않나요?',
    'AI가 제 이름·전화번호를 수집하거나 외부에 저장할 수도 있나요?',
    'AI 분류가 잘못됐다고 생각하면 누구에게 이의를 제기하나요?',
  ],
  '담당 공무원': [
    'AI는 정상·검토필요·차단후보를 어떤 기준으로 나누나요?',
    '특수문자나 은어로 돌려 쓴 욕설도 AI가 잡을 수 있나요?',
    'AI 판단과 제 생각이 다르면 바꿀 수 있나요? 바꾼 기록은 어떻게 남나요?',
  ],
  관리자: [
    'AI가 계속 잘못 판단하면 관리자는 어떤 기준으로 멈추나요?',
    'AI가 얼마나 정확한지, 공무원 보호 효과는 어떻게 측정하나요?',
  ],
};

export function mountChat(role = '민원인') {
  const fab = document.createElement('button');
  fab.className = 'btn chat-fab';
  fab.type = 'button';
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-controls', 'chat');
  fab.textContent = '서비스 안내 묻기';

  const box = document.createElement('section');
  box.className = 'chat';
  box.id = 'chat';
  box.setAttribute('aria-label', '서비스 안내 챗봇');
  box.innerHTML = `
    <div class="chat-head">
      <div><strong>서비스 안내</strong><div class="caption-sm">AI가 답변참고문서만 보고 답합니다 · ${esc(role)}</div></div>
      <button class="icon-btn" type="button" data-close aria-label="챗봇 닫기">✕</button>
    </div>
    <div class="chat-body" aria-live="polite">
      <div class="msg bot">이 서비스에 대해 궁금한 점을 물어보세요. 답은 AI가 만들고, 근거 문서 이름을 함께 붙입니다. 개별 민원이 어떻게 처리될지는 답하지 않습니다.</div>
      <div class="chat-suggest">${SUGGEST[role].map((q) => `<button type="button">${esc(q)}</button>`).join('')}</div>
    </div>
    <form class="chat-form">
      <label class="sr-only" for="chat-q">질문</label>
      <input class="input" id="chat-q" name="q" autocomplete="off" placeholder="질문을 입력하세요" maxlength="500">
      <button class="btn sm" type="submit">묻기</button>
    </form>`;
  document.body.append(fab, box);

  const body = box.querySelector('.chat-body');
  const form = box.querySelector('form');
  const input = box.querySelector('input');
  const toggle = (open) => {
    box.classList.toggle('open', open);
    fab.setAttribute('aria-expanded', String(open));
    fab.textContent = open ? '안내 닫기' : '서비스 안내 묻기';
    if (open) input.focus();
  };
  fab.addEventListener('click', () => toggle(!box.classList.contains('open')));
  box.querySelector('[data-close]').addEventListener('click', () => { toggle(false); fab.focus(); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggle(false); fab.focus(); } });

  const add = (html, cls) => {
    const d = document.createElement('div');
    d.className = `msg ${cls}`;
    d.innerHTML = html;
    body.append(d);
    body.scrollTop = body.scrollHeight;
    return d;
  };

  async function ask(q) {
    add(esc(q), 'me');
    const wait = add('<span class="typing">근거 문서를 찾는 중…</span>', 'bot');
    form.querySelector('button').disabled = true;
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, role }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `오류 ${r.status}`);
      const who = d.provider ? `<span class="badge ai">답한 AI: ${esc(d.provider)} (${esc(d.model)})</span>` : '<span class="badge ai">규칙 답변(AI 안 부름)</span>';
      const tried = d.tried?.length ? `<div class="fine">앞 순서 실패: ${d.tried.map((t) => `${esc(t.provider)} — ${esc(t.reason)}`).join(' · ')}</div>` : '';
      const laws = (d.laws || []).map((l) => (l.source === 'live'
        ? `<div>${srcBadge('live')} ${esc(l.name)} — 현행 시행 ${esc(l.enforced)}${l.number ? ` (${esc(l.number)})` : ''}</div>`
        : `<div>${srcBadge('demo')} ${esc(l.doc)} — ${esc(l.demo)} <span class="muted">· 실시간 확인 실패: ${esc(l.reason)}</span></div>`)).join('');
      wait.innerHTML = `<div class="msg-text">${esc(d.answer)}</div>`
        + `<div class="msg-meta">${d.source === 'demo' ? srcBadge('demo') : ''}${d.provider ? '<span class="badge">AI가 만든 문장</span>' : ''}${who}</div>`
        + `<div class="msg-meta">${(d.sources || []).map((s) => `<span class="badge">근거: ${esc(s)}</span>`).join('')}</div>`
        + `${tried}${laws ? `<div class="msg-law"><strong>근거 법령 현행 확인(국가법령정보)</strong>${laws}</div>` : ''}`;
    } catch (err) {
      wait.innerHTML = `답을 받지 못했습니다: ${esc(err.message)}. 잠시 뒤 다시 물어보거나 감사담당관(02-2241-4901)에 문의하세요.`;
    } finally {
      form.querySelector('button').disabled = false;
      body.scrollTop = body.scrollHeight;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    ask(q);
  });
  box.querySelectorAll('.chat-suggest button').forEach((b) => b.addEventListener('click', () => ask(b.textContent)));
}
