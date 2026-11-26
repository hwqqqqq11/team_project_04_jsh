// 담당 공무원·관리자 화면 접근 제한 — 환경변수 STAFF_PASSWORD · ADMIN_PASSWORD 로 켠다.
// 비어 있으면 그 역할은 잠그지 않는다(시연용). 관리자 비밀번호로 들어오면 담당자 화면도 쓸 수 있다.
import crypto from 'node:crypto';

const HOURS = 8;
const pw = (role) => process.env[role === 'admin' ? 'ADMIN_PASSWORD' : 'STAFF_PASSWORD'] || '';
export const authRequired = (role) => !!pw(role);

export function secret() {
  return crypto.createHash('sha256')
    .update([process.env.AUTH_SECRET, pw('admin'), pw('staff'), process.env.CLAUDE_API_KEY].join('|')).digest();
}
export const hmac = (s) => crypto.createHmac('sha256', secret()).update(s).digest('base64url');

export function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

export function checkPassword(role, password) {
  return authRequired(role) && safeEqual(password || '', pw(role));
}

export function issue(role) {
  const p = `${role}.${Date.now() + HOURS * 3600 * 1000}`;
  return `${p}.${hmac(p)}`;
}

export function roleOf(req) {
  const m = /(?:^|;\s*)sb_auth=([^;]+)/.exec(req.headers?.cookie || '');
  if (!m) return null;
  const [role, exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!['staff', 'admin'].includes(role) || !sig || Number(exp) < Date.now()) return null;
  return safeEqual(sig, hmac(`${role}.${exp}`)) ? role : null;
}

// need: 'staff' | 'admin' — 잠겨 있지 않으면 누구나 true
export function can(req, need) {
  if (!authRequired(need)) return true;
  const r = roleOf(req);
  return need === 'staff' ? r === 'staff' || r === 'admin' : r === 'admin';
}

export function cookie(value, maxAgeSec, req) {
  const secure = (req.headers?.['x-forwarded-proto'] || '') === 'https' ? '; Secure' : '';
  return `sb_auth=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`;
}
export const COOKIE_MAX = HOURS * 3600;

// classify.js 가 붙이는 서명 — 단계·글을 화면에서 고쳐 보내면 db.js 가 걸러낸다
export const signResult = (r) => hmac(JSON.stringify([r.stage, r.maskedText, r.hiddenText, r.softened, r.summary]));
