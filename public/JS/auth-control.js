// auth-control.js

// ⬇️ 閒置時間偵測
// 讀取頁面權限模式：open | soft | strict（預設 strict）
function __AKC_getAuthMode() {
  const meta = document.querySelector('meta[name="akc-auth"]');
  const mode = (meta?.content || '').trim().toLowerCase();
  return mode === 'open' || mode === 'soft' ? mode : 'strict';
}
// 提供顯式 API，避免他檔直接依賴全域函式名
window.AKC = window.AKC || {};
window.AKC.getAuthMode = __AKC_getAuthMode;

// 冪等旗標與狀態存放於 window，避免重複載入報錯/重綁
window.__AKC_IDLE_MIN__ = window.__AKC_IDLE_MIN__ || 0;
if (!window.__AKC_IDLE_TIMER__) {
  window.__AKC_IDLE_TIMER__ = setInterval(() => {
    window.__AKC_IDLE_MIN__++;
    if (window.__AKC_IDLE_MIN__ >= 30) {
      // 一致化：清理登入相關的三個鍵，並發出提示事件（UI 會 toast）
      sessionStorage.removeItem('walletAddress');
      sessionStorage.removeItem('loginTime');
      sessionStorage.setItem('isLoggedIn', 'false');
      // 補齊：清除簽名與對外廣播斷線
      sessionStorage.removeItem('signature');
      window.AKC?.bus?.emit?.('wallet:disconnected');
      window.AKC?.bus?.emit?.('wallet:error', {
        message: '閒置 30 分鐘，已登出',
      });
      const mode = __AKC_getAuthMode();
      const p2 = (window.location.pathname || '').replace(/\/+$/, '');
      const onIndex2 = p2 === '' || p2 === '/' || /(^|\/)index\.html$/.test(p2);
      if (mode === 'strict' && !onIndex2) {
        window.location.replace('index.html');
      } else {
        // open/soft：不導回，留在當前頁，交給 UI/頁面顯示未登入狀態
      }
    }
  }, 60000);
}
if (!window.__AKC_IDLE_EVENTS_BOUND__) {
  ['mousemove', 'keydown', 'click', 'touchstart'].forEach((event) => {
    window.addEventListener(
      event,
      () => {
        window.__AKC_IDLE_MIN__ = 0;
      },
      { passive: true }
    );
  });
  window.__AKC_IDLE_EVENTS_BOUND__ = true;
}

// 統一的 Cookie 工具（供 checkLoginExpired 與 postLogin 共用）
function setSessionCookie(address) {
  const v = encodeURIComponent(
    JSON.stringify({ address: String(address || '').toLowerCase() })
  );
  document.cookie = `__session=${v}; Path=/; Max-Age=86400; SameSite=Lax; Secure`;
}
function clearSessionCookie() {
  document.cookie = '__session=; Path=/; Max-Age=0; SameSite=Lax; Secure';
}

// 每次進入頁面時檢查是否過期
function checkLoginExpired() {
  if (window.__AKC_EXPIRE_CHECKED__) return;
  window.__AKC_EXPIRE_CHECKED__ = true;

  const loginTime = Number(sessionStorage.getItem('loginTime') || 0);
  const expired =
    !!loginTime || localStorage.getItem('hasLoggedInOnce') === '1';
  if (!loginTime || Date.now() - loginTime > 1000 * 60 * 30) {
    if (!expired) return; // 初次開頁或沒登過：不提示
    console.warn('登入已過期，自動登出');

    localStorage.setItem('hasLoggedInOnce', '1');
    localStorage.setItem('lastAuthAt', String(Date.now()));

    // 與閒置登出一致化（避免清掉非登入用途的 session key）
    sessionStorage.removeItem('walletAddress');
    sessionStorage.removeItem('loginTime');
    sessionStorage.setItem('isLoggedIn', 'false');
    // 補齊：清除簽名與對外廣播斷線
    sessionStorage.removeItem('signature');
    window.AKC?.bus?.emit?.('wallet:disconnected');
    clearSessionCookie();

    window.AKC?.bus?.emit?.('wallet:error', {
      message: '登入已過期，請重新連線',
    });
    // 已在首頁或根路徑就不再重導，避免無窮重整
    const mode = __AKC_getAuthMode();
    const p = (window.location.pathname || '').replace(/\/+$/, '');
    const onIndex = p === '' || p === '/' || /(^|\/)index\.html$/.test(p);
    if (mode === 'strict' && !onIndex) {
      window.location.replace('index.html');
    } else {
      // open/soft：不導回，留在當前頁，交給頁面或 UI 處理
    }
  }
}
// 頁面就緒後只檢一次（避免重覆觸發）
document.addEventListener(
  'DOMContentLoaded',
  () => {
    try {
      checkLoginExpired();
    } catch (e) {
      console.warn('checkLoginExpired 執行失敗：', e);
    }
  },
  { once: true }
);

