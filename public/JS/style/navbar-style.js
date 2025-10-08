console.log('✅ 成功載入 navbar-style.js');

// 基礎視覺風格
function initBodyStyle() {
  const bodyRoot = document.getElementById('bodyRoot');
  if (!bodyRoot) return;
  bodyRoot.classList.add(
    'm-0', // 外距歸零
    'font-noto', // 使用 Noto 字體（需在 Tailwind config 設定）
    'bg-[#f9f9f9]', // 背景色
    'text-[#333]', // 文字主色
    'overflow-x-hidden'
  );
}
function initlogoContainer() {
  const logoContainer = document.getElementById('logoContainer');
  if (!logoContainer) return;
  logoContainer.classList.add(
    'flex',
    'items-baseline',
    'space-x-1',
    'shrink-0', // ⬅️ 小螢幕保險：Logo 區不被壓縮換行
    'whitespace-nowrap' // ⬅️ 中英混排不拆字
  );
}

// 導覽
function initHeaderStyle() {
  const header = document.querySelector('header');
  if (!header) return;
  header.classList.add(
    'flex',
    'items-center',
    'justify-between',
    // 左右留白 + 高度
    'px-4',
    'sm:px-6',
    'md:px-8',
    'py-3',
    // 避開 iOS 右側手勢/瀏海
    'pr-[env(safe-area-inset-right,0px)]',
    'pl-[env(safe-area-inset-left,0px)]',
    'gap-2',

    'flex-wrap', // 很窄時允許第二行，避免把畫面撐寬
    'gap-y-2', // 換行時上下間距不要擠
    'bg-white', // 固定白底
    'border-b',
    'border-gray-200', // 與下方內容做視覺分隔
    'shadow-sm', // 更明顯的分層感（可保留/移除看喜好）
    'overflow-x-hidden' // 保底：避免任何子項目讓 header 橫向溢出
  ); // 讓 header 真正成為橫向 Flex
  const navList =
    header.querySelector('#navList') || document.getElementById('navList');
  if (!navList) return;
  // 政策：單行 + 可橫向滑動（和交接包一致）
  navList.classList.remove('flex-wrap', 'whitespace-normal', 'flex-none');
  navList.classList.add(
    'flex-1',
    'flex',
    'items-center',
    // 手機：允許換行與較小字距
    'flex-wrap',
    'gap-x-3',
    'gap-y-2',
    'text-[14px]',
    // 平板以上：回到單行、較大間距
    'sm:whitespace-nowrap',
    'sm:flex-nowrap',
    'sm:gap-x-4',
    'md:gap-x-6',
    'sm:text-[15px]',
    'md:text-base'
  );
}
function initMainSpacing() {
  const main = document.querySelector('main');
  if (!main) return;
  main.classList.add(
    'mt-3',
    'sm:mt-4',
    'mt-4',
    'sm:mt-6', // 📏 再多一點上邊距，Navbar 與內容不會黏在一起
    'px-4',
    'sm:px-6'
  );
}

// 導覽樣板
function initNavList() {
  const navList = document.getElementById('navList');
  if (!navList) return;
  navList.classList.add(
    'flex',
    'items-center',
    'gap-4',
    'md:gap-6',
    'text-gray-800',

    // 單行 + 橫向滑動（右側錢包保留空間由 flex-1/min-w-0 保證）
    'flex-1',
    'min-w-0',

    // ✅ 手機靠左；中螢幕以上置中
    'justify-start',
    'md:justify-center',

    'flex-wrap', // 手機：多行排
    'content-start', // 多行時，讓第二行也從左邊開始
    'md:flex-nowrap', // 平板以上恢復單行
    'md:whitespace-nowrap',
    'md:overflow-visible', // 平板以上可見就好，不要自動出水平捲

    // ✅ 手機字稍微小一點
    'text-[15px]',
    'md:text-base',

    // ✅ 保留瀏海安全距（你原本就有）
    'px-[env(safe-area-inset-left,0px)]',
    'pr-[env(safe-area-inset-right,0px)]'
  );

  const links = navList.querySelectorAll('a');
  links.forEach((a) => {
    a.classList.add(
      'px-3',
      'py-2', // 觸控熱區
      'rounded-md', // 視覺聚焦區域
      'hover:bg-gray-100', // 輕度 hover
      'select-none',
      'inline-flex', // 讓按鈕以內容寬度排
      'items-center', // 垂直置中
      'md:shrink-0',
      'whitespace-nowrap'
    );
  });
}

