window.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('courseList');
  if (!container) {
    console.warn('⚠️ 沒有找到 #courseList 元素，可能不是課程頁！');
    return;
  }

  // Firestore 讀取使用 compat 版 db，確保已初始化
  const db = window.db;
  if (!db) {
    console.error('window.db 未就緒，略過課程載入');
    return;
  }

  // 分頁設定
  const pageSize = 8;
  let lastVisible = null;
  let loading = false;
  let moreAvailable = true;

  // 建立「載入更多」按鈕，如果頁面上沒有則自行插入
  let loadMoreBtn = document.getElementById('loadMoreCourses');
  if (!loadMoreBtn) {
    loadMoreBtn = document.createElement('button');
    loadMoreBtn.id = 'loadMoreCourses';
    loadMoreBtn.textContent = '載入更多';
    loadMoreBtn.className =
      'mt-4 px-4 py-2 text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition';
    // 預設隱藏，首次載入後依是否還有資料決定顯示
    loadMoreBtn.style.display = 'none';
    container.after(loadMoreBtn);
  }

  loadMoreBtn.addEventListener('click', async () => {
    await loadCourses();
  });

  // 轉義工具：將 &<>"' 轉為 HTML 實體
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 創建單一課程卡片
  function createCourseCard(docId, data) {
    const title = escapeHtml(data.title);
    const description = escapeHtml(data.description);
    const category = escapeHtml(data.category);
    const nickname = escapeHtml(data.nickname || '');
    const type = String(data.type || '').toLowerCase();
    const access = String(data.access || 'free').toLowerCase();
    const priceAKC = Number(data.priceAKC || 0);

    // 課程類型標籤文字
    let typeLabel = '';
    switch (type) {
      case 'video':
        typeLabel = '影片課程';
        break;
      case 'article':
        typeLabel = '文章課程';
        break;
      case 'live':
        typeLabel = '直播課程';
        break;
      case 'mixed':
        typeLabel = '混合課程';
        break;
      default:
        typeLabel = '';
    }

    // 存取標籤文字與樣式
    const locked = access === 'token';
    const accessLabel = locked ? '需要圖書證' : '免費';
    const accessClass = locked
      ? 'bg-red-50 text-red-600'
      : 'bg-green-50 text-green-600';

    // 描述文字：限制 100 字，超過則顯示「顯示更多」
    const maxLen = 100;
    const truncated = description.length > maxLen;
    const displayDesc = truncated
      ? description.slice(0, maxLen) + '...'
      : description;

    const card = document.createElement('div');
    card.className = 'course-card mb-6 w-full';

    // 卡片內使用 template literal 並套用 Tailwind 風格
    card.innerHTML = `
      <div class="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition relative">
        <div class="flex flex-wrap items-center justify-between mb-2">
          <h3 class="text-xl font-bold text-blue-700">${title}</h3>
          ${
            typeLabel
              ? `<span class="text-sm font-medium text-purple-700 bg-purple-100 px-2 py-1 rounded-full">${typeLabel}</span>`
              : ''
          }
        </div>
        <p class="text-sm text-gray-500 mb-1">${nickname || ''}${
      nickname && category ? '｜' : ''
    }${category}</p>
        <p class="text-sm mb-3 inline-block ${accessClass} px-2 py-1 rounded-full">${accessLabel}${
      priceAKC > 0 ? `｜${priceAKC} AKC` : ''
    }</p>
        <p class="text-base text-gray-700 mb-3 course-desc">${
          displayDesc || '—'
        }</p>
        ${
          truncated
            ? `<a href="#" class="text-blue-500 text-sm underline course-toggle">顯示更多</a>`
            : ''
        }
        <button class="${
          locked
            ? 'bg-amber-500 hover:bg-amber-600'
            : 'bg-blue-500 hover:bg-blue-600'
        } text-white px-4 py-2 mt-4 rounded-lg transition w-full sm:w-auto">${
      locked ? '解鎖並開始' : '開始學習'
    }</button>
      </div>
    `;

    // 綁定「顯示更多」展開/收起事件
    const toggle = card.querySelector('.course-toggle');
    if (toggle) {
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        const descEl = card.querySelector('.course-desc');
        if (!descEl) return;
        if (toggle.dataset.expanded === '1') {
          // 收起
          descEl.textContent = displayDesc;
          toggle.textContent = '顯示更多';
          toggle.dataset.expanded = '0';
        } else {
          // 展開
          descEl.textContent = description;
          toggle.textContent = '收起';
          toggle.dataset.expanded = '1';
        }
      });
    }

    // 按鈕點擊事件：依 access 判斷是否需 NFT 驗證
    const btn = card.querySelector('button');
    if (btn) {
      btn.addEventListener('click', () => {
        handleViewCourse(docId, access || 'free');
      });
    }

    return card;
  }

  async function loadCourses() {
    if (loading || !moreAvailable) return;
    loading = true;

    // 按鈕進入 loading 狀態
    if (loadMoreBtn) {
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = '載入中…';
    }

    // 統一渲染流程（snapshot → 渲染卡片、更新分頁狀態）
    const renderSnap = (snapshot, { filterPublic = false } = {}) => {
      // 無資料：收尾 & 顯示「沒有公開課程」
      if (!snapshot || snapshot.empty) {
        moreAvailable = false;
        if (loadMoreBtn) {
          loadMoreBtn.style.display = 'none';
          loadMoreBtn.disabled = false;
          loadMoreBtn.textContent = '載入更多';
        }
        if (!container.querySelector('.course-card')) {
          const p = document.createElement('p');
          p.className = 'text-gray-500';
          p.textContent = '目前沒有公開課程';
          container.appendChild(p);
        }
        loading = false;
        return;
      }

      // === 貢獻課程（上傳）入口：先檢查登入，再決定是否導向 upload.html ===
      (function attachUploadRedirectGuard() {
        const form = document.getElementById('uploadRedirectForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
          e.preventDefault(); // 先攔住，不要直接衝到 upload.html

          let addr = sessionStorage.getItem('walletAddress');
          if (!addr) {
            // 單純提示一次，讓使用者自己決定要不要去登入
            window.AKC?.ui?.toast?.('請先完成登入，再按一次送出', 'info');
            return; // ← 直接結束，不自動叫任何登入/簽名
          }

          // 3) 已登入 → 這時才安全地前往後台
          window.location.href = 'upload.html';
        });
      })();

      // 更新分頁指標
      lastVisible = snapshot.docs[snapshot.docs.length - 1];

      // 渲染卡片
      const frag = document.createDocumentFragment();
      snapshot.forEach((doc) => {
        const data = doc.data() || {};

        // 回退模式才需本機過濾公開；同時排除軟刪除
        if (filterPublic) {
          const v = String(data.visibility || '').toLowerCase();
          if (v !== 'public') return;
        }
        if (String(data.status || '') === 'deleted' || data.deletedAt) return;

        frag.appendChild(createCourseCard(doc.id, data));
      });
      container.appendChild(frag);

      // 還有更多？
      moreAvailable = snapshot.size === pageSize;

      // 更新按鈕
      if (loadMoreBtn) {
        loadMoreBtn.style.display = moreAvailable ? '' : 'none';
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = moreAvailable ? '載入更多' : '已無更多';
      }

      loading = false;
    };

    // --- 主查詢：visibility == 'public' + createdAt desc（需要複合索引） ---
    try {
      let q = db
        .collection('courses')
        .where('visibility', '==', 'public')
        .orderBy('createdAt', 'desc');

      if (lastVisible) q = q.startAfter(lastVisible);
      q = q.limit(pageSize);

      const snap = await q.get();
      renderSnap(snap); // 直接渲染（不用再過濾）
      return;
    } catch (err) {
      // 索引缺失時會丟 failed-precondition，退到本機過濾
      console.warn(
        '[course] primary query failed, fallback to client filter:',
        err
      );
    }

    // --- 回退 1：只 orderBy createdAt，再前端過濾 public ---
    try {
      let q = db.collection('courses').orderBy('createdAt', 'desc');
      if (lastVisible) q = q.startAfter(lastVisible);
      q = q.limit(pageSize);

      const snap = await q.get();
      renderSnap(snap, { filterPublic: true });
      return;
    } catch (err2) {
      console.warn(
        '[course] fallback createdAt failed, fallback to __name__',
        err2
      );
    }

    // --- 回退 2：orderBy('__name__')，再前端過濾 public ---
    try {
      let q = db.collection('courses').orderBy('__name__');
      if (lastVisible) q = q.startAfter(lastVisible);
      q = q.limit(pageSize);

      const snap = await q.get();
      renderSnap(snap, { filterPublic: true });
    } catch (err3) {
      console.error('[course] all queries failed:', err3);
      loading = false;
      if (loadMoreBtn) {
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = '載入更多';
      }
    }
  }

  // 初次載入
  await loadCourses();

  // 依 access 判斷是否為受保護課程；access 為 'token' 時需驗證 NFT
  async function handleViewCourse(courseId, access) {
    try {
      const isLocked = String(access).toLowerCase() === 'token';
      // 若無需驗證直接跳
      if (!isLocked) {
        return viewCourse(courseId);
      }
      // 要求錢包連線（stay: true 讓 UI 和連接流程在背景進行）
      await window.AKC?.wallet?.connect?.({ stay: true });
      const address = sessionStorage.getItem('walletAddress');
      if (!address) {
        alert('請先連接錢包再觀看課程。');
        return;
      }
      // 使用預期鏈別驗證 NFT
      const has = await window.checkHasNFT?.(address, {
        requestAccounts: false, // 讓 R3 走唯讀 RPC，不再彈 MM
        expectedChainId: window.AKC_CONFIG?.CHAIN_ID,
      });
      if (has) {
        return viewCourse(courseId);
      }
      // 無 NFT，引導鑄造
      const goMint = confirm(
        '此為受保護課程，需要圖書證 NFT。\n要前往鑄造嗎？'
      );
      if (goMint) {
        window.location.href = 'mint-pass.html';
      }
    } catch (err) {
      console.error('[course] guarded view error:', err);
      alert('驗證過程發生問題，請稍後再試。');
    }
  }

  function viewCourse(courseId) {
    window.location.href = `course-view.html?courseId=${courseId}`;
  }
});