// 若本檔在 DOMContentLoaded 之後才載入，立即補跑一次檢查
if (document.readyState !== 'loading') {
  try {
    checkLoginExpired();
  } catch (e) {
    console.warn('checkLoginExpired 即時檢查失敗：', e);
  }
}

// 敏感操作前的身份驗證（強制重新簽名）
async function requireSensitiveSignature(reason = '執行敏感操作') {
  const confirmed = confirm(`${reason}，請再次進行錢包簽名以確認身份`);
  if (!confirmed) return false;

  let signer;
  if (window.AKC?.wallet?.getSigner) {
    signer = await window.AKC.wallet.getSigner();
  } else {
    const provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
    signer = provider.getSigner();
  }
  const address = await signer.getAddress();
  const signature = await signer.signMessage(
    `確認敏感操作：${reason} @${Date.now()}`
  );
  console.log('簽名結果:', signature);
  sessionStorage.setItem('signature', signature);
  sessionStorage.setItem('walletAddress', address);

  return true;
}
// === Auth modal 事件對接：社交登入 / Passkey（新增） ===
(function () {
  function waitBus(maxRetry = 30) {
    return new Promise((resolve, reject) => {
      let n = 0;
      (function loop() {
        const bus = window.AKC?.bus;
        if (bus) return resolve(bus);
        if (n++ >= maxRetry) return reject(new Error('AKC.bus not ready'));
        setTimeout(loop, 200);
      })();
    });
  }

  function onDomReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  // === Link/Merge：不同提供者使用同一 email 時，把新憑證連到目前帳號 ===
  async function linkIntoCurrentAccount(pendingCred, email) {
    // 1) 找出這個 email 目前綁的是哪種登入法
    const methods = await firebase.auth().fetchSignInMethodsForEmail(email);
    // 2) 讓使用者先用「已存在」的方法登入舊帳號
    if (methods.includes('password')) {
      // 你已經有 email 登入 UI，這裡先用 prompt 當備援
      const pwd =
        prompt(`此 Email 已綁定密碼，請輸入密碼以合併帳號：\n${email}`) || '';
      await firebase.auth().signInWithEmailAndPassword(email, pwd);
    } else if (methods.includes('google.com')) {
      const gp = new firebase.auth.GoogleAuthProvider();
      await firebase.auth().signInWithPopup(gp);
    } else {
      // 其他提供者可在未來擴充
      throw new Error(`尚未支援的合併方法：${methods.join(',')}`);
    }
    // 3) 目前已登入「舊帳號」，把「新憑證」鏈上來（同一個 uid）
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('尚未登入舊帳號，無法連結提供者');
    await user.linkWithCredential(pendingCred);
    // 4) 連結成功 → 回到統一後流程
    return user;
  }

  // === 共用：登入後處理（Popup/Redirect/Email 成功都走這裡） ===
  async function postLogin(user, method = 'google') {
    try {
      // 1) 記錄 session 狀態
      sessionStorage.setItem('isLoggedIn', 'true');
      sessionStorage.setItem('loginTime', String(Date.now()));
      sessionStorage.setItem('userId', user.uid);
      setSessionCookie(
        sessionStorage.getItem('walletAddress') || user?.uid || ''
      );

      sessionStorage.setItem(
        'loginMethod',
        method === 'password' ? 'password' : 'social'
      );

      // 2) 建/補使用者文件
      const db = window.db || (firebase?.firestore?.() ?? null);
      if (db) {
        const ref = db.collection('users').doc(user.uid);
        const snap = await ref.get();
        if (!snap.exists) {
          await ref.set({
            provider: method,
            nickname: (user.displayName || '').trim().slice(0, 50) || 'User',
            createdAt: Date.now(),
          });
        }
      }

      // 設置 __session：用來讓雲端函式認你是誰（address）
      function setSessionCookie(address) {
        const v = encodeURIComponent(
          JSON.stringify({ address: String(address || '').toLowerCase() })
        );
        // Firebase Hosting 唯一允許的 cookie 名稱就是 __session
        document.cookie = `__session=${v}; Path=/; Max-Age=86400; SameSite=Lax; Secure`;
      }
      function clearSessionCookie() {
        document.cookie = '__session=; Path=/; Max-Age=0; SameSite=Lax; Secure';
      }

      // 3) 發事件（舊 UI 兼容）
      const bus = window.AKC?.bus;
      bus?.emit?.('user:login', { method, uid: user.uid });
      bus?.emit?.('wallet:connected');

      // 4) 關掉登入彈窗；可選導去個人頁
      window.AKC?.ui?.closeAuthModal?.();
      // ★ 每日登入加分：任何頁面登入都要送；ref 先用本機日期，後端會統一覆蓋為台北日界線
      try {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const ref = `${yyyy}-${mm}-${dd}`;
        await window.AKC?.points?.award({
          type: 'login:daily',
          amount: 1,
          ref, // ← 關鍵：避免前端擋掉
        });
      } catch (e) {
        console.warn('[auth-control] daily login award failed', e);
      }

      // 導頁條件保留：只在首頁才導去個人頁
      if (/index\.html$|^\/$/.test(location.pathname)) {
        location.href = 'profile.html';
      }
    } catch (e) {
      console.warn('[auth-control] postLogin failed', e);
    }
  }

  onDomReady(async () => {
    // 僅在 redirect 登回頁面時才會有資料；沒發生 redirect 會拿到空結果
    try {
      const r = await firebase.auth().getRedirectResult();
      if (r && r.user) {
        await postLogin(r.user, 'google'); // ← 新增
      }
    } catch (e) {
      console.warn('[auth-control] getRedirectResult failed:', e);
    }

    let bus;
    try {
      bus = await waitBus();
    } catch (e) {
      console.warn('[auth-control] bus not ready:', e);
      return;
    }

    // === 防重複綁定（避免彈兩次/觸發兩次） ===
    if (window.__AKC_AUTH_EVENTS_BOUND__) return;
    window.__AKC_AUTH_EVENTS_BOUND__ = true;

    // 1) Email/社交登入：同時監聽兩個事件，保險
    const handleSocial = async () => {
      if (window.__AKC_SOCIAL_INFLIGHT__) return;
      window.__AKC_SOCIAL_INFLIGHT__ = true;
      try {
        // 以 Firebase Google 為例（使用 compat 版 API）
        const provider = new firebase.auth.GoogleAuthProvider();
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile) {
          await firebase.auth().signInWithRedirect(provider);
          return; // 回頁後由 onDomReady 的 getRedirectResult 再 postLogin
        }
        const result = await firebase.auth().signInWithPopup(provider);
        await postLogin(result.user, 'google');

        // 廣播成功事件（新舊相容）
        bus.emit?.('user:login', { method: 'google', uid: result.user?.uid });
        bus.emit?.('wallet:connected'); // 舊程式若只聽這個也可動
      } catch (err) {
        // ★ 新增：若同一 email 已綁在別的提供者 → 先登入舊帳號，再把這次的憑證鏈上去
        if (
          err &&
          err.code === 'auth/account-exists-with-different-credential' &&
          err.email &&
          err.credential
        ) {
          try {
            const merged = await linkIntoCurrentAccount(
              err.credential,
              err.email
            );
            await postLogin(merged, 'google'); // 合併完成，回到同一路徑
          } catch (e) {
            console.warn('[auth-control] link/merge failed:', e);
            bus.emit?.('wallet:error', { message: '帳號合併失敗', error: e });
          }
        } else {
          console.warn('[auth-control] social login failed:', err);
          bus.emit?.('wallet:error', { message: '社交登入失敗', error: err });
        }
      } finally {
        window.__AKC_SOCIAL_INFLIGHT__ = false;
      }
    };

    bus.on?.('auth:login:social', handleSocial);
    bus.on?.('auth:login:email', async (ev) => {
      const { email, password } = ev || {};
      try {
        const cred = await firebase
          .auth()
          .signInWithEmailAndPassword(email, password);
        await postLogin(cred.user, 'password');
      } catch (e) {
        bus.emit('auth:login:fail', e);
      }
    });

    // 2) Passkey：先提示，之後再接 WebAuthn
    bus.on?.('auth:login:passkey', () => {
      alert('Passkey 登入即將開放（下一步會接 WebAuthn/Passkeys）');
    });
  });
})();
