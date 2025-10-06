const AkashiUI = {
  init: () => {
    console.log('Akashi UI Initialized');
    // 可加入初始化介面操作
  },
};
// === AKC UI namespace + toast（新增：全域提示層） ======================
window.AKC = window.AKC || {};
window.AKC.ui = window.AKC.ui || {};
(function () {
  let __akcToastContainer = null;
  function ensureToastContainer() {
    if (__akcToastContainer && document.body.contains(__akcToastContainer))
      return __akcToastContainer;
    const el = document.createElement('div');
    el.id = 'akc-toast-container';
    el.className =
      'fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
    __akcToastContainer = el;
    return el;
  }
  function toast(msg, type = 'info', opts = {}) {
    const c = ensureToastContainer();
    const life = Math.max(800, opts.duration || 2200);
    const item = document.createElement('div');
    const base =
      'pointer-events-auto px-4 py-2 rounded-2xl shadow-lg text-sm font-medium transition opacity-0 translate-y-1';
    const skin =
      {
        success: 'bg-green-600 text-white',
        error: 'bg-red-600 text-white',
        warn: 'bg-amber-500 text-black',
        info: 'bg-slate-800 text-white',
      }[type] || 'bg-slate-800 text-white';
    item.className = `${base} ${skin}`;
    item.textContent = String(msg ?? '');
    c.appendChild(item);
    requestAnimationFrame(() =>
      item.classList.remove('opacity-0', 'translate-y-1')
    );
    const close = () => {
      item.classList.add('opacity-0', 'translate-y-1');
      setTimeout(() => item.remove(), 200);
    };
    setTimeout(close, life);
    item.addEventListener('click', close);
    return item;
  }
  window.AKC.ui.toast = toast;
})();

(function () {
  const ns = (window.AKC = window.AKC || {});
  ns.ui = ns.ui || {};
  ns.ui.badgeBurst = function (target = '[data-points-badge], #pointsBadge') {
    const el =
      typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed',
      left: `${r.left + r.width / 2}px`,
      top: `${r.top + r.height / 2}px`,
      pointerEvents: 'none',
      zIndex: 9999,
    });
    document.body.appendChild(box);
    const N = 12;
    for (let i = 0; i < N; i++) {
      const s = document.createElement('span');
      s.textContent = '✦';
      Object.assign(s.style, {
        position: 'absolute',
        transform: 'translate(-50%,-50%)',
        opacity: '1',
        transition: 'transform 360ms ease, opacity 360ms ease',
        fontSize: '14px',
      });
      box.appendChild(s);
      const angle = (i / N) * 2 * Math.PI;
      const dist = 24 + Math.random() * 12;
      requestAnimationFrame(() => {
        s.style.transform = `translate(calc(-50% + ${
          Math.cos(angle) * dist
        }px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(1.1)`;
        s.style.opacity = '0';
      });
    }
    setTimeout(() => box.remove(), 420);
  };
})();

// === Wallet UI 一次化事件委派（支援 data-wallet 按鈕）==================
(function () {
  const ns = (window.AKC = window.AKC || {});
  if (ns.__walletBindController) ns.__walletBindController.abort();
  ns.__walletBindController = new AbortController();
  const { signal } = ns.__walletBindController;

  document.addEventListener(
    'click',
    async (e) => {
      const el = e.target.closest('[data-wallet]');
      if (!el) return;
      const action = el.dataset.wallet; // 'connect' | 'disconnect' | 'copy'
      try {
        if (action === 'connect') {
          // 同樣保留單顆按鈕禁用
          if (el.dataset.loading === '1') {
            return;
          }
          el.dataset.loading = '1';
          el.classList.add('opacity-60', 'pointer-events-none');

          try {
            await UI.handleWalletConnection();
          } finally {
            delete el.dataset.loading;
            el.classList.remove('opacity-60', 'pointer-events-none');
          }
        } else if (action === 'disconnect') {
          await window.logout?.();
          window.AKC?.ui?.toast?.('已登出', 'info');
          // 視需求補 UI.checkLoginUI()
          UI?.checkLoginUI?.();
        } else if (action === 'copy') {
          const addr = sessionStorage.getItem('walletAddress');
          if (addr) {
            await navigator.clipboard.writeText(addr);
            window.AKC?.ui?.toast?.('地址已複製', 'success');
          }
        }
      } catch (err) {
        (window.AKC?.DEBUG ? console.error : console.log)(
          '[wallet-ui] action error',
          err
        );
        window.AKC?.ui?.toast?.('錢包動作失敗，請再試一次', 'error');
      }
    },
    { signal }
  );

  // 供診斷：記錄已綁定次數
  window.__AKC_WALLET_UI_BINDS = (window.__AKC_WALLET_UI_BINDS || 0) + 1;
})();

