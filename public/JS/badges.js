// public/JS/badges.js  — v0.1.0 (from-scratch, AKC 專用骨架)
(function () {
  // --- 命名空間與安全護欄 ---
  const AKC = (window.AKC = window.AKC || {});
  const bus = (AKC.bus = AKC.bus || {
    _e: {},
    on(t, f) {
      (this._e[t] = this._e[t] || []).push(f);
    },
    emit(t, p) {
      (this._e[t] || []).forEach((f) => {
        try {
          f(p);
        } catch {}
      });
    },
  });
  AKC.badges = AKC.badges || {};
  const NS = AKC.badges;

  // --- 內部狀態 ---
  const STORE_KEY = (addr) => `AKC_BADGES_${(addr || '').toLowerCase()}`;
  const getAddr = () =>
    (sessionStorage.getItem('walletAddress') || '').toLowerCase();
  const hasDB = () => !!window.db;

  // 以 Set 儲存已獲得的 badge id（避免重複）
  let earned = new Set();

  function loadLocal(addr) {
    try {
      const raw = localStorage.getItem(STORE_KEY(addr));
      earned = new Set(raw ? JSON.parse(raw) : []);
    } catch {
      earned = new Set();
    }
  }
  function saveLocal(addr) {
    try {
      localStorage.setItem(STORE_KEY(addr), JSON.stringify([...earned]));
    } catch {}
  }

  // --- UI：把徽章畫出來（非侵入，找 #badgeTray 或 [data-badge-tray]） ---
  function renderTray() {
    const host =
      document.querySelector('#badgeTray') ||
      document.querySelector('[data-badge-tray]');
    if (!host) return;
    const list = [...earned];
    if (!list.length) {
      host.innerHTML = '<div class="text-xs text-gray-500">尚未獲得徽章</div>';
      return;
    }
    host.innerHTML = list
      .map((id) => {
        const meta = BADGE_META[id] || {};
        return `
          <div class="inline-flex items-center gap-1 px-2 py-1 mr-2 mb-2
                      rounded-full border text-xs">
            <span>${meta.icon || '🏷️'}</span>
            <span>${meta.title || id}</span>
          </div>`;
      })
      .join('');
  }

  // --- 徽章定義（可日後抽出配置） ---
  const BADGE_META = {
    'creator:first-course': { icon: '🧱', title: '首次建立課程' },
    'publisher:first': { icon: '🚀', title: '首次發佈課程' },
    'video:first-ready': { icon: '🎬', title: '上傳完成第一支影片' },
    'writer:first-article': { icon: '✍️', title: '建立第一篇文章單元' },
    'points:10': { icon: '⭐', title: '積分達 10' },
    'points:50': { icon: '🌟', title: '積分達 50' },
  };

  // --- 封裝：對外 API ---
  NS.list = () => [...earned];

  // 手動授予（必要時可程式觸發）
  NS.award = async function award(id, meta = {}) {
    if (!id || earned.has(id)) return false;
    earned.add(id);

    // 雲端儲存（有 Firestore 才寫；沒有就跳過）
    const addr = getAddr();
    if (hasDB() && addr) {
      try {
        const ref = window.db
          .collection('users')
          .doc(addr)
          .collection('badges')
          .doc(id);
        await ref.set({
          title: meta.title || BADGE_META[id]?.title || id,
          icon: meta.icon || BADGE_META[id]?.icon || '🏷️',
          awardedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        });
      } catch {}
    }
    saveLocal(addr);
    renderTray();
    bus.emit('badges:awarded', { id, meta });
    return true;
  };

  // --- 規則判斷（只靠事件 + 輕量本地統計，不碰你現有流程） ---
  let _localPointsTotal = 0; // 樂觀累積（後端有 hydrate 會覆蓋）

  function maybeAwardByEvent(e) {
    const type = String(e?.type || '');
    // 類型觸發
    if (type === 'course:create') NS.award('creator:first-course');
    if (type === 'course:publish') NS.award('publisher:first');
    if (type === 'lesson:video:ready') NS.award('video:first-ready');
    if (type === 'lesson:article:create') NS.award('writer:first-article');

    // 積分門檻（兩級：10 / 50）
    const inc = Number(e?.amount) || 0;
    if (Number.isFinite(inc) && inc > 0) {
      _localPointsTotal += inc;
      if (_localPointsTotal >= 10) NS.award('points:10');
      if (_localPointsTotal >= 50) NS.award('points:50');
    }
  }

  // 若後端回傳權威 total（points:hydrate），就覆蓋本地統計
  bus.on('points:hydrate', (p) => {
    if (typeof p?.total === 'number') {
      _localPointsTotal = p.total;
      if (_localPointsTotal >= 10) NS.award('points:10');
      if (_localPointsTotal >= 50) NS.award('points:50');
    }
  });

  // 監聽你現有的 points 事件（upload.js/points.js 已發）
  bus.on('points:updated', maybeAwardByEvent);
  bus.on('points:awarded', maybeAwardByEvent);

  // --- 啟動：讀取/渲染 ---
  window.addEventListener('DOMContentLoaded', () => {
    loadLocal(getAddr());
    renderTray();
  });
})();
