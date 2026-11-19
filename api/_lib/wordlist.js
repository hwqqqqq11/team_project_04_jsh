// 1차 표현 목록 검사 — 시연용 작은 목록 [팀 설계안]
// 기획서의 「약 1,200개」 목록은 아직 없다. 실제 적용 전 구청 담당 부서 검토가 필요하다.
// strong: 뚜렷한 욕설·협박·성희롱 → 차단후보 / weak: 애매한 비하·조롱 → 검토필요
export const WORDS = [
  // 욕설
  ...['씨발', '시발', '씨바', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '개새끼', '새끼', '좆', '존나', 'ㅈㄴ', '지랄', '염병', '미친놈', '미친년', '닥쳐', '꺼져라', '꺼져버려', '엿먹어', '썅']
    .map((w) => ({ w, type: '욕설', level: 'strong' })),
  // 모욕
  ...['등신', '버러지', '쓰레기같은', '쓰레기들', '돌대가리', '머리에똥', '벌레만도', '개돼지', '병자들', '한심한것들']
    .map((w) => ({ w, type: '모욕', level: 'strong' })),
  // 협박
  ...['죽여버', '죽인다', '가만안둔다', '가만안둬', '가만두지않', '칼들고', '불질러', '불지른다', '목날아갈', '각오해']
    .map((w) => ({ w, type: '협박', level: 'strong' })),
  // 성희롱
  ...['예쁘게하고나와', '몸매', '섹시', '목소리들으니기분좋', '한번만나자', '데이트하자']
    .map((w) => ({ w, type: '성희롱', level: 'strong' })),
  // 애매한 표현 — 정상 민원에도 나올 수 있어 사람 판단 필요(검토필요)
  ...['찾아가서', '흉기', '테러']
    .map((w) => ({ w, type: '협박 가능성', level: 'weak' })),
  ...['신선놀음', '월급루팡', '세금도둑', '철밥통', '초등학생도', 'ㅋㅋㅋ', '수준이네', '꼴좋다', '무능한']
    .map((w) => ({ w, type: '비하·조롱', level: 'weak' })),
];

// ---- 자모 합치기: 「ㅅㅣㅂㅏㄹ」 처럼 풀어 쓴 글자를 다시 붙인다 ----
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

function composeJamo(s) {
  const a = [...s];
  let out = '';
  for (let i = 0; i < a.length; i++) {
    const L = CHO.indexOf(a[i]);
    const V = i + 1 < a.length ? JUNG.indexOf(a[i + 1]) : -1;
    if (L >= 0 && V >= 0) {
      let T = 0;
      const t = a[i + 2];
      const tIdx = t ? JONG.indexOf(t) : -1;
      const nextIsVowel = a[i + 3] && JUNG.indexOf(a[i + 3]) >= 0;
      if (tIdx > 0 && !nextIsVowel) { T = tIdx; i += 1; }
      out += String.fromCharCode(0xac00 + (L * 21 + V) * 28 + T);
      i += 1;
    } else {
      out += a[i];
    }
  }
  return out;
}

// 띄어쓰기·숫자·특수문자를 빼고 자모를 합친다 (「시1발」「씨 발」「ㅅㅣㅂㅏㄹ」 → 「시발」)
export function normalize(text) {
  const onlyLetters = String(text || '').toLowerCase().replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z]/g, '');
  return composeJamo(onlyLetters);
}

export function checkWords(text) {
  const norm = normalize(text);
  const hits = [];
  for (const item of WORDS) {
    if (norm.includes(item.w)) hits.push({ word: item.w, type: item.type, level: item.level });
  }
  let stage = '정상';
  if (hits.some((h) => h.level === 'strong')) stage = '차단후보';
  else if (hits.length) stage = '검토필요';
  return { stage, hits, listSize: WORDS.length };
}

// 공무원 화면용: 원문에서 목록에 걸린 표현을 ○○ 로 가린다(띄어쓰기·특수문자를 끼운 꼴도)
export function hideWords(text, hits) {
  let out = String(text || '');
  for (const h of hits) {
    const chars = [...h.word];
    if (chars.some((c) => /[ㄱ-ㅎㅏ-ㅣ]/.test(c))) {
      out = out.split(h.word).join('○○');
      continue;
    }
    // 글자 사이에 끼울 수 있는 것: 띄어쓰기·숫자·문장부호만 (한글은 끼지 않게)
    const gap = '[\\s\\d!@#$%^&*().,~_+=?/|\'"`;:<>\\[\\]{}\\-]*';
    const pattern = chars.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(gap);
    out = out.replace(new RegExp(pattern, 'g'), '○○');
  }
  // 「ㅅㅣㅂㅏㄹ」 처럼 자모로 풀어 쓴 덩어리(자음+모음 섞인 3글자 이상)도 가린다
  if (hits.length) out = out.replace(/(?=[ㄱ-ㅎㅏ-ㅣ\s]*[ㅏ-ㅣ])[ㄱ-ㅎㅏ-ㅣ](?:\s?[ㄱ-ㅎㅏ-ㅣ]){2,}/g, '○○');
  return out;
}
