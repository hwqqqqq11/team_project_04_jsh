// 키 읽기 — 새 이름을 먼저 보고, 없으면 옛 이름을 대신 읽는다(전환 기간용).
// .env 이름을 모두 새 이름으로 바꾸면 OLD 목록은 지워도 된다.
const OLD = {
  CLAUDE_API_KEY: ['claude', 'ANTHROPIC_API_KEY'],
  GROQ_API_KEY: ['groq', 'GROQ_API_KEYS'],
  GEMINI_API_KEY: ['gemini', 'GEMINI_API_KEYS'],
  LAW_OC: ['law', 'ordin', 'committee'],
  DATA_GO_KR_KEY: ['minwon2025', 'minwon2024', 'minwon2023', 'minwon2022', 'qna'],
};

// { value, from } — from 은 실제로 값을 읽은 이름(화면 상태 표시용, 값은 내보내지 않음)
export function readKey(name) {
  for (const n of [name, ...(OLD[name] || [])]) {
    const raw = process.env[n];
    if (raw && raw.trim()) {
      // 이름마다 키 하나 — 쉼표로 여러 개가 들어 있으면 첫 번째만 쓴다
      return { value: raw.split(',')[0].trim(), from: n };
    }
  }
  return { value: '', from: null };
}

export const env = (name) => readKey(name).value;
