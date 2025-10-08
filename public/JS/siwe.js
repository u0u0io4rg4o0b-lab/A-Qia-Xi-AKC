// siwe.js — Sign-In with Ethereum (EIP‑4361) 前端封裝

// 此檔提供基於 EIP‑4361 的登入流程。透過前端與錢包簽署標準化訊息，
// 然後將簽名送至後端驗證，建立安全的短效 session。您需要提供
// 兩個後端 API：GET /api/siwe/nonce 產生 nonce，POST /api/siwe/verify
// 驗證簽名。後端驗證成功後應設定 HttpOnly cookie 或回傳 token。

// 注意：此模組需搭配 `siwe` npm 套件。若未安裝，請執行
// `npm install siwe`。

console.log('[AKC siwe.js] build=2025-09-12a');

// === [護欄-1] 取得 Siwe 建構子（必要時動態載入） ===
/*async function __getSiweCtor() {
  // 1) 先嘗試拿現成的全域（兩種命名都查）
  let ctor = window.SiweMessage || (window.siwe && window.siwe.SiweMessage);
  if (ctor) return ctor;

  // 2) 若拿不到，主動動態載入一次（同你 CDN 版本）
  await new Promise((resolve, reject) => {
    const exist = document.querySelector('script[data-akc-siwe-umd]');
    if (exist) {
      exist.addEventListener('load', resolve);
      exist.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/siwe@2.1.4/dist/siwe.min.js';
    s.defer = true; // 與你原本一致
    s.crossOrigin = 'anonymous'; // 避免某些阻擋器誤判
    s.setAttribute('data-akc-siwe-umd', '1');
    s.onload = resolve;
    s.onerror = () => reject(new Error('[AKC] failed to load siwe.min.js'));
    document.head.appendChild(s);
  });

  ctor = window.SiweMessage || (window.siwe && window.siwe.SiweMessage);
  if (!ctor)
    throw new Error('[AKC] SIWE script loaded but global name not found');
  return ctor; 
} */

// === [護欄-2] 統一產生 EIP-4361 多行訊息 ===
/*async function __buildSiweMessage({ address, chainId, nonce }) {
  const SiweCtor = await __getSiweCtor();
  const msg = new SiweCtor({
    domain: location.host,
    address,
    statement: 'Sign in to Akashic Library',
    uri: location.origin,
    version: '1',
    chainId,
    nonce,
    issuedAt: new Date().toISOString(),
  });
  const message = msg.prepareMessage(); // 必須是這個多行字串
  if (!message.includes('\n'))
    throw new Error('[AKC] SIWE message is not multiline');
  return message;
} */
console.log('[SIWE] location.host=', location.host);

// [AKC siwe.js] bootstrap guard
(function () {
  const ok = !!(window.SiweMessage || (window.siwe && window.siwe.SiweMessage));
  if (!ok) {
    console.debug(
      '[AKC siwe.js] SIWE UMD not found (will try ESM dynamic import next).'
    );
  }
})();

