// functions/src/hydrate.ts
import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
if (admin.apps.length === 0) admin.initializeApp();

function parseCookies(cookieHeader?: string) {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1));
  });
  return out;
}

export const hydratePoints = onRequest(async (req, res) => {
  const ORIGINS = new Set([
    'http://127.0.0.1:5005', // 測試站
    'http://localhost:5005', // 測試站
  'https://akashic-library-test.web.app',   // ✅ 正式站

    ]);
  const origin = String(req.headers.origin || '');
  if (ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Credentials', 'true');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Cache-Control', 'private, no-store');

  if (req.method === 'OPTIONS') { res.set('Access-Control-Max-Age','86400'); res.status(204).send(''); return; }
  if (req.method !== 'GET') { res.status(405).json({ ok:false, error:'method_not_allowed' }); return; }

  // 兩者擇一（容忍舊參數 uid）
  const q = req.query as any;
  const address = String(q.address || q.uid || '').toLowerCase();
  if (!address) { res.status(400).json({ ok:false, error:'missing_address' }); return; }

  // 可選：若你希望 GET 也驗 cookie，可打開下列幾行
  const cookies = parseCookies(req.headers.cookie as any);
  try {
    const sessionAddr = (JSON.parse(cookies['__session'] || '{}') as any).address?.toLowerCase() || '';
    if (sessionAddr && sessionAddr !== address) {
      res.status(403).json({ ok:false, error:'address_mismatch' }); return;
    }
  } catch {}

  const db = admin.firestore();
  const userDoc = db.collection('users').doc(address);
  const u = await userDoc.get();
  const total = Number(u.get('pointsTotal') || 0);

  const recentSnap = await userDoc.collection('points')
    .orderBy('serverTs', 'desc')
    .limit(20)
    .get();
  const recent = recentSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  res.json({ ok:true, total, recent });
});