// ======================================================================
document.getElementById('howToJoin')?.addEventListener('click', () => {
  window.location.href = 'whitepaper.html';
});
document.getElementById('joinNow')?.addEventListener('click', () => {
  window.location.href = 'whitepaper.html';
});

const UI = {
  checkLoginUI: function () {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn') === 'true';
    // 在本函式內自行抓節點（避免 ReferenceError）
    const walletBtn =
      document.getElementById('walletStatus') ||
      document.getElementById('connectWallet') ||
      document.getElementById('connectWalletButton');
    const profileBtn = document.getElementById('profileButton');
    const badgeIcon =
      document.getElementById('badgeIcon') ||
      document.querySelector('[data-role="badge"]') ||
      document.querySelector('[data-points-badge], #pointsBadge');

    if (walletBtn) walletBtn.classList.toggle('hidden', isLoggedIn);
    if (profileBtn) profileBtn.classList.toggle('hidden', !isLoggedIn);
    if (badgeIcon) badgeIcon.classList.toggle('hidden', !isLoggedIn);
  },

  bindGlobalEvents: function () {
    const profileBtn = document.getElementById('profileButton');
    if (profileBtn) {
      if (profileBtn.dataset.akBound === '1') return;
      profileBtn.dataset.akBound = '1';
      profileBtn.addEventListener('click', (e) => {
        const addr = sessionStorage.getItem('walletAddress');
        const target = addr
          ? `profile.html?uid=${encodeURIComponent(addr)}`
          : 'profile.html';
        // 若 Navbar 已設定 <a href="...">，就交由預設行為，避免覆蓋
        if (profileBtn.tagName === 'A' && profileBtn.getAttribute('href'))
          return;
        e.preventDefault?.();
        window.location.href = target;
      });
    }

    const walletBtn =
      document.getElementById('walletStatus') ||
      document.getElementById('connectWallet') ||
      document.getElementById('connectWalletButton');
    if (walletBtn) {
      // 若按鈕本身就有 data-wallet="connect"，交給「委派」處理，避免雙觸發
      if (walletBtn.hasAttribute('data-wallet')) {
        // 不做直接綁定
      } else if (walletBtn.dataset.akBound !== '1') {
        walletBtn.dataset.akBound = '1';
        walletBtn.onclick = () => UI.handleWalletConnection();
      }
    }

    // Fallback（只綁一次）：若導覽列是動態載入、onload 當下無元素，就用事件委派當備援
    if (!window.__AKC_IDBTN_FALLBACK_BOUND__) {
      window.__AKC_IDBTN_FALLBACK_BOUND__ = true;
      document.addEventListener('click', (e) => {
        const t = e.target.closest(
          '#walletStatus, #connectWallet, #connectWalletButton'
        );
        if (!t) return;
        if (t.matches('[data-wallet]') || t.closest('[data-wallet]')) return; // 交給 data-wallet 委派
        // 若已由直接綁定處理過就不再觸發，避免重複
        if (t.dataset.akBound === '1') return;
        UI.handleWalletConnection();
      });
    }
    // 整合 upload 表單事件（頁面沒有 #uploadForm 時不會綁定）
    this.bindUploadForm();

    if (
      document.getElementById('courseList') ||
      document.querySelector('.watch-btn')
    ) {
      UI.bindCourseWatchButtons();
    }
  },

  bindUploadForm: function () {
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
      uploadForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (typeof window.handleUploadCourse === 'function') {
          await window.handleUploadCourse(event);
        } else {
          console.error('❌ 無法執行 handleUploadCourse：未定義於全域');
        }
      });
    }
  },
  handleWalletConnection: async function () {
    // 全域防重入（與 wallet.js 互補）
    if (window.__AKC_UI_CONNECTING__) return;
    window.__AKC_UI_CONNECTING__ = true;
    try {
      // 無 Provider 且為行動裝置 → 走 Deeplink 開錢包 App
      const hasProvider = !!(window.__AKC_INJECTED || window.ethereum);
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      if (!hasProvider && isMobile) {
        const dappPath = location.pathname + location.search + location.hash;
        const dappUrl = location.host + encodeURI(dappPath);
        location.href = 'https://metamask.app.link/dapp/' + dappUrl;
        return;
      }

      if (!hasProvider && !isMobile && AKC.walletconnect?.connect) {
        window.AKC?.ui?.toast?.('請用手機錢包掃描 QR 以連線', 'info');
        const res = await AKC.walletconnect.connect();
        if (res?.address) {
          this.checkLoginUI();
          window.AKC?.ui?.toast?.(
            `已連線：${res.address.slice(0, 6)}…${res.address.slice(-4)}`,
            'success'
          );
          window.__akcMaybeRedirectAfterLogin?.(res.address);
          window._akcMaybeRedirectAfterLogin =
            window.__akcMaybeRedirectAfterLogin;
        }
        return;
      }

      window.AKC?.ui?.toast?.('請在錢包中確認連線…', 'info');
      const mode = (
        window.AKC?.getAuthMode ||
        (typeof __AKC_getAuthMode === 'function'
          ? __AKC_getAuthMode
          : () => 'strict')
      )();
      const stay = mode === 'open' || mode === 'soft';
      const res = await window.AKC?.wallet?.connect(
        stay ? { stay: true } : undefined
      );

      if (res?.address) {
        console.log(`✅ 已連線地址：${res.address}`);
        this.checkLoginUI();
        window.AKC?.ui?.toast?.(
          `已連線：${res.address.slice(0, 6)}…${res.address.slice(-4)}`,
          'success'
        );
      }
    } catch (err) {
      console.error('❌ 連接錢包失敗:', err);
      if (err?.code === -32002) {
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile && !window.__AKC_INJECTED) {
          const dappPath = location.pathname + location.search + location.hash;
          const dappUrl = location.host + encodeURI(dappPath);
          setTimeout(() => {
            location.href = 'https://metamask.app.link/dapp/' + dappUrl;
          }, 600);
        }
        window.AKC?.ui?.toast?.(
          '錢包正在處理連線，請在錢包完成或取消',
          'warn',
          { duration: 3000 }
        );
      } else {
        window.AKC?.ui?.toast?.('連線失敗，請再試一次', 'error');
      }
    } finally {
      window.__AKC_UI_CONNECTING__ = false;
    }
  },

  bindCourseWatchButtons: function () {
    const container = document.getElementById('courseList') || document;
    container.querySelectorAll('.watch-btn').forEach((btn) => {
      // 冪等守門：避免重複綁定
      if (btn.dataset.akBound === '1') return;
      btn.dataset.akBound = '1';
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (id) {
          console.log(`➡️ 開始播放課程 ID：${id}`);
          window.location.href = `course-view.html?courseId=${id}`;
        }
      });
    });
  },
};
// === Post-login redirect helpers (插入點 A) ===============================
(function () {
  // 讀取 <meta name="akc-login-redirect">，並換算成實際網址
  function getLoginRedirectTarget(address) {
    try {
      const meta = document.querySelector('meta[name="akc-login-redirect"]');
      const raw = meta?.content?.trim();
      if (!raw) return null;

      // 常用別名：profile => profile.html?uid=0x...
      if (raw === 'profile') {
        const addr = address || sessionStorage.getItem('walletAddress') || '';
        const q = addr ? `?uid=${encodeURIComponent(addr)}` : '';
        return `profile.html${q}`;
      }
      // 取得 raw 後，緊接著加一段（none/off/disabled 視為不導向）
      if (['none', 'off', 'disabled'].includes(raw)) return null;

      // === 預設的「登入後也許導頁」行為（只有「頁面沒有自己定義」時才啟用） ===
      if (typeof window._akcMaybeRedirectAfterLogin !== 'function') {
        window._akcMaybeRedirectAfterLogin = function (address) {
          try {
            const target = getLoginRedirectTarget(address);
            if (target) location.href = target; // 只有有設定才會導頁
          } catch (_) {
            /* 安全吞錯，避免打斷流程 */
          }
        };
      }

      // 直接寫路徑的情況，例如 missions.html
      return raw;
    } catch {
      return null;
    }
  }
  window._akcMaybeRedirectAfterLogin = window.__akcMaybeRedirectAfterLogin;

  // 僅執行一次的導向守門
  window.__AKC_POSTLOGIN_REDIRECT__ = window.__AKC_POSTLOGIN_REDIRECT__ || {
    done: false,
  };

  // 嘗試依 meta 導向（登入後 call）
  window.__akcMaybeRedirectAfterLogin = function (address) {
    try {
      if (window.__AKC_POSTLOGIN_REDIRECT__.done) return;
      const p = new URLSearchParams(location.search);
      if (p.get('noredir') === '1') return; // 封測免導向
      const url = getLoginRedirectTarget(address);
      if (!url) return;

      // 若已在目標頁，不需要導向
      const now = location.pathname.split('/').pop() || '';
      if (url.replace(/\?.*$/, '') === now) return;

      window.__AKC_POSTLOGIN_REDIRECT__.done = true;
      // 留一點時間給 UI/toast
      setTimeout(() => (location.href = url), 250);
    } catch {
      /* 靜默 */
    }
  };
})();

