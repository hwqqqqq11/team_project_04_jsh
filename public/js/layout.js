// 모든 화면에 같은 상단·하단을 붙인다 (디자인시스템: utility-bar + primary-nav + footer)
const LINKS = [
  { href: '/citizen.html', label: '민원 쓰기', key: 'citizen' },
  { href: '/staff.html', label: '분류 현황판', key: 'staff' },
  { href: '/admin.html', label: '통계·감독', key: 'admin' },
];

export function mountLayout(current) {
  const header = document.createElement('header');
  header.innerHTML = `
    <div class="utility" aria-label="안내"><span>시제품 · 가상 예시 민원만 사용</span><span>로그인 없음</span></div>
    <nav class="nav" aria-label="주 메뉴">
      <a class="brand" href="/">성북 안심 <b>민원 필터</b></a>
      <div class="nav-links">
        ${LINKS.map((l) => `<a href="${l.href}" ${l.key === current ? 'aria-current="page"' : ''}>${l.label}</a>`).join('')}
      </div>
      <span class="nav-tag">AI는 표시하고, 사람이 결정합니다</span>
    </nav>`;
  document.body.prepend(header);

  const footer = document.createElement('footer');
  footer.className = 'footer';
  footer.innerHTML = `
    <div class="footer-inner">
      <div><h3>문의처</h3><p>성북구청 감사담당관 02-2241-4901/2185 (구청 8층)<br>대표전화 02-2241-3114</p></div>
      <div><h3>이 서비스가 하지 않는 것</h3><p>자동 종료 · 접수 거부 · 민원 삭제 · 민원인 목록화 · 자동 제재</p></div>
      <div><h3>시제품 안내</h3><p>한성대학교 AI 기반 공공행정 캡스톤 2026-2. 데이터는 이 브라우저에만 저장됩니다.</p></div>
    </div>`;
  document.body.append(footer);
}
