import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { onRequest } from 'firebase-functions/v2/https';
 import { setGlobalOptions } from 'firebase-functions/v2';
 import * as admin from 'firebase-admin';
  if (admin.apps.length === 0) admin.initializeApp();

 /* setGlobalOptions({
  region: process.env.FUNCTIONS_REGION || 'asia-east1',
  timeoutSeconds: 10,
  maxInstances: 5,
});
*/

function parseCookies(cookieHeader?: string) {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) {
      const k = p.slice(0, i).trim();
      const v = decodeURIComponent(p.slice(i + 1));
      out[k] = v;
    }
  });
  return out;
}


export const awardPoints = onRequest(async (req, res) => {
  const ORIGINS = new Set([
  'http://127.0.0.1:5005',  // 測試站
  'http://localhost:5005', //測試站
   'https://akashic-library-test.web.app',   // ✅ 正式站  
]);
const origin = String(req.headers.origin || '');
if (ORIGINS.has(origin)) {
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
}
res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
 res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Idempotency-Key');
 res.set('Access-Control-Allow-Credentials', 'true');
 res.set('Cache-Control', 'private, no-store');


  if (req.method === 'OPTIONS') {
   res.set('Access-Control-Max-Age', '86400'); // 預檢快取 1 天
   res.status(204).send('');
return;

 }
  res.set('Vary', 'Origin'); // 可選：改善跨源快取行為


  if (req.method !== 'POST') {
   res.status(405).json({ ok: false, error: 'method_not_allowed' });
return;

 }

// === add: 固定以台北時區界定「今天」 ===
const TZ = 'Asia/Taipei';
function dayInTZ(d = new Date(), tz = TZ) {
  // 產出 YYYY-MM-DD（穩定字串，方便做 key/ref）
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

let { address: _addr, uid: _uid, type, ref, amount, ts, key } = req.body || {};
// 若為每日登入，後端主導 key/ref（防洗分、防時區不一）
if (type === 'login:daily') {
  const day = dayInTZ();
  ref = day;
  key = `login:${day}`; // 一天唯一
  amount = Number(amount || 1);
}
const address = String(_addr || _uid || '').toLowerCase();



const TYPE_OK = new Set(['course:create','course:publish','login:daily']);


const bad =
  !address ||
  !TYPE_OK.has(String(type)) ||
  !ref || String(ref).length > 120 ||
  typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1000 ||
  !key || String(key).length > 64;
if (bad) { res.status(400).json({ ok:false, error:'bad_payload' }); return; }

const cookies = parseCookies(req.headers.cookie as any);
let sessionAddr = '';
try { sessionAddr = (JSON.parse(cookies['__session'] || '{}') as any).address?.toLowerCase() || ''; } catch {}
if (!sessionAddr) { res.status(401).json({ ok:false, error:'auth_required' }); return; }
if (address !== sessionAddr) { res.status(403).json({ ok:false, error:'address_mismatch' }); return; }



  
  // TODO(下一步)：驗證 SIWE/EIP-4361 會話與 EIP-712 簽章
  const addrLower = String(address).toLowerCase();
  const db = admin.firestore();
  const userDoc = db.collection('users').doc(addrLower);
  const pointsDoc = userDoc.collection('points').doc(String(key));

  try {
    const result = await db.runTransaction(async (tx) => {
      const p = await tx.get(pointsDoc);
      if (p.exists) {
        const u = await tx.get(userDoc);
        return { existed: true, total: Number(u.get('pointsTotal') || 0) };
      }
    tx.set(pointsDoc, {
  type, ref, amount,
  key,
  clientTs: ts || Date.now(),
  serverTs: FieldValue.serverTimestamp()   // ← 改用已引入的 FieldValue
}, { merge: true });

tx.set(userDoc, {
  pointsTotal: FieldValue.increment(amount || 0)  // ← 同上
}, { merge: true });


      return { existed: false };
    });

    if (result.existed === false) {
      const uAfter = await userDoc.get();
      (result as any).total = Number(uAfter.get('pointsTotal') || 0);
    }
    const out = { ok: true, ...result }; res.json(out); return;
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'internal' });return;
  
  }
});
