// 담당자·관리자 화면 로그인. 서버에 비밀번호(STAFF_PASSWORD · ADMIN_PASSWORD)가 설정돼 있을 때만 막는다.
const $ = (s) => document.querySelector(s);

export async function requireRole(role) {
  let s = null;
  try { s = await (await fetch('/api/auth')).json(); } catch { /* 서버 응답 없음 — 막지 않고 진행 */ }
  const state = $('#auth-state');
  if (!s || s[role]) {
    if (state) {
      state.textContent = !s ? '' : s.required[role] ? '로그인됨' : '비밀번호 미설정 · 시연 모드';
      if (s?.required[role]) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'link-btn'; b.textContent = '로그아웃';
        b.addEventListener('click', async () => { await fetch('/api/auth', { method: 'DELETE' }); location.reload(); });
        state.append(' · ', b);
      }
    }
    return;
  }
  const label = role === 'admin' ? '부서 관리자 · 감사 담당' : '담당 공무원';
  const wrap = $('.wrap');
  wrap.innerHTML = `
    <section class="section" aria-labelledby="login-title" style="max-width:480px">
      <h2 class="h-xl" id="login-title">${label} 로그인</h2>
      <p class="caption">이 화면은 민원 원문을 다룹니다. 부여받은 비밀번호를 입력하세요.</p>
      <form id="login" novalidate>
        <label class="field"><span class="field-label">비밀번호</span><input class="input" id="pw" type="password" autocomplete="current-password" required></label>
        <p id="login-error" class="caption" role="alert" style="color:var(--block)"></p>
        <button class="btn" type="submit">로그인</button>
      </form>
    </section>`;
  $('#pw').focus();
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.textContent = '';
    try {
      const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, password: $('#pw').value }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `오류 ${r.status}`);
      location.reload();
    } catch (ex) { err.textContent = ex.message; $('#pw').select(); }
  });
  await new Promise(() => {}); // 로그인 전에는 아래 코드를 실행하지 않는다
}
