// 1차 표현 목록 검사 — 시연용 목록 [팀 설계안]
// 띄어쓰기를 지우고 찾기 때문에 짧은 단어는 엉뚱한 곳에 걸릴 수 있다. 짧은 단어(예: 새끼)는 weak(검토필요)로 두고 strong 에는 「개새끼」「이새끼」처럼 앞뒤가 붙은 꼴만 넣는다.
// 「쓰레기 무단투기」 같은 정상 민원을 막지 않도록 「쓰레기」 단독은 넣지 않는다.
// 기획서의 「약 1,200개」 목록은 아직 없다. 실제 적용 전 구청 담당 부서 검토가 필요하다.
// strong: 뚜렷한 욕설·협박·성희롱 → 차단후보 / weak: 애매한 비하·조롱 → 검토필요
export const WORDS = [
  // 욕설 — 뚜렷함
  ...['씨발', '시발', '씨바', '시팔', '씨팔', '씨벌', '시벌', '쉬발', 'ㅅㅂ', 'ㅆㅂ', '병신', '븅신', 'ㅂㅅ', '개새끼', '저새끼', '그새끼', '니새끼', '새끼야', '새끼들', '씹새', '씹년', '좆', '좃', '존나', 'ㅈㄴ', '지랄', 'ㅈㄹ', '염병', '미친놈', '미친년', 'ㅁㅊ', '닥쳐', '꺼져라', '꺼져버려', '엿먹어', '썅', '개소리하']
    .map((w) => ({ w, type: '욕설', level: 'strong' })),
  // 모욕 — 뚜렷함
  ...['등신', '버러지', '쓰레기같은', '쓰레기들', '돌대가리', '머리에똥', '벌레만도', '개돼지', '병자들', '한심한것들', '멍청', '바보', '또라이', '돌아이', '머저리', '얼간이', '거지같', '개같은', '인간쓰레기', '쓰레기공무원', '쓰레기새끼']
    .map((w) => ({ w, type: '모욕', level: 'strong' })),
  // 협박 — 뚜렷함
  ...['죽여버', '죽인다', '죽이겠', '죽어라', '죽어버려', '뒈져', '가만안둔다', '가만안둬', '가만두지않', '칼들고', '불질러', '불지른다', '목날아갈', '각오해', '패버린', '때려죽', '찔러버', '폭파시', '집앞에찾아', '퇴근길에보']
    .map((w) => ({ w, type: '협박', level: 'strong' })),
  // 성희롱 — 뚜렷함
  ...['예쁘게하고나와', '섹시', '목소리들으니기분좋', '한번만나자', '데이트하자', '섹스', '성관계', '한번자', '같이자자', '벗어봐', '술한잔하자']
    .map((w) => ({ w, type: '성희롱', level: 'strong' })),
  // 애매한 표현 — 정상 민원에도 나올 수 있어 사람 판단 필요(검토필요)
  ...['찾아가서', '흉기', '테러', '두고보자', '후회하게', '가만있지', '몸매', '가슴', '엉덩이', '잠자리']
    .map((w) => ({ w, type: '협박·성적 표현 가능성', level: 'weak' })),
  ...['새끼', '미친', '정신나간', '개소리', '무식', '한심', '찌질', '신선놀음', '월급루팡', '세금도둑', '철밥통', '밥값', '초등학생도', 'ㅋㅋㅋ', '수준이네', '꼴좋다', '무능한', '일도못하', '이놈', '저놈', '그놈', '이딴']
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