// LOGO 主標題樣式 阿卡西圖書館
function initLogoTitle() {
  const logoTitle = document.getElementById('logoTitle');
  if (!logoTitle) return;
  logoTitle.classList.add(
    'text-xl', // 小螢幕字體大小
    'md:text-2xl', // 中螢幕以上放大字體
    'font-bold', // 粗體
    'text-gray-800', // 深灰色文字
    'transition' // 加入過渡動畫（hover 時更順滑）
  );
}

// LOGO 副標題樣式 Akashic Library
function initlogoSubtitle() {
  const logoSubtitle = document.getElementById('logoSubtitle');
  if (!logoSubtitle) return;
  logoSubtitle.classList.add(
    'text-sm', // 小字體
    'md:text-base', // 螢幕變大時稍微放大
    'text-gray-600' // 淺灰色文字
  );
}

//課程
function initNavCourseLink() {
  const courseLink = document.getElementById('courseLink');
  if (!courseLink) return;
  courseLink.classList.add(
    'hover:text-blue-600', // 滑鼠移過去變藍色
    'transition' // 動畫平滑過渡
  );
}
// 白皮書
function initNavWhitepaperLink() {
  const whitepaperLink = document.getElementById('whitepaperLink');
  if (!whitepaperLink) return;
  whitepaperLink.classList.add('hover:text-blue-600', 'transition');
}

// 🟦 錢包區塊容器：排版設定
function initwalletSection() {
  const walletSection = document.getElementById('wallet-section');
  if (!walletSection) return;
  walletSection.classList.add(
    'flex',
    'items-center',
    'gap-3',
    'shrink-0',
    'flex-none',
    'ml-auto',
    // 桌/手機右側退讓
    'mr-3',
    'md:mr-6',
    // iOS 瀏海/手勢安全區
    'pr-[env(safe-area-inset-right,0px)]',
    'max-w-full', // 錢包區在任何情況都不超過容器寬
    'overflow-hidden',
    'max-sm:max-w-[48%]' // 真的太窄時，內部元素以裁切收尾，不去撐整個頁面
  );
}

// 🔵 連接錢包按鈕：藍色風格＋隱藏預設
function initconnectWalletButton() {
  const connectWalletButton = document.getElementById('connectWalletButton');
  if (!connectWalletButton) return;
  connectWalletButton.classList.add(
    'px-4',
    'py-2',
    'bg-blue-600',
    'text-white',
    'rounded',
    'hover:bg-blue-700',
    'transition',
    'hidden', // 預設隱藏（由 JS 控制顯示）
    'min-h-11',
    'min-w-11' // 44px ≈ Apple 建議的最小點擊區
  );
}
// 👤 我的頁面按鈕：隱藏＋樣式
function initprofilebutton() {
  console.log('✅ initprofilebutton 被執行');
  const profileButton = document.getElementById('profileButton');
  if (!profileButton) return;
  profileButton.classList.add(
    'text-gray-800',
    'hover:text-blue-600',
    'transition',
    'hidden' // 預設隱藏
  );
}
// 🧑 使用者暱稱區塊
function inituserNickname() {
  const userNickname = document.getElementById('userNickname');
  if (!userNickname) return;
  userNickname.classList.add(
    'text-gray-600',
    'font-medium',
    'hidden' // 預設隱藏
  );
}

// 🟨 個人頁面按鈕（預設顯示，但可用 JS 隱藏）
function inituserPageBtn() {
  const userPageBtn = document.getElementById('userPageBtn');
  if (!userPageBtn) return;
  userPageBtn.classList.add(
    'px-2',
    'py-1',
    'border',
    'rounded',
    'text-gray-700',
    'hover:bg-gray-100',
    'transition',
    'hidden'
  );
}
(function injectNoScrollbarCSS() {
  if (document.getElementById('akc-no-scrollbar-css')) return;
  const style = document.createElement('style');
  style.id = 'akc-no-scrollbar-css';
  style.textContent = `
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `;
  document.head.appendChild(style);
})();

//  樣式設定
function initHeaderStyles() {
  initHeaderStyle(); // ✅ 呼叫 header 導覽列整體
  initBodyStyle(); // ✅ 呼叫 body 樣式初始化
}
//  LOGO 區塊
function initLogoStyles() {
  initlogoContainer(); // LOGO 包裝盒
  initLogoTitle(); // LOGO 主標題樣式 阿卡西圖書館
  initlogoSubtitle(); // LOGO 副標題樣式 Akashic Library
}

