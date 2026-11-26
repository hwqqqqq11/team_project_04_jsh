// 민원·판단 이력·설정을 서버(Redis)에 저장한다. 판단 이력은 서버가 직접 만들어 남기므로 화면에서 고칠 수 없다.
import { kv, kvPipeline, pairs } from './kv.js';
import { seed } from '../../public/js/seed.js';

const C = 'sb:c';        // 민원: id → JSON
const H = 'sb:h';        // 판단 이력: id → JSON
const S = 'sb:settings'; // 설정
export const MAX_COMPLAINTS = 2000;

const parse = (v) => { try { return JSON.parse(v); } catch { return null; } };
export const rid = () => Math.random().toString(36).slice(2, 8);

export async function ensureSeeded() {
  const first = await kv('SET', 'sb:seeded', '1', 'NX');
  if (first !== 'OK') return;
  const { complaints, history, settings } = seed();
  const cmds = [['SET', S, JSON.stringify(settings)]];
  for (const [key, list] of [[C, complaints], [H, history]]) {
    const flat = list.flatMap((x) => [x.id, JSON.stringify(x)]);
    if (flat.length) cmds.push(['HSET', key, ...flat]);
  }
  await kvPipeline(cmds);
}

export async function getSettings() {
  return parse(await kv('GET', S)) || { aiPaused: false };
}

export async function getAll() {
  await ensureSeeded();
  const [c, h, s] = (await kvPipeline([['HGETALL', C], ['HGETALL', H], ['GET', S]])).map((x) => x.result);
  return {
    complaints: Object.values(pairs(c)).map(parse).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt),
    history: Object.values(pairs(h)).map(parse).filter(Boolean).sort((a, b) => b.at - a.at),
    settings: parse(s) || { aiPaused: false },
  };
}

export async function getComplaint(id) {
  return parse(await kv('HGET', C, id));
}
export async function countComplaints() { return Number(await kv('HLEN', C)) || 0; }

export async function saveComplaint(c, histories = []) {
  const cmds = [['HSET', C, c.id, JSON.stringify(c)]];
  for (const h of histories) cmds.push(['HSET', H, h.id, JSON.stringify(h)]);
  await kvPipeline(cmds);
}

export async function saveSettings(settings, histories = []) {
  const cmds = [['SET', S, JSON.stringify(settings)]];
  for (const h of histories) cmds.push(['HSET', H, h.id, JSON.stringify(h)]);
  await kvPipeline(cmds);
}

export async function resetAll() {
  await kvPipeline([['DEL', C], ['DEL', H], ['DEL', S], ['DEL', 'sb:seeded']]);
  await ensureSeeded();
}

export const hist = (o) => ({ id: `h-${Date.now()}-${rid()}`, at: Date.now(), complaintId: null, from: null, to: null, reason: '', model: '—', ...o });
