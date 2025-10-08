// [1] v2 匯入：從 https 模組拿 onRequest、Request、Response
import { onRequest } from 'firebase-functions/v2/https';        // 保留 onRequest
import type { Request, Response } from 'express';     

import * as admin from 'firebase-admin';
import { SiweMessage } from 'siwe';
import { randomBytes } from 'node:crypto';

// [2] 只初始化一次（避免多次 initializeApp 異常）
if (admin.apps.length === 0) admin.initializeApp();



const AKC_SIWE_VERSION = 'verify-2025-09-12-2';

// 允許的網域（message.domain 必須在此清單內）
const ALLOW_DOMAINS = new Set([
  'akashic-library-test.web.app',
  'akashic-library-test.firebaseapp.com',
  'localhost:5000', '127.0.0.1:5000',
  'localhost:5005', '127.0.0.1:5005',
  'localhost', '127.0.0.1',
]);

// 小工具：解析/設定 Cookie
function parseCookies(cookie?: string) {
  const out: Record<string, string> = {};
  (cookie || '').split(';').forEach((c) => {
    const [k, v] = c.split('=');
    if (k) out[k.trim()] = decodeURIComponent(v || '');
  });
  return out;
}

type CookieOptions = { httpOnly?: boolean; maxAge?: number };
function setCookie(res: Response, name: string, value: string, opts: CookieOptions = {}) {


  const pieces = [`${name}=${encodeURIComponent(value)}`];
  if (opts.httpOnly !== false) pieces.push('HttpOnly');
  pieces.push('Path=/');
  pieces.push(`Max-Age=${opts.maxAge ?? 900}`); // 15 分鐘
  pieces.push('SameSite=Strict');
  // ⚠ 若為 HTTPS domain，建議加上 Secure
  if (process.env.FUNCTIONS_EMULATOR !== 'true') pieces.push('Secure');
  const cookieStr = pieces.join('; ');
const prev = res.getHeader('Set-Cookie');
const arr = Array.isArray(prev) ? prev : (prev ? [String(prev)] : []);
arr.push(cookieStr);
res.setHeader('Set-Cookie', arr);
}

// ====== 你的端點（示意：nonce / verify / logout）======
// CORS 小貼紙：先回覆 OPTIONS
function withCors(handler: (req: Request, res: Response) => Promise<void> | void) {
  return async (req: Request, res: Response) => {
const origin = String(req.headers.origin || '*');
res.setHeader('Access-Control-Allow-Origin', origin);
res.setHeader('Access-Control-Allow-Credentials', 'true');
res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');


    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    await handler(req, res);
  };
}


// 1) 取得一次性 nonce
export const siweNonce = onRequest(withCors(async (req, res) => {
    res.set('x-akc-siwe-version', AKC_SIWE_VERSION);
res.set('Access-Control-Expose-Headers', 'x-akc-siwe-version');

    if (req.method !== 'GET') {
      res.status(405).send('Method Not Allowed'); return;
    }
  
    const nonce = randomBytes(16).toString('hex');

   // 避免任何層級回傳舊回應（可能沒有自訂標頭）
res.setHeader('Cache-Control', 'no-store, private');
setCookie(res, '__session', JSON.stringify({ nonce }), { maxAge: 900 });

if (String(req.query.debug) === '1') {
  res.status(200).json({
    success: true,
    version: AKC_SIWE_VERSION,
    nonce,
    host: req.headers.host,
    xfwd: req.headers['x-forwarded-host'] || null,
  });
  return;
}



res.status(200).send(nonce);
  }));

// 2) 驗證簽名
export const siweVerify = onRequest(withCors(async (req, res) => {
    res.set('x-akc-siwe-version', AKC_SIWE_VERSION);
    res.set('Access-Control-Expose-Headers', 'x-akc-siwe-version');

const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
console.log('[siweVerify] host =', JSON.stringify(hostHeader));

    if (req.method !== 'POST') {

      res.status(405).json({ success: false, error: 'Method Not Allowed' }); return;
    }
    try {
      const { message, signature } = req.body || {};
      if (!message || !signature) {
        res.status(400).json({ success: false, error: '缺少 message 或 signature' }); return;
      }
      const cookies = parseCookies(req.headers.cookie as string);
type SessionData = { nonce?: string; address?: string };
let parsed: SessionData = {};
try { parsed = JSON.parse(cookies['__session'] || '{}') as SessionData; } catch {}
const nonce = parsed.nonce;

if (!nonce) { res.status(401).json({ success:false, error:'缺少 nonce' }); return; }

 const msg = new SiweMessage(message);
const msgDomain = String((msg as unknown as { domain?: string }).domain ?? '').trim();

console.log('[siweVerify] msg.domain =', JSON.stringify(msgDomain));
console.log('[siweVerify] first line =', JSON.stringify(String(message).split('\n')[0] || ''));
 // 白名單保護：只允許你的官方網域群
 if (!ALLOW_DOMAINS.has(msgDomain)) {
   res.status(401).json({ success:false, error:'domain_not_allowed' }); return;
 }
  const { success, data, error } = await msg.verify(
   { signature, nonce, time: new Date().toISOString() }, // ★ 先不傳 domain，避免套件直接拋 Domain mismatch
   { suppressExceptions: true }
 );
 console.log('[siweVerify] verify.success =', success, ' error =', error?.type || error);
if (!success) {
  res.status(401).json({ success: false, error: error?.type || 'invalid_signature' }); return;
}

console.log('[siweVerify] message line count =', String(message).split('\n').length);
console.log('[siweVerify] using lib-verify params: domain=UNSET, hasNonce=', !!nonce);


const fields = data; // 與你原本命名對齊；仍可使用 fields.address / fields.domain / fields.nonce
console.log('[siweVerify] fields.domain =', JSON.stringify(fields.domain), ' nonce =', fields.nonce);
      // 基本安全檢查：nonce 與 domain（以 message.domain 為準）
 if (fields.nonce !== nonce || fields.domain !== msgDomain) {
        res.status(401).json({ success: false, error: 'nonce 或 domain 不符' }); return;
      }
    res.set('x-akc-siwe-version', AKC_SIWE_VERSION);
res.set('Access-Control-Expose-Headers', 'x-akc-siwe-version'); // ★加這行（新版標記）

      // 通過：簽發短效登入 cookie
  res.setHeader('Cache-Control', 'private');
      setCookie(res, '__session', JSON.stringify({ address: fields.address.toLowerCase() }), { maxAge: 1800 });

      res.status(200).json({ success: true, address: fields.address.toLowerCase() });
return;

} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : '驗證失敗';
  setCookie(res, '__session', '', { maxAge: 0 });
  setCookie(res, 'signature', '', { maxAge: 0 });
  res.status(401).json({ success: false, error: msg });
  return;
}


  }));

 
export const siweLogout = onRequest(withCors(async (req, res) => {
  // 清 Cookie、清 session
  setCookie(res, '__session', '', { maxAge: 0 });
  setCookie(res, 'signature', '', { maxAge: 0 });
  res.status(204).send('');
}));