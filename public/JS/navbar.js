if (new URLSearchParams(location.search).get('debug') === '1') {
  console.log('🎯 walletAddress', sessionStorage.getItem('walletAddress'));
}

// ---- nickname 快取與短地址工具（新增） ----
function shortAddr(addr) {
  return addr ? addr.slice(0, 6) + '…' + addr.slice(-4) : '';
}
function setCachedNickname() {
  // no-op：依安全原則不將暱稱寫入 localStorage，僅避免 ReferenceError
}

async function initNavbar() {
  let user = null;
  try {
    // ✅ 嘗試透過 checkLogin() 取得目前登入的使用者資料
    if (typeof checkLogin === 'function') {
      user = await checkLogin();
    }
  } catch (err) {
    console.warn('⚠️ 尚未登入，視為訪客身份');
  }

  // 🔍 取得 DOM 元素（只操作已存在的 ID）
  const connectBtn =
    document.getElementById('connectWalletButton') || // 新版
    document.getElementById('connectWallet') || // 舊版
    document.getElementById('walletStatus'); // ui.js 綁定用

  const profileBtn =
    document.getElementById('profileButton') || // 新版
    document.getElementById('profileNav') || // 舊版
    document.getElementById('initprofilebutton'); // 早期命名

  const nicknameDisplay = document.getElementById('userNickname');

  // ✅ 讀取瀏覽器中的錢包地址，作為登入狀態參考
  let address = sessionStorage.getItem('walletAddress');
  const userId = sessionStorage.getItem('userId'); // 社交登入 UID
  const isLoggedIn = sessionStorage.getItem('isLoggedIn') === 'true';

  if (!user && address) {
    console.warn(
      '⚠️ 檢測到 sessionStorage 有地址但無 Firebase 登入，疑似快取錯誤'
    );
    // 先不要立即清除，改為進入未登入模式
  }

  // ✅ 登入狀態：已登入 + 地址存在
  // ✅ 登入狀態：地址存在（暱稱另行嘗試）
  if (address) {
    console.log('🔎 偵測到錢包地址，套用已連錢包 UI:', address);
    if (connectBtn) connectBtn.classList.add('hidden');
    if (profileBtn) {
      profileBtn.classList.remove('hidden');
      profileBtn.classList.add('inline-block');
      profileBtn.href = `profile.html?uid=${encodeURIComponent(address)}`;
    }

    // 👤 顯示暱稱（先用快取/短地址 → 再嘗試從 Firestore 覆寫）
    if (nicknameDisplay) {
      // 1) 先顯示快取或短地址，不要空白
      const first = shortAddr(address);
      nicknameDisplay.textContent = first;
      nicknameDisplay.classList.remove('hidden');
      nicknameDisplay.classList.add('inline-block');
      if (!nicknameDisplay.dataset.bound) {
        nicknameDisplay.addEventListener('click', () => {
          window.location.href = `profile.html?uid=${encodeURIComponent(
            address
          )}`;
        });
        nicknameDisplay.dataset.bound = '1';
        // A11y: 讓暱稱可用鍵盤啟動與被輔助工具識別
        nicknameDisplay.setAttribute?.('role', 'link');
        nicknameDisplay.setAttribute?.('tabindex', '0');
        if (!nicknameDisplay.dataset.kbbound) {
          nicknameDisplay.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              window.location.href = `profile.html?uid=${encodeURIComponent(
                address
              )}`;
            }
          });
          nicknameDisplay.dataset.kbbound = '1';
        }
      }

      // 2) 再嘗試從 Firestore 取暱稱（成功才覆寫 + 寫回快取）
      try {
        const db = window.db || (firebase?.firestore?.() ?? null); // L68 取代
        if (!db) {
          console.warn('[navbar.js] Firebase DB 未就緒，使用短地址顯示');
          return;
        } // L69 新增
        const users = db.collection('users');

        // 1) 先讀原樣 docId
        // 1) 先讀「小寫」docId（標準）
        const lower = (address || '').toLowerCase();
        let snap = await users.doc(lower).get();

        // 2) 找不到 → 回退讀「原樣」docId（相容舊資料）
        if (!snap.exists && lower !== address) {
          snap = await users.doc(address).get();
        }

        // 3) 有文件才覆寫暱稱
        if (snap.exists) {
          const data = snap.data() || {};
          const nn =
            typeof data?.nickname === 'string' ? data.nickname.trim() : '';
          if (nn) {
            const safe = nn.slice(0, 50);
            nicknameDisplay.textContent = safe;
            setCachedNickname?.(address, safe);
          }
        }
      } catch (err) {
        console.warn(
          '⚠️ 暱稱讀取失敗（多半是離線），使用快取/短地址即可。',
          err
        );
      }
      // 若啟用 Auth Modal，將 Connect 改為開啟三鍵入口（不動舊 SIWE 流程）
      try {
        if (
          window.AKC?.features?.authModal &&
          connectBtn &&
          !connectBtn.dataset.authopen
        ) {
          // 第三個參數設為 true（capture），確保比委派處理器先拿到事件
          connectBtn.addEventListener(
            'click',
            (ev) => {
              // 只要是「要連線」的狀態，不論有沒有 data-wallet，都先開 Auth Modal
              const mode = (
                connectBtn.dataset.wallet || 'connect'
              ).toLowerCase();
              if (mode === 'connect') {
                ev.preventDefault();
                ev.stopImmediatePropagation?.();
                window.AKC?.bus?.emit?.('ui:auth:open');
              }
            },
            true
          );
          connectBtn.dataset.authopen = '1';
        }
      } catch (_) {}

      // ✅ 補強保護：確保按鈕有正確綁定
      window.bindWalletButtons?.();
      return; // ✅ 已處理完已登入 UI，結束函式，避免後面把 UI 改回訪客
    }
  } else {
    // 訪客狀態：若啟用 Auth Modal，攔截 Connect → 先開三選一彈窗
    try {
      if (
        window.AKC?.features?.authModal &&
        connectBtn &&
        !connectBtn.dataset.authopen
      ) {
        connectBtn.addEventListener(
          'click',
          (ev) => {
            // 僅在要「連線」時攔截；若之後你把 data-wallet 切成別值，也不會誤攔
            const mode = (connectBtn.dataset.wallet || 'connect').toLowerCase();
            if (mode === 'connect') {
              ev.preventDefault();
              ev.stopImmediatePropagation?.();
              window.AKC?.bus?.emit?.('ui:auth:open');
            }
          },
          true
        ); // capture 確保先接到
        connectBtn.dataset.authopen = '1';
      }
    } catch (_) {}

    if (connectBtn) {
      connectBtn.classList.remove('hidden');
      connectBtn.classList.add('inline-block');
      // （不再用 onclick 綁行為）按鈕行為交給 wallet.js 的 window.bindWalletButtons() 統一處理
    }
    if (profileBtn) profileBtn.classList.add('hidden');
    if (nicknameDisplay) nicknameDisplay.classList.add('hidden');
  }
}

// === 事件化補強：錢包連上、或 Navbar 載入完成 → 重新套用一次 UI ===

window.initNavbar = initNavbar;

function applyPointsToBadge(total) {
  // 允許 id 或 data 屬性，擇一存在即可
  const el = document.querySelector('[data-points-badge], #pointsBadge');
  if (!el) return;

  // 目前盒子裡的糖果數
  const cur = Number(el.textContent || 0);
  // 這次拿到的新糖果數
  const val = Number(total);

  // 只有拿到「真的有數字」才更新；拿到空空就什麼都不做（不要清成 0）
  if (!Number.isFinite(val)) return;

  // 不回退：顯示較大的那個數字
  el.textContent = String(Math.max(cur, val));
  el.classList.remove('hidden'); // 確保看得到
}

//  使用者在 Modal 點了「錢包登入」：把流程導回原本 SIWE/WalletConnect
if (!window.__AKC_NAVBAR_WALLET_BOUND__) {
  window.__AKC_NAVBAR_WALLET_BOUND__ = true;
  window.AKC?.bus?.on('auth:login:wallet', () => {
    // 關面板（用剛剛新增的 API）
    window.AKC?.ui?.closeAuthModal?.();
    sessionStorage.setItem('loginMethod', 'wallet');

    // 讓「連接錢包」按鈕繞過「再跳 Modal」的攔截，一次直通舊有流程
    const walletBtn = document.querySelector('[data-wallet]'); // 你現場代碼中的 wallet 連接鈕
    if (walletBtn) {
      const orig = walletBtn.dataset.wallet; // 通常是 'connect'
      walletBtn.dataset.wallet = 'go'; // 臨時改成 'go'，讓你的攔截條件 (=== 'connect') 不再觸發
      setTimeout(() => {
        walletBtn.click(); // 觸發原本已經綁好的錢包流程（不動 SIWE）
        walletBtn.dataset.wallet = orig; // 還原屬性
      }, 0);
    } else {
      // 找不到 DOM（或委派未綁好）時，走後備事件
      // 後備一：舊程式事件
      window.AKC?.bus?.emit?.('wallet:connect');
      // 後備二：再退一步，直接用 EIP-1193 叫錢包（若可用）
      try {
        if (window.ethereum?.request) {
          window.ethereum
            .request({ method: 'eth_requestAccounts' })
            .then(() => window.AKC?.bus?.emit?.('wallet:connected'))
            .catch((e) => window.AKC?.bus?.emit?.('wallet:error', e));
        }
      } catch (_) {}
    }
  });
}

