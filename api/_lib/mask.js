// 개인정보 가림 — AI 에 보내기 전에 정규식으로 *** 처리한다 [팀 설계안]
// 시제품 수준이라 모든 이름·주소를 잡지는 못한다(화면에 한계로 안내).
const RULES = [
  { type: '주민등록번호', re: /\d{6}\s*-\s*[1-4]\d{6}/g },
  { type: '전화번호', re: /(?:\+82[-\s]?)?0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g },
  { type: '이메일', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { type: '주소', re: /[가-힣]{2,10}(?:로|길)\s?\d{1,4}(?:-\d{1,4})?(?:번길\s?\d{1,4})?(?!\d|\s?(?:번째|개|곳|일|시|분|명|건|회|차|년|월|주|미터|m))/g },
  { type: '주소', re: /\d{1,4}동\s?\d{1,4}호/g },
  { type: '주소', re: /[가-힣]{1,6}동\s?\d{1,4}(?:-\d{1,4})?(?:번지)(?!\d)/g },
];

// 「제 이름은 홍길동」「저는 홍길동입니다」「성명: 홍길동」 같은 꼴
const NAME_RE = /(이름은|이름:|성명\s*[:：]?|저는|본인은)\s*([가-힣]{2,4})(?=\s|입니다|이고|이며|이에요|예요|라고|,|\.|$)/g;

export function maskPII(text) {
  let out = String(text || '');
  const found = [];
  for (const { type, re } of RULES) {
    out = out.replace(re, (m) => { found.push(type); return '***'; });
  }
  out = out.replace(NAME_RE, (m, lead) => { found.push('이름'); return `${lead} ***`; });
  return { text: out, found: [...new Set(found)] };
}
