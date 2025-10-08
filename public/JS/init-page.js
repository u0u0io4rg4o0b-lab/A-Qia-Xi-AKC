window.addEventListener('DOMContentLoaded', async () => {
  await loadNavbar();

  // ✅ 檢查 navbar 是否正確載入
  if (typeof initNavbar === 'function') {
    initNavbar();
  } else {
    console.warn('⚠️ initNavbar 尚未定義，請檢查 navbar.js 是否正確載入');
  }

  // ✅ UI 初始化（如果存在）
  if (typeof window.initUI === 'function') {
    window.initUI();
  }

  // ✅ 預設初始化動作
  UI.bindGlobalEvents?.();
  window.bindWalletButtons?.();
});