// === Floating mini navbar：在向下捲動時顯示「就近可點」的導覽條 ===
// 規則：
// - 預設 auto：僅在寬度 <= 1024px 顯示；meta 可強制 on/off
//   <meta name="akc-navbar-float" content="on|off|auto">
// - 內容：↑Top、Profile（有錢包地址時）、Connect/Disconnect（沿用 data-wallet 事件委派）
(function initAkcFloatingNav() {
  if (window.__AKC_FLOAT_NAV__) return;
  window.__AKC_FLOAT_NAV__ = true;

  const meta = (
    document.querySelector('meta[name="akc-navbar-float"]')?.content || 'auto'
  ).toLowerCase();
  const isMobile = window.matchMedia('(max-width: 1024px)').matches;
  const enabled = meta === 'on' || (meta === 'auto' && isMobile);
  if (!enabled) return;

  const bar = document.createElement('div');
  bar.id = 'akc-float-nav';
  // Tailwind 友好 + 無 Tailwind 也可用（inline style）
  bar.className = 'fixed bottom-3 inset-x-3 z-50 hidden';
  bar.style.pointerEvents = 'none';

  bar.innerHTML = `
    <div id="akc-float-wrap" role="navigation" aria-label="Quick navigation"
         class="flex gap-2 justify-center items-center p-2 rounded-xl shadow-sm
                bg-white border border-gray-300 text-gray-800
                dark:bg-white dark:border-gray-300 dark:text-gray-800
                pointer-events-auto">
      <button id="akc-float-top" type="button" aria-label="Back to top"
              class="px-3 py-1.5 rounded-lg border text-sm border-gray-300 text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring">↑ Top</button>
      <a id="akc-float-prof" href="profile.html"
         class="px-3 py-1.5 rounded-lg text-sm text-gray-700 hover:text-blue-600 hidden">Profile</a>
      <button id="akc-float-wallet" data-wallet="connect" type="button"
              class="px-3 py-1.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring">Connect</button>
    </div>`;
  document.body.appendChild(bar);

  // 行為：回到頂部
  const topBtn = bar.querySelector('#akc-float-top');
  topBtn.addEventListener('click', () =>
    window.scrollTo({ top: 0, behavior: 'smooth' })
  );

  function refreshBySession() {
    const addr = (sessionStorage.getItem('walletAddress') || '').toLowerCase();
    const prof = bar.querySelector('#akc-float-prof');
    const walletBtn = bar.querySelector('#akc-float-wallet');
    if (addr) {
      prof.classList.remove('hidden');
      prof.href = 'profile.html?uid=' + encodeURIComponent(addr);
      walletBtn.dataset.wallet = 'disconnect';
      walletBtn.textContent = 'Disconnect';
      walletBtn.className =
        'px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring';
    } else {
      prof.classList.add('hidden');
      walletBtn.dataset.wallet = 'connect';
      walletBtn.textContent = 'Connect';
      walletBtn.className =
        'px-3 py-1.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring';
    }

    // 若啟用 Auth Modal，攔截「連線狀態」的 Wallet 鈕，改成開三鍵入口
    try {
      if (
        window.AKC?.features?.authModal &&
        walletBtn &&
        !walletBtn.dataset.authopen
      ) {
        walletBtn.addEventListener(
          'click',
          (ev) => {
            if (walletBtn.dataset.wallet === 'connect') {
              ev.preventDefault();
              ev.stopImmediatePropagation?.(); // 避免舊的委派同時觸發
              window.AKC?.bus?.emit?.('ui:auth:open');
            }
          },
          true
        );
        walletBtn.dataset.authopen = '1';
      }
    } catch (_) {}

    // 交給既有的委派去實際處理（不重複綁定）
    window.bindWalletButtons?.();
    return;
  }
  refreshBySession();

  // 顯示時機：捲動超過 240px 才出現
  const show = () => {
    if (window.scrollY > 240) bar.classList.remove('hidden');
    else bar.classList.add('hidden');
  };
  show();
  window.addEventListener('scroll', show, { passive: true });

  // 狀態同步
  AKC?.bus?.on('wallet:connected', refreshBySession);
  AKC?.bus?.on('wallet:disconnected', refreshBySession);
  AKC?.bus?.on('nickname:updated', () => refreshBySession());
})();

