// 로그인 상태 확인(GET) · 로그인(POST) · 로그아웃(DELETE)
import { readBody, send } from './_lib/http.js';
import { authRequired, can, checkPassword, issue, cookie, COOKIE_MAX } from './_lib/auth.js';
import { guard } from './_lib/limit.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return send(res, 200, {
      required: { staff: authRequired('staff'), admin: authRequired('admin') },
      staff: can(req, 'staff'),
      admin: can(req, 'admin'),
    });
  }
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', cookie('', 0, req));
    return send(res, 200, { ok: true });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'GET · POST · DELETE 만 받습니다' });
  if (!(await guard(req, res, 'auth', 10, 600))) return;
  const { role, password } = await readBody(req);
  if (!['staff', 'admin'].includes(role)) return send(res, 400, { error: '역할이 올바르지 않습니다' });
  if (!authRequired(role)) return send(res, 400, { error: '이 화면은 비밀번호가 설정되어 있지 않습니다' });
  if (!checkPassword(role, password)) return send(res, 401, { error: '비밀번호가 맞지 않습니다' });
  res.setHeader('Set-Cookie', cookie(issue(role), COOKIE_MAX, req));
  send(res, 200, { ok: true, role });
}
