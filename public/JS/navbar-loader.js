// navbar-loader.js (修正版)
async function loadNavbar() {
  const res = await fetch('navbar.html');
  const html = await res.text();
  const placeholder = document.getElementById('navbar-placeholder');
  if (!placeholder) return;
  placeholder.innerHTML = html;

  // navbar-style.js → auth-modal.js → auth-control.js → navbar.js
  // 依序載入樣式與邏輯
  const v = 'v=20250923c';
  const scripts = [
    `JS/style/navbar-style.js?${v}`,
    `JS/auth-modal.js?${v}`,
    `JS/auth-control.js?${v}`,
    `JS/navbar.js?${v}`,
  ];

  for (const src of scripts) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  // 載入完成後再執行初始化
  if (typeof initNavbarStyles === 'function') initNavbarStyles();
  if (typeof initNavbar === 'function') initNavbar();
  // 綁定錢包按鈕
  if (typeof window.bindWalletButtons === 'function')
    window.bindWalletButtons();
  // 🌙 啟動「自動登出監控」：若尚未載入 utils.js，就動態載入；載入後若有函式就呼叫
  if (typeof initAutoLogout !== 'function') {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'JS/utils.js';
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }
  if (typeof initAutoLogout === 'function') initAutoLogout();
  document.dispatchEvent(new CustomEvent('navbar:ready'));
  // === add: 全站 Points HUD 監聽（導航角標同步） ===
  (function bindPointsHUD() {
    const hud = document.querySelector('[data-points-badge], #pointsBadge');
    if (!hud) return;
    const set = (n) => {
      hud.textContent = String(n);
      hud.hidden = false;
    };

    AKC?.bus?.on?.('points:hydrate', (e) => {
      if (e?.total != null) set(e.total);
    });
    AKC?.bus?.on?.('points:updated', (e) => {
      const tot = e?.detail?.total ?? e?.total;
      if (tot != null) set(tot);
    });
  })();
}
window.loadNavbar = loadNavbar;
