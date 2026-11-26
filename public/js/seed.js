// 시연용 데이터 — 브라우저(store.js)와 서버(api/db.js)가 함께 쓴다. 브라우저 전용 코드를 넣지 않는다.
// 시연용 [가상 예시] — 기획서 표 2. 실제 민원이 아니며 욕설은 ○○ 로 가려 둔다.
export function seed(now = Date.now(), DAY = 86400000) {
  const mk = (i, daysAgo, title, text, stage, ai, first, extra = {}) => ({
    id: `demo-${i}`, demo: true, createdAt: now - daysAgo * DAY - i * 3600000, title,
    maskedText: text, hiddenText: extra.hidden || text, softened: extra.softened || text,
    summary: extra.summary, stage, choice: extra.choice || '없음',
    first: { stage: first, hits: extra.hits || [] },
    second: { source: 'demo', stage: ai, reason: extra.reason, normalBasis: extra.normal, provider: '시연 값', model: '[가상 예시]' },
    final: extra.final || null, appeal: null,
  });
  const complaints = [
    mk(1, 6, '골목 가로등 고장', '성북동 골목 가로등이 일주일째 꺼져 있어 밤길이 위험합니다. 빨리 고쳐 주세요.', '정상', '정상', '정상',
      { summary: '성북동 골목 가로등이 일주일째 고장 나 수리를 요청함.', reason: '생활 불편을 공격 표현 없이 요청함', normal: '가로등 수리 요구' }),
    mk(2, 5, '불법주차 단속 기준', '불법주차 단속 기준이 부서마다 달라 주민만 피해를 봅니다. 지침을 다시 검토해야 합니다.', '정상', '정상', '정상',
      { summary: '부서별로 다른 불법주차 단속 기준의 재검토를 요구함.', reason: '정책 비판은 정당한 의견', normal: '단속 지침 재검토 요구' }),
    mk(3, 4, '도로 보수 재요청', '도대체 몇 번을 건의해야 도로를 고쳐 줍니까? 정말 답답하고 화가 납니다.', '정상', '정상', '정상',
      { summary: '여러 번 건의한 도로 보수가 되지 않아 다시 요청함.', reason: '강한 불만이지만 특정인 모욕·욕설 없음', normal: '도로 보수 요구' }),
    mk(4, 4, '업무 처리 불만', '담당자가 일을 이렇게밖에 못 하나요? 업무 처리가 너무 미숙합니다.', '정상', '정상', '정상',
      { summary: '담당자의 업무 처리 방식에 불만을 제기함.', reason: '업무 능력 비판이며 욕설·인격 모욕 아님', normal: '업무 처리 개선 요구' }),
    mk(5, 3, '직원 근무 태도', '구청 직원분들은 하루 종일 커피만 마시며 신선놀음 하시나 봐요.', '검토필요', '검토필요', '검토필요',
      { hidden: '구청 직원분들은 하루 종일 커피만 마시며 ○○ 하시나 봐요.', softened: '구청 직원분들의 근무 태도가 성실하지 않아 보여 개선을 바랍니다.', summary: '구청 직원의 근무 태도에 불만을 제기함(구체적 요청 없음).', reason: '직접 욕설은 없으나 집단을 비꼬는 맥락', normal: '근무 태도 개선 의견일 수 있음', hits: [{ word: '신선놀음', type: '비하·조롱', level: 'weak' }] }),
    mk(6, 2, '민원 처리 지연', '담당자분 완전 ○○ 수준이네요. 초등학생도 이것보단 잘하겠어요 ㅋㅋ', '검토필요', '검토필요', '검토필요',
      { hidden: '담당자분 완전 ○○ ○○. ○○ 이것보단 잘하겠어요 ㅋㅋ', softened: '담당자분의 업무 처리가 기대에 못 미쳐 아쉽습니다.', summary: '담당자 업무 처리에 대한 불만(구체적 사안 없음).', reason: '은어·조롱이 섞여 사람의 판단이 필요', normal: '업무 처리 불만일 수 있음', hits: [{ word: '수준이네', type: '비하·조롱', level: 'weak' }, { word: '초등학생도', type: '비하·조롱', level: 'weak' }] }),
    mk(7, 2, '징계 청구 예고', '그렇게 일하면 목 날아갈 줄 알아. 정식으로 징계 청구할 테니 각오해.', '검토필요', '검토필요', '차단후보',
      { hidden: '그렇게 일하면 ○○ 줄 알아. 정식으로 징계 청구할 테니 ○○.', softened: '업무 처리에 문제가 있다고 생각해 정식으로 징계를 청구하겠습니다.', summary: '담당자 업무 처리에 대해 징계 청구 의사를 밝힘.', reason: '위협적 표현이 섞여 있음(1·2차 판단 충돌)', normal: '징계 청구는 정당한 권리', hits: [{ word: '목날아갈', type: '협박', level: 'strong' }, { word: '각오해', type: '협박', level: 'strong' }] }),
    mk(8, 1, '민원 미처리', '야 이 ○○들아, 민원 넣은 지가 언젠데 일을 안 해? 머리에 ○○만 찼냐?', '차단후보', '차단후보', '차단후보',
      { softened: '민원을 넣은 지 오래되었는데 아직 처리되지 않았습니다. 확인 부탁드립니다.', summary: '오래전 넣은 민원이 처리되지 않아 처리를 요구함.', reason: '뚜렷한 욕설과 인격 모욕', normal: '민원 처리 지연에 대한 요구', choice: '그대로', hits: [{ word: '욕설', type: '욕설', level: 'strong' }] }),
    mk(9, 1, '처리 기한 요구', '내일까지 처리 안 되면 ○○ 들고 찾아가서 가만 안 둔다.', '차단후보', '차단후보', '차단후보',
      { hidden: '내일까지 처리 안 되면 ○○ 들고 ○○ ○○.', softened: '내일까지 처리해 주시기를 요청합니다.', summary: '내일까지 처리를 요구함(신체 위협 표현 포함).', reason: '흉기 언급과 신체 위협', normal: '처리 기한 요청', choice: '그대로', hits: [{ word: '가만안둔다', type: '협박', level: 'strong' }] }),
    mk(10, 0, '전화 응대 후 글', '목소리 들으니 기분 좋네, 민원 들어주면 맛있는 거 사줄게, 예쁘게 하고 나와.', '차단후보', '차단후보', '차단후보',
      { hidden: '○○네, 민원 들어주면 맛있는 거 사줄게, ○○.', softened: '민원을 처리해 주시면 감사하겠습니다.', summary: '민원 처리 요청(성적 대상화 표현 포함).', reason: '성적 대상화·성희롱 표현', normal: '민원 처리 요청', choice: '그대로', hits: [{ word: '예쁘게하고나와', type: '성희롱', level: 'strong' }] }),
  ];
  const history = complaints.map((c) => ({
    id: `h-${c.id}`, complaintId: c.id, at: c.createdAt, action: 'AI 표시', from: null, to: c.stage, reason: '', actor: '시스템', model: '[가상 예시]',
  }));
  return { complaints, history, settings: { aiPaused: false }, version: 1 };
}
