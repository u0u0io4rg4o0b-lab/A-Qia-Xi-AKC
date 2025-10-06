(function () {
  if (window.__AKC_UTILS_LOADED__) {
    /* 已載入就不再跑 */
  } else {
    window.__AKC_UTILS_LOADED__ = true;
  }

  let logoutTimer = null; // 新增：自動登出用的全域計時器
  let __akc_autoLogoutBound = false; // 新增：避免重複綁定監聽

  function resetLogoutTimer() {
    clearTimeout(logoutTimer);
    logoutTimer = setTimeout(() => {
      console.log('⏳ 自動登出觸發');
      try {
        // TODO：之後可改成只清特定 key，而不是 clear()
        localStorage.clear();
      } catch (e) {
        /* ignore */
      }
      alert('您已閒置過久，請重新連接錢包');
      window.location.href = 'index.html';
    }, 10 * 60 * 1000);
  }

  function initAutoLogout() {
    if (__akc_autoLogoutBound) return;
    __akc_autoLogoutBound = true;
    // 初次啟動登出倒數
    resetLogoutTimer();

    // 使用者有互動就重設倒數
    ['mousemove', 'keydown', 'click', 'touchstart', 'visibilitychange'].forEach(
      (event) => {
        document.addEventListener(event, () => {
          // 如果頁面被隱藏/喚醒也當作一次互動
          resetLogoutTimer();
        });
      }
    );

    console.log('🕒 自動登出監控已啟動');
  }
  // 讓非 module 的 <script> 也能用
  if (typeof window !== 'undefined') {
    window.initAutoLogout = window.initAutoLogout || initAutoLogout;
    window.resetLogoutTimer = window.resetLogoutTimer || resetLogoutTimer;
  }
});