window.onload = () => {
  UI.checkLoginUI(); // ✅ 控制 profileButton 顯示
  UI.bindGlobalEvents();

  if (
    document.getElementById('courseList') ||
    document.querySelector('.watch-btn')
  ) {
    UI.bindCourseWatchButtons();
  }
  // 只綁一次：接到 wallet.js 廣播就更新 UI（不做資料層操作）
  if (!window.__UI_WALLET_CONNECTED_BOUND__) {
    window.__UI_WALLET_CONNECTED_BOUND__ = true;
    window.AKC?.bus?.on('wallet:connected', () => {
      UI.checkLoginUI();
      window.AKC?.ui?.toast?.('錢包已連線', 'success');
      const addr = sessionStorage.getItem('walletAddress');
      window.__akcMaybeRedirectAfterLogin?.(addr);
    });
    // 錢包已斷線（來自 wallet.js 的廣播，可能是自動登出或他頁登出）
    window.AKC?.bus?.on('wallet:disconnected', () => {
      UI.checkLoginUI();
    });
    // 使用者切換帳號（wallet.js 會清 session）
    window.AKC?.bus?.on('wallet:accountChanged', () => {
      UI.checkLoginUI();
    });
    // 暱稱更新：即時覆寫所有 data-bind="nickname" 的節點
    window.AKC?.bus?.on('nickname:updated', (payload) => {
      try {
        const name = typeof payload === 'string' ? payload : payload?.nickname;
        if (!name) return;
        const safe = String(name).trim().slice(0, 50);
        if (!safe) return;
        document.querySelectorAll('[data-bind="nickname"]').forEach((el) => {
          el.textContent = safe;
        });
      } catch (e) {
        /* 靜默保護 */
      }
    });
    // 允許從任意地方觸發錢包連線（含 Auth Modal 的第三個選項）
    window.AKC?.bus?.on('auth:login:wallet', () => {
      UI.handleWalletConnection();
    });
    // 兼容舊路徑：navbar 找不到按鈕時會 emit('wallet:connect')
    window.AKC?.bus?.on('wallet:connect', () => {
      UI.handleWalletConnection();
    });

    window.AKC?.bus?.on('wallet:error', (e) => {
      const msg =
        e?.message ||
        e?.detail?.error?.message ||
        e?.detail?.message ||
        '連線發生問題，請稍後重試';

      // 若是「沒有 Provider」→ 在行動裝置直接 Deeplink 到錢包 App
      const isNoProvider =
        /ethereum provider/i.test(msg) || /沒有偵測到可用/i.test(msg);
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const hasInjected = !!(window.__AKC_INJECTED || window.ethereum);

      if (isMobile && isNoProvider && !hasInjected) {
        const dappPath = location.pathname + location.search + location.hash;
        const dappUrl = location.host + encodeURI(dappPath);
        location.href = 'https://metamask.app.link/dapp/' + dappUrl;
        window.AKC?.ui?.toast?.('正在開啟錢包 App 以連線…', 'info');
        return; // 不再顯示紅條
      }

      // 其他錯誤照舊用紅條
      window.AKC?.ui?.toast?.(msg, 'error');
    });
  }
};
if (!window.__UI_POINTS_BOUND__) {
  window.__UI_POINTS_BOUND__ = true;
  // ==== Points 事件（只綁一次）=========================================
  window.AKC?.bus?.on('points:award:queued', (e) => {
    try {
      window.AKC?.ui?.toast?.(`+${e?.amount ?? 0}（排隊中）`, 'info');
    } catch {}
  });
  window.AKC?.bus?.on('points:updated', (e) => {
    try {
      const el = document.querySelector('[data-points-badge], #pointsBadge');
      const delta = Number(e?.amount || 0) || 0;
      if (el && delta) {
        const cur = parseInt((el.textContent || '0').trim(), 10) || 0;
        const next = cur + delta;
        el.textContent = String(next);
        el.style.transition = el.style.transition || 'transform 120ms';
        el.style.transform = 'scale(1.1)';
        setTimeout(() => (el.style.transform = ''), 160);
      }
    } catch {}
  });
  window.AKC?.bus?.on('points:awarded', (e) => {
    try {
      window.AKC?.ui?.toast?.(`+${e?.amount ?? 0} 分已入帳`, 'success');
      window.AKC?.ui?.badgeBurst?.('[data-points-badge], #pointsBadge');
    } catch {}
  });

  // 🔄 後端/其它頁面給的總分基準 → 直接覆寫 Navbar 角標
  window.AKC?.bus?.on('points:hydrate', (e) => {
    const n = Number(e?.total);
    if (!Number.isFinite(n)) return;
    const el = document.querySelector('[data-points-badge], #pointsBadge');
    if (!el) return;
    const cur = parseInt((el.textContent || '0').trim(), 10) || 0;
    const next = Math.max(cur, Math.floor(n)); // 不回退
    el.textContent = String(next);
    el.style.transform = 'scale(1)'; // 清除殘留縮放
    el.style.transform = 'scale(1)'; // 清掉任何殘留縮放
  });

  window.AKC?.bus?.on('points:award:failed', (e) => {
    const msg = e?.message || '加分失敗，請稍後再試';
    try {
      window.AKC?.ui?.toast?.(msg, 'error');
    } catch {}
  });
}
window.initUI = function () {
  console.log('✅ UI 初始化開始');

  const uploadRedirectForm = document.getElementById('uploadRedirectForm');
  if (uploadRedirectForm && uploadRedirectForm.dataset.directUpload === '1') {
    uploadRedirectForm.addEventListener('submit', (e) => {
      const shouldDirect = uploadRedirectForm.dataset.directUpload === '1';
      const addr = sessionStorage.getItem('walletAddress');

      if (shouldDirect && addr) {
        // 只有「明確標記直送」而且「已登入」才放行到後台
        location.href = 'upload.html';
        return;
      }

      // 其他情況，一律攔截交給 course.js 處理
      e.preventDefault();
    });
  }

  const joinButton = document.getElementById('joinButton');
  const startButton = document.getElementById('startButton');
  if (joinButton) {
    joinButton.addEventListener('click', () => {
      window.location.href = 'whitepaper.html';
    });
  }
  if (startButton) {
    startButton.addEventListener('click', () => {
      window.location.href = 'whitepaper.html';
    });
  }
  console.log('✅ UI 初始化完成');
};

// U-13: Debug 事件監聽（僅在 URL 有 ?debug=1 時啟用）
(function () {
  try {
    const p = new URLSearchParams(location.search);
    if (p.get('debug') !== '1') return;
    const bus = window.AKC?.bus;
    if (!bus || window.__AKC_DEBUG_BOUND__) return;
    window.__AKC_DEBUG_BOUND__ = true;
    const topics = [
      'wallet:connected',
      'wallet:disconnected',
      'wallet:accountChanged',
      'wallet:error',
      'nickname:updated',
      'points:award:queued',
      'points:updated',
      'points:awarded',
      'points:award:failed',
      'mission:start',
      'lesson:completed',
    ];
    topics.forEach((t) => bus.on(t, (e) => console.log('[DBG]', t, e)));
    console.log('✅ Debug bus listeners bound:', topics);
  } catch {}
})();