if (!window.__NAVBAR_EVENTS_BOUND__) {
  window.__NAVBAR_EVENTS_BOUND__ = true;

  AKC?.bus?.on('wallet:connected', () => {
    try {
      initNavbar();
    } catch (e) {
      /* 靜默保護，避免影響主流程 */
    }
  });
  // 3) 暱稱更新 → 只改字，不重跑整個 init
  AKC?.bus?.on('nickname:updated', (payload) => {
    try {
      const el = document.getElementById('userNickname');
      if (!el) return;
      const nn = typeof payload === 'string' ? payload : payload?.nickname;
      if (!nn) return;
      const safe = nn.trim().slice(0, 50);
      if (safe) el.textContent = safe;
    } catch (e) {}
  });

  // 🔄 首載 & 換帳號時，以後端分數作為基準同步角標
  const doHydratePoints = async () => {
    try {
      const addr = sessionStorage.getItem('walletAddress');
      const lower = addr && addr.toLowerCase();
      const db =
        window.db ||
        (window.firebase && firebase.firestore && firebase.firestore());
      if (!lower || !db) return;
      const snap = await db.collection('users').doc(lower).get();
      const total = Number((snap && snap.data && snap.data().pointsTotal) || 0);
      if (Number.isFinite(total)) {
        window.AKC?.bus?.emit?.('points:hydrate', { total });
        applyPointsToBadge(total);
      }
    } catch (err) {
      console.warn('[navbar] hydrate points failed', err);
    }
  };
  doHydratePoints(); // 首載一次
  AKC?.bus?.on('wallet:accountChanged', doHydratePoints);

  document.addEventListener('navbar:ready', () => {
    try {
      initNavbar();
      // Navbar 的 HTML/DOM 就緒後，再同步一次角標，避免被模板覆蓋成 0
      doHydratePoints();
    } catch (e) {
      /* 靜默保護，避免影響主流程 */
    }
  });
}
// === Fallback：DOM 就緒即至少初始化一次（避免漏發 navbar:ready） ===
if (document.readyState !== 'loading') {
  try {
    initNavbar();
  } catch (e) {}
} else {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      initNavbar();
    } catch (e) {}
  });
}