// 導航欄項目
function initNavbarItems() {
  initNavList(); // ✅ 導覽列的整體項目容器 <ul>
  initNavCourseLink(); // ✅ 課程按鈕連結 <li><a>
  initNavWhitepaperLink(); // ✅ 白皮書按鈕連結 <li><a>
}

// 錢包與用戶控制區
function initUserAreaStyles() {
  initwalletSection(); // 🟦 錢包區塊容器：排版設定
  initconnectWalletButton(); // 🔵 連接錢包按鈕：藍色風格＋隱藏預設
  initprofilebutton(); // 👤 我的頁面按鈕：隱藏＋樣式
  inituserNickname(); // 🧑 使用者暱稱區塊
  inituserPageBtn(); // 🟨 個人頁面按鈕（預設顯示，但可用 JS 隱藏）
}

// 導航欄樣式
function initNavbarStyles() {
  initHeaderStyles(); //  樣式設定
  initUserAreaStyles(); // 錢包與用戶控制區
  initNavbarItems(); // 導航欄項目
  initLogoStyles(); //  LOGO 區塊
}

document.addEventListener('DOMContentLoaded', () => {
  initNavbarStyles();
  initFloatingNavStyle();
  initMainSpacing();
});

// =========================
// 懸浮導覽條：風格對齊（與 header 同調）
// =========================
function initFloatingNavStyle() {
  // 若稍後才被 navbar.js 注入，這裡用 MutationObserver 等到它出現
  const APPLY = () => {
    const bar = document.getElementById('akc-float-nav');
    if (!bar || bar.__AKC_FLOAT_STYLED__) return;
    bar.__AKC_FLOAT_STYLED__ = true;

    // 1) 容器：固定在底部，預留 iOS 瀏海安全區
    bar.className = 'fixed inset-x-3 z-50 pointer-events-none';
    // 以 inline style 安全處理 safe-area（MDN: safe-area-inset-*）
    // 參考：MDN CSS env() 與 safe-area 變數
    bar.style.bottom = 'calc(env(safe-area-inset-bottom, 0px) + 12px)';

    // 2) 內層包裝（可點）
    const wrap = bar.querySelector('#akc-float-wrap');
    if (wrap) {
      // ✅ 強制與 Navbar 同套白系：就算 html 有 .dark 也維持白底灰邊
      wrap.className = [
        'pointer-events-auto',
        'flex justify-center items-center gap-2',
        'p-2 rounded-xl shadow-sm',
        'bg-white border border-gray-300 text-gray-800',
        'dark:bg-white dark:border-gray-300 dark:text-gray-800',
        'backdrop-blur-sm',
      ].join(' ');
    }

    // 3) 元件樣式：按鈕 / 連結的共用基礎
    const baseBtn =
      'px-3 py-1.5 rounded-lg border text-sm transition focus:outline-none focus:ring font-sans';
    const ghostBtn =
      baseBtn + ' border-gray-300 text-gray-700 hover:bg-gray-100';
    const linkBtn =
      'px-3 py-1.5 rounded-lg text-sm text-gray-700 hover:text-blue-600 transition';
    const solidPrimary =
      'px-3 py-1.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition';

    const topBtn = bar.querySelector('#akc-float-top');
    if (topBtn) topBtn.className = ghostBtn;

    const prof = bar.querySelector('#akc-float-prof');
    if (prof) prof.className = linkBtn; // 與主導覽連結同調（hover 藍）

    const wallet = bar.querySelector('#akc-float-wallet');
    const applyWalletStyle = () => {
      if (!wallet) return;
      // 與 navbar-style 的 connectWalletButton 藍色主按鈕一致
      if (wallet.dataset.wallet === 'connect') wallet.className = solidPrimary;
      else wallet.className = ghostBtn; // disconnect 用淺灰邊避免誤觸
    };

    try {
      if (window.matchMedia('(max-width: 1024px)').matches) {
        (document.querySelector('main') || document.body).style.paddingBottom =
          'calc(76px + env(safe-area-inset-bottom, 0px))';
      }
    } catch {}
    applyWalletStyle();

    // 狀態同步：錢包連線變更時更新樣式（沿用事件匯流）
    AKC?.bus?.on('wallet:connected', applyWalletStyle);
    AKC?.bus?.on('wallet:disconnected', applyWalletStyle);
  };

  // 立即嘗試一次
  APPLY();
  // 若當下不存在，監聽 DOM 新增
  const mo = new MutationObserver(() => APPLY());
  mo.observe(document.body, { childList: true, subtree: true });
  window.__AKC_APPLY_FLOAT_STYLE__ = APPLY;
}