(function () {
  // 避免重覆初始化
  if (window.__INIT_SIWE__) return;
  window.__INIT_SIWE__ = true;

  window.AKC = window.AKC || {};
  AKC.siwe = AKC.siwe || {};

  /**
   * 動態載入 siwe 套件，並回傳 SiweMessage 與 generateNonce
   */
  // 若透過 CDN 掛載，可能直接存在全域
  async function loadSiwe() {
    // 1) 若已由 <script> 或 UMD 掛載到全域，直接取用
    // 1) 若已由 <script> 或 UMD 掛到全域，直接取用（含 window.siwe.*）
    const gSiwe =
      (window.SiweMessage && {
        SiweMessage: window.SiweMessage,
        generateNonce: window.generateNonce,
      }) ||
      (window.siwe &&
        window.siwe.SiweMessage && {
          SiweMessage: window.siwe.SiweMessage,
          generateNonce: window.siwe.generateNonce,
        });

    if (gSiwe) {
      // 有些 UMD 版本沒有 export generateNonce；保底給個空函式
      return {
        SiweMessage: gSiwe.SiweMessage,
        generateNonce: gSiwe.generateNonce || (() => ''),
      };
    }

    // 2) 嘗試以瀏覽器原生 ESM 從 CDN 載入（無需打包器）
    try {
      const cdn = 'https://esm.sh/siwe@^3?bundle';
      const mod = await import(cdn);
      // 盡量涵蓋 siwe@2/3 的多種匯出形狀
      const SiweCtor =
        mod?.SiweMessage ||
        mod?.default?.SiweMessage ||
        (typeof mod?.default === 'function' ? mod.default : undefined);
      const genNonce =
        mod?.generateNonce || mod?.default?.generateNonce || (() => '');
      if (typeof SiweCtor === 'function') {
        return { SiweMessage: SiweCtor, generateNonce: genNonce };
      }
      // 再嘗試一次全域（若 UMD 稍晚就緒）
      if (window.siwe?.SiweMessage || window.SiweMessage) {
        return {
          SiweMessage: window.siwe?.SiweMessage || window.SiweMessage,
          generateNonce:
            window.siwe?.generateNonce || window.generateNonce || (() => ''),
        };
      }
      throw new Error('[AKC] SIWE not found after UMD/ESM attempts');
    } catch (e) {
      // 3) 最後才拋錯（避免裸模組 import('siwe') 在瀏覽器失敗）
      throw new Error(
        '無法載入 siwe 模組，請確認已安裝或可從 CDN 取得 siwe@^3'
      );
    }
  }
  AKC.siwe.loadSiwe = loadSiwe; // 供驗收腳本/除錯用
  AKC.siwe.VERSION = '2025-09-16a'; // 與 console 標記一致

  // 本檔局部的 JSON-RPC 守門（白名單）
  function _rpcSend(prov, method, params = []) {
    const ALLOWED = new Set([
      'eth_chainId',
      'eth_requestAccounts',
      'eth_accounts',
      'eth_call',
      'eth_estimateGas',
      'eth_sendRawTransaction',
      'personal_sign',
      'eth_sign',
      'eth_signTypedData_v4',
    ]);
    if (!ALLOWED.has(method)) {
      console.warn('[SIWE rpc] blocked non-standard method:', method);
      throw new Error(`RPC method not allowed: ${method}`);
    }
    if (typeof prov?.request === 'function') {
      return prov.request({ method, params });
    }
    if (typeof prov?.send === 'function') {
      return prov.send(method, params);
    }
    return Promise.reject(new Error('No provider'));
  }

  /**
   * 向後端取得一次性 nonce
   * @returns {Promise<string>} nonce 字串
   */
  async function fetchNonce() {
    const res = await fetch('/api/siwe/nonce', { credentials: 'include' });
    if (!res.ok) throw new Error('取得 SIWE nonce 失敗');
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = await res.json();
      return (j && (j.nonce || j.data?.nonce || '')).toString();
    }
    return (await res.text()).trim();
  }
  AKC.siwe.fetchNonce = fetchNonce;

  /**
   * 前端打包 EIP‑4361 訊息，簽名後送到後端驗證
   * @param {Object} opts
   * @param {any} opts.provider - ethers provider 或其他 EIP‑1193 provider
   * @param {string} [opts.statement] - 顯示給使用者的說明文字
   * @param {number} [opts.expirationMinutes] - 訊息有效時間（分鐘）；預設 15 分鐘
   */
  AKC.siwe.signIn = async function signIn({
    provider,
    statement,
    expirationMinutes,
  } = {}) {
    if (!provider) {
      // 嘗試從注入的 provider 建立 ethers provider
      if (window.ethereum) {
        if (typeof ethers === 'undefined' || !ethers.providers?.Web3Provider) {
          throw new Error('ethers library not loaded');
        }
        provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
      } else {
        throw new Error('缺少 provider，無法進行 SIWE 登入');
      }
    }
    // 確保已授權帳戶（避免首次或權限過期時 getAddress 失敗）
    try {
      await _rpcSend(provider, 'eth_requestAccounts', []);
    } catch (_) {}
    const signer = provider.getSigner();
    const address = await signer.getAddress();
    const { SiweMessage, generateNonce } = await loadSiwe();
    const checksumAddress = window.ethers?.utils?.getAddress
      ? window.ethers.utils.getAddress(address)
      : address;
    const nonce = await fetchNonce();
    const chainId =
      (await provider.getNetwork()).chainId || window.AKC_CONFIG?.CHAIN_ID;
    // 設定訊息有效時間
    const now = new Date();
    const issuedAt = now.toISOString();
    const expMins = expirationMinutes || 15;
    const expiration = new Date(
      now.getTime() + expMins * 60 * 1000
    ).toISOString();

    // 建立 SIWE 訊息
    const msg = new SiweMessage({
      domain: window.location.host,
      address: checksumAddress,
      statement: statement || 'Sign in to Akashic Library',
      uri: window.location.origin,
      version: '1',
      chainId: chainId,
      nonce: nonce || generateNonce(),
      issuedAt: issuedAt,
      expirationTime: expiration,
    });

    console.log('[SIWE] msg.domain=', msg.domain);

    const message = msg.prepareMessage().replace(/\r\n?/g, '\n');

    // --- Guardrails: 確認是完整多行 SIWE 訊息 --- //
    const firstLine = message.split('\n')[0] || '';
    const lineCount = message.split('\n').length;
    console.log('[SIWE] first line =', firstLine, '| lines =', lineCount);
    const okOld = firstLine.startsWith('Domain: ');
    const okNew = / wants you to sign in with your Ethereum account:?$/.test(
      firstLine
    );
    if ((!okOld && !okNew) || lineCount < 9) {
      throw new Error(
        'SIWE message malformed: unexpected first line or not multiline'
      );
    }

    // 進行簽名
    const signature = await signer.signMessage(message);
    // 送到後端驗證

    const verifyRes = await fetch('/api/siwe/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message: message, signature }),
    });
    const version = verifyRes.headers.get('x-akc-siwe-version');
    let payload = null;
    try {
      payload = await verifyRes.json();
    } catch (_) {}

    if (!verifyRes.ok) {
      console.error('[SIWE] verify failed', {
        status: verifyRes.status,
        version,
        payload,
      });
      throw new Error(
        (payload && (payload.error || payload.message)) ||
          `SIWE 驗證失敗 (${verifyRes.status})`
      );
    }
    if (!(payload && (payload.success === true || payload.ok === true))) {
      console.error('[SIWE] verify not ok', { version, payload });
      throw new Error(
        (payload && (payload.error || payload.message)) || 'SIWE 驗證不通過'
      );
    }

    // 登入成功，可選：更新 sessionStorage 或廣播
    try {
      sessionStorage.setItem('walletAddress', address.toLowerCase());
      sessionStorage.setItem('signature', signature);
      sessionStorage.setItem('isLoggedIn', 'true');
      sessionStorage.setItem('loginTime', Date.now().toString());
      if (window.AKC?.bus) {
        AKC.bus.emit('wallet:connected', { address: address.toLowerCase() });
      }
    } catch (_) {}

    try {
      if (window.AKC?.points?.award) {
        AKC.points.award({
          type: 'login',
          ref: address.toLowerCase(),
          amount: 10,
        });
      }
    } catch (_) {}
    try {
      AKC.siwe.__last = { address, message, signature, ts: Date.now() };
    } catch (_) {}
    return { address, message, signature };
  };

  /**
   * 產生 SIWE 訊息字串，不執行簽名或驗證。
   * 可用於預覽訊息或自定義驗簽流程。
   * @param {Object} params
   */
  AKC.siwe.generateMessage = async function generateMessage(params = {}) {
    const { SiweMessage } = await loadSiwe();
    const {
      address,
      statement,
      chainId = window.AKC_CONFIG?.CHAIN_ID,
      nonce = '',
    } = params;
    const addr = window.ethers?.utils?.getAddress
      ? window.ethers.utils.getAddress(address)
      : address;
    const now = new Date();
    const issuedAt = now.toISOString();
    const expiration = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    const msg = new SiweMessage({
      domain: window.location.host,
      address: addr,
      statement: statement || 'Sign in to Akashic Library',
      uri: window.location.origin,
      version: '1',
      chainId: chainId,
      nonce: nonce,
      issuedAt: issuedAt,
      expirationTime: expiration,
    });
    return msg.prepareMessage().replace(/\r\n?/g, '\n');
  };

  // 簽出功能：調用後端登出並清理 session
  AKC.siwe.signOut = async function signOut() {
    try {
      await fetch('/api/siwe/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (_) {}
    // 清除 sessionStorage
    sessionStorage.removeItem('walletAddress');
    sessionStorage.removeItem('signature');
    sessionStorage.removeItem('loginTime');
    sessionStorage.removeItem('isLoggedIn');
    if (window.AKC?.bus) AKC.bus.emit('wallet:disconnected');
  };
})();
// === Backward-compat shim (for legacy callers) ===
window.AKC = window.AKC || {};
AKC.buildSiweMessage = async function ({
  address,
  chainId,
  nonce,
  statement,
} = {}) {
  return AKC.siwe.generateMessage({ address, chainId, nonce, statement });
};
