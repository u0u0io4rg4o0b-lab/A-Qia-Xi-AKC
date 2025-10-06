// course-view.js - 課程播放邏輯（新版）

// === 新增：播放狀態與偏好 ===
window.currentLessonIndex = -1;
window.autoPlayNext = true; // 可做成 UI 偏好
window._videoEndedHandler = null;

// 全局暫存課綱與進度監聽器
window.lessons = [];
window._lessonProgressHandler = null;
window.courseAccess = 'free';
window.coverVideoURL = '';

// === Up Next 覆蓋層/計時器握把（新增）===
window._upNext = { timer: null, el: null };
// === 進度 flush 單例旗標（新增） ===
window._progressFlush = null; // 指向當前單元的 flush 函式
window._progressListenersBound = false; // 全域監聽是否已綁

// === 進度復原策略（新增）===
// 若前次觀看進度 >= 98%（或距離結尾 < 2 秒），視為已完成→下次從 0 開始
window.resumePolicy = {
  thresholdPct: 98,
  minTailSeconds: 2,
};

// === 平台存取策略（新增） ===
// 若為 true，未登入使用者不可播放任何影片（包含封面），但仍可閱讀課程介紹文本。
// 改為 false：預設允許未登入使用者瀏覽封面與開放單元，登入後可儲存進度。
window.REQUIRE_SIGNIN_TO_VIEW = false;

// 簡化：以 sessionStorage 是否有 address 判斷登入
function isSignedIn() {
  return !!sessionStorage.getItem('walletAddress');
}

// 共用：顯示登入/持有 NFT 提醒（非阻斷、無互動按鈕）
// 此版本不再插入覆蓋層，而是透過 toastAuthHint 友善提示後自動消失。
function ensureAuthGate(why = '請先登入') {
  toastAuthHint(why);
  return null;
}
function removeAuthGate() {
  // 移除覆蓋層功能已取消，故此函式僅保留以維持 API 相容。
}

// === 偏好旗標（新增）===
window.SHOW_START_CTA = false; // 關閉右下角「開始第一單元」

function toastCodecHint() {
  // 極簡提示（可改成你慣用的 Toast 元件）
  let t = document.getElementById('codecHint');
  if (!t) {
    t = document.createElement('div');
    t.id = 'codecHint';
    t.className =
      'fixed bottom-4 right-4 max-w-sm bg-black text-white/90 text-sm rounded px-3 py-2 shadow';
    document.body.appendChild(t);
  }
  t.innerHTML =
    '偵測到影片可能是 .mov / 非 H.264 或 metadata 為 video/quicktime。建議轉成 MP4 (H.264 + AAC) 並將 Storage 的 contentType 設為 <code>video/mp4</code>。';
  setTimeout(() => t.remove(), 6000);
}
// 友善登入提醒（短暫、自動消失，不阻斷播放）
function toastSigninHint() {
  let t = document.getElementById('signinHint');
  if (!t) {
    t = document.createElement('div');
    t.id = 'signinHint';
    t.setAttribute('role', 'status'); // 無打斷式通告
    t.className =
      'fixed bottom-4 left-1/2 -translate-x-1/2 max-w-md bg-black text-white/90 text-sm rounded px-3 py-2 shadow';
    document.body.appendChild(t);
  }
  t.textContent = '請先登入以儲存進度與享完整體驗（此課程介紹可免登入預覽）';
  setTimeout(() => t.remove(), 3500); // 3.5s 自動消失（Material 建議短時提醒）
}

// 友善守門提醒：提示需登入或需持有 NFT 方可觀看。顯示於畫面中央，短暫自動消失。
function toastAuthHint(message = '請先登入以觀看此內容', duration = 3500) {
  let el = document.getElementById('authHintToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'authHintToast';
    el.setAttribute('role', 'alert');
    el.className =
      'fixed inset-0 flex items-center justify-center pointer-events-none';
    const inner = document.createElement('div');
    inner.className =
      'bg-black/80 text-white/90 text-sm rounded px-4 py-2 pointer-events-auto';
    el.appendChild(inner);
    document.body.appendChild(el);
  }
  // 更新內容
  el.firstChild.textContent = message;
  // 確保顯示
  el.style.display = 'flex';
  // 清除舊的計時器
  if (el._timerId) clearTimeout(el._timerId);
  // 隱藏與移除（使用 display:none 保留 DOM，提高效能）
  el._timerId = setTimeout(() => {
    el.style.display = 'none';
  }, duration);
}

/**
 * 初始化頁面：載入課程基本資訊、存取權與課綱。
 */
window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const courseId = params.get('courseId');
  const videoEl = document.getElementById('videoPlayer');

  if (!courseId) {
    const descEl = document.getElementById('description');
    if (descEl) descEl.textContent = '找不到課程 ID';
    const videoEl = document.getElementById('videoPlayer');
    if (videoEl) videoEl.classList.add('hidden'); // 沒有 courseId → 避免黑框
    toastAuthHint('找不到課程 ID');
    return;
  }

  try {
    // 抓取課程主檔案
    const snap = await window.db.collection('courses').doc(courseId).get();
    if (!snap.exists) {
      document.getElementById('title').textContent = '找不到課程';
      document.getElementById('description').textContent =
        '這個課程可能已被移除。';
      console.warn('[course-view] doc not found:', courseId);
      return;
    }
    const data = snap.data() || {};

    // 紀錄存取方式，供守門檢查
    window.courseAccess = data.access || 'free';

    // 填寫標題與簡介
    document.getElementById('title').textContent = data.title || '未命名課程';
    document.getElementById('description').textContent =
      data.description || '（無描述）';

    // 抓取封面影片 URL（若有）
    let url = data.downloadURL || '';
    if (!url && data.videoPath) {
      try {
        url = await window.storage.ref(data.videoPath).getDownloadURL();
      } catch (e) {
        console.warn('[course-view] getDownloadURL failed:', e);
      }
    }
    window.coverVideoURL = url;

    if (url) {
      videoEl.dataset.src = url;
      videoEl.src = url;

      videoEl.classList.remove('hidden'); // ★有封面→顯示播放器
      watchDecodeHealth(videoEl, 'cover');
      window.AKC = window.AKC || {};
      window.AKC.videoSrc = url;
      checkVideoDecodable(videoEl, { url, label: 'cover' });
    } else {
      const poster = data.posterURL || data.coverURL || '';
      if (poster) videoEl.poster = poster;
      videoEl.removeAttribute('src'); // ★清空來源，避免黑框殘留
      videoEl.load(); // ★重置媒體狀態
      videoEl.classList.add('hidden'); // ★沒封面→隱藏播放器
    }

    // 渲染課綱
    await renderLessonsOutline(courseId);
  } catch (err) {
    console.warn('[course-view] init failed:', {
      code: err?.code,
      message: err?.message,
      err,
    });
    const msgEl = document.getElementById('description');
    // 若是 Firestore 權限問題，改為友善提示（不彈窗）
    if (
      err &&
      (err.code === 'permission-denied' || err.code === 'failed-precondition')
    ) {
      // 畫面內說明
      if (msgEl)
        msgEl.textContent =
          '此課程需要登入或尚未公開，請先透過上方「連接錢包」登入再試。';
      // Toast 提醒
      toastAuthHint('需要登入或尚未公開；請從導覽列「連接錢包」登入後再試');
      // 視覺上保留播放器區塊（若已渲染），但不播放
    } else {
      if (msgEl) msgEl.textContent = '載入課程資料遇到問題，請稍後再試。';
      toastAuthHint('載入課程資料遇到問題，請稍後再試');
    }
    // 不用 alert；避免打斷使用者操作
  }

  // （可選）保底排序，避免缺 position 的亂序
  // 保底排序...
  window.lessons.sort((a, b) => (a.position ?? 99999) - (b.position ?? 99999));

  const firstReady = (window.lessons || []).findIndex(
    (x) => (x.status || 'ready') === 'ready'
  );

  // 只有在「真的有封面影片」時，才綁定封面播畢 → Up next
  if (firstReady >= 0 && videoEl && window.coverVideoURL) {
    const onceEnded = () => {
      showUpNextOverlay(firstReady);
      videoEl.removeEventListener('ended', onceEnded);
    };
    videoEl.addEventListener('ended', onceEnded);
  }

  // 無論是否有封面，都顯示「開始第一單元」按鈕（讓無封面也能開始）
  if (window.SHOW_START_CTA && firstReady >= 0 && videoEl) {
    let cta = document.getElementById('startFirstLesson');
    if (!cta) {
      cta = document.createElement('button');
      cta.id = 'startFirstLesson';
      cta.className =
        'absolute right-3 bottom-3 z-10 px-3 py-1 rounded bg-blue-600 text-white shadow hover:bg-blue-700';
      cta.textContent = '開始第一單元';
      document.getElementById('playerContainer')?.appendChild(cta);
    }
    cta.onclick = () => playLessonByIndex(firstReady);
  }

  // 允許 ?start=1 直接略過序章（即使沒有封面）

  const wantStart =
    params.get('start') === '1' || window.startWithFirstLesson === true;
  if (wantStart && firstReady >= 0) {
    playLessonByIndex(firstReady);
  }

  // 已移除左上角「課程介紹」按鈕，避免影響畫面呈現。

  function markActiveLesson(index) {
    const lis = document.querySelectorAll('#outlineList li');
    lis.forEach((li, i) => {
      if (Number(li.dataset.index) === index) {
        li.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50');
      } else {
        li.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50');
      }
    });
  }

  /**
   * 渲染課綱列表：顯示每個單元的標題、類型與長度。
   * @param {string} courseId
   */
  async function renderLessonsOutline(courseId) {
    const listEl = document.getElementById('outlineList');
    const container = document.getElementById('outlineContainer');
    if (!listEl || !container) return;

    try {
      const snap = await window.db
        .collection('courses')
        .doc(courseId)
        .collection('lessons')
        .orderBy('position', 'asc')
        .get();

      // 無任何單元時顯示提示
      if (snap.empty) {
        listEl.innerHTML = '<li class="text-gray-400">尚未新增任何單元</li>';
        container.classList.remove('hidden');
        return;
      }

      // 重建全局 lessons 陣列
      window.lessons = [];
      let html = '';
      let idx = 1;
      // 先放一筆固定的「課程介紹」（虛擬 index = -1）
      html += `<li class="flex justify-between items-start py-2 px-1 rounded cursor-pointer hover:bg-gray-100"
        data-id="__intro__" data-kind="intro" data-status="ready" data-index="-1">
        <div>
           <div class="font-medium">課程介紹</div>
           <div class="text-xs text-gray-500">overview</div>
         </div>
        <span class="text-xs text-gray-400">#0</span>
       </li>`;

      snap.forEach((doc) => {
        const d = doc.data();
        window.lessons.push({ id: doc.id, ...d });
        const kind = d.kind || 'video';
        const dur = d.duration ? ` · ${d.duration}s` : '';
        const disabled = d.status !== 'ready';
        html += `<li class="flex justify-between items-start py-2 px-1 rounded cursor-pointer ${
          disabled ? 'opacity-50 pointer-events-none' : 'hover:bg-gray-100'
        }"
          data-id="${doc.id}"
          data-kind="${kind}"
          data-status="${d.status || 'ready'}"
          data-index="${idx - 1}">
          <div>
            <div class="font-medium">${
              d.title || (kind === 'article' ? '文章單元' : '影片單元')
            }</div>
            <div class="text-xs text-gray-500">${kind}${dur}</div>
          </div>
          <span class="text-xs text-gray-400">#${idx++}</span>
        </li>`;
      });
      listEl.innerHTML = html;
      container.classList.remove('hidden');

      // 為每個 <li> 綁定點擊事件
      listEl.querySelectorAll('li').forEach((li) => {
        li.addEventListener('click', () => {
          const idx = Number(li.dataset.index);
          if (idx === -1) {
            showCourseIntro(); // 回到課程介紹
          } else {
            playLessonByIndex(idx, { fromUserNav: true });
          }
        });
      });
    } catch (e) {
      console.warn('[course-view] renderLessonsOutline failed:', e);
      toastAuthHint('載入課綱失敗，請稍後再試。');
    }
  }

  async function playLessonByIndex(index, opts = { fromUserNav: false }) {
    // 先做清理（避免前一課的覆蓋層/計時器殘留）
    cleanupUpNextOverlay();
    const lessons = window.lessons || [];
    if (!lessons.length || index < 0 || index >= lessons.length) return;

    window.currentLessonIndex = index;
    const lessonId = lessons[index].id;

    // 復用你現有的授權與播放邏輯：直接呼叫既有 handleLessonClick

    await handleLessonClick(lessonId, { fromUserNav: !!opts.fromUserNav });

    // 高亮目前單元 + 兩側導覽
    markActiveLesson(index);
    renderEdgeNavControls(index);

    // 綁定影片 ended → 顯示 Up Next 卡 / 自動續播
    const videoEl = document.getElementById('videoPlayer');
    if (videoEl) {
      if (window._videoEndedHandler) {
        videoEl.removeEventListener('ended', window._videoEndedHandler);
      }
      window._videoEndedHandler = () => {
        try {
          const params = new URLSearchParams(location.search);
          const courseId = params.get('courseId');
          const lesson = (window.lessons || [])[index];
          // client 端保護：同一地址/課程/單元，本次開頁僅上報一次
          const addr = (
            sessionStorage.getItem('walletAddress') || ''
          ).toLowerCase();
          const key = addr + ':' + courseId + ':' + (lesson && lesson.id);
          window.__POINTS_DEDUP__ = window.__POINTS_DEDUP__ || new Set();
          if (!window.__POINTS_DEDUP__.has(key)) {
            window.__POINTS_DEDUP__.add(key);
            // 事件匯流：供其他頁或背景邏輯使用（例如彈出徽章、更新 UI）
            AKC?.bus?.emit?.('lesson:completed', {
              courseId,
              lessonId: lesson?.id,
              kind: (lesson && (lesson.kind || 'video')) || 'video',
              ts: Date.now(),
            });
            // （可選）若已注入 awardPoints，則嘗試上報；失敗不影響 UX
            try {
              if (typeof awardPoints === 'function') {
                awardPoints({
                  type: 'lesson.completed',
                  ref: courseId + ':' + (lesson && lesson.id),
                });
              } else if (AKC?.points?.award) {
                AKC.points.award({
                  type: 'lesson.completed',
                  ref: courseId + ':' + (lesson && lesson.id),
                  amount: 1,
                });
              }
            } catch {}
          }
        } catch {}
        showUpNextOverlay(index + 1); // 下一個索引
      };
      videoEl.addEventListener('ended', window._videoEndedHandler); // 事件介面：HTMLMediaElement ended
    }
  }

  function goNext() {
    const i = window.currentLessonIndex + 1;
    if (i < window.lessons.length) playLessonByIndex(i, { fromUserNav: true });
  }
  function goPrev() {
    const i = window.currentLessonIndex - 1;
    if (i >= 0) playLessonByIndex(i, { fromUserNav: true });
  }

  /**
   * 點擊課綱單元後觸發：依類型播放影片或顯示文章。
   * 若課程屬於受保護類型，則先進行 NFT 驗證。
   * @param {string} lessonId
   */
  // 文章不追蹤進度，確保不誤寫先前單元
  window._progressFlush = null;

  async function handleLessonClick(lessonId, opts = {}) {
    // 尋找課綱資訊
    const lesson = window.lessons.find((x) => x.id === lessonId);
    if (!lesson) return;

    // 狀態檢查：尚未準備好時跳出
    if (lesson.status !== 'ready') {
      toastAuthHint('此單元尚未準備好，請稍後再試。');
      return;
    }

    // 未登入提醒：提供「建議登入」提示，但不阻斷觀看 free 或開放單元。
    const addrForHint = sessionStorage.getItem('walletAddress');
    if (!addrForHint && window.courseAccess !== 'token') {
      // 此提示僅提醒使用者登入以儲存進度，不影響播放權限
      toastSigninHint();
    }

    // 判斷是否為免費/開放單元（後台可於 lesson 上設定 isFree / access: 'free'）
    const isLessonFree =
      lesson?.isFree === true ||
      lesson?.free === true ||
      lesson?.access === 'free';

    // 未登入使用者若嘗試觀看非免費單元 → 顯示登入提醒並阻斷
    if (!isSignedIn() && !isLessonFree) {
      toastAuthHint('請先登入以觀看此單元');
      window._progressFlush = null; // 被 gate 阻斷：不追蹤
      return;
    }

    // Token 課程（access: 'token'）且非免費單元：需檢查是否持有 NFT
    if (window.courseAccess === 'token' && !isLessonFree) {
      try {
        let addr = sessionStorage.getItem('walletAddress');
        if (!addr && window.ethereum) {
          try {
            const list = await window.ethereum.request({
              method: 'eth_accounts',
            });
            addr = (list && list[0]) || window.ethereum.selectedAddress || '';
          } catch (_) {
            addr = window.ethereum?.selectedAddress || '';
          }
        }
        if (!addr) {
          toastAuthHint('請先透過上方「連接錢包」登入後再觀看此單元');
          window._progressFlush = null;
          return;
        }

        const hasNFT = await window.checkHasNFT(addr, {
          expectedChainId: window.AKC_CONFIG?.CHAIN_ID,
          requestAccounts: false,
        });

        if (!hasNFT) {
          // 不再使用 alert，改為友善提示
          toastAuthHint('您尚未持有解鎖此課程的 NFT，請先鑄造或購買後再觀看。');
          window._progressFlush = null;
          return;
        }
      } catch (err) {
        console.warn('[course-view] check NFT failed:', err);
        toastAuthHint('無法確認您的持有狀態，請稍後再試。');
        window._progressFlush = null; // 被阻斷時不追蹤

        return;
      }
    }

    const videoEl = document.getElementById('videoPlayer');
    const articleEl = document.getElementById('articleViewer');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');

    // 若有先前的 progress handler，需先移除，避免監聽重複
    if (window._lessonProgressHandler && videoEl) {
      videoEl.removeEventListener('timeupdate', window._lessonProgressHandler);
      window._lessonProgressHandler = null;
    }

    // 文章單元
    if ((lesson.kind || 'video') === 'article') {
      if (videoEl) {
        try {
          videoEl.pause();
        } catch {}
        videoEl.removeAttribute('src');
        videoEl.load();
      }
      videoEl && videoEl.classList.add('hidden');
      progressContainer && progressContainer.classList.add('hidden');
      articleEl.textContent = lesson.content || '（無內容）';
      articleEl.classList.remove('hidden');
      window._progressFlush = null;
      return;
    }

    // 影片單元
    articleEl && articleEl.classList.add('hidden');
    // 取得影片 URL：先用 downloadURL，再以 videoPath 尋找
    let url = lesson.downloadURL || '';
    if (!url && lesson.videoPath) {
      try {
        url = await window.storage.ref(lesson.videoPath).getDownloadURL();
      } catch (e) {
        console.warn('[course-view] getLessonURL failed:', e);
      }
    }
    if (!url) {
      toastAuthHint('找不到影片來源，請稍後再試或聯絡上傳者。');
      window._progressFlush = null; // 無內容：不追蹤進度，避免誤寫上一單元
      return;
    }

    // 切換影片來源並顯示播放器
    videoEl.src = url;
    videoEl.load(); // ← 新增：Safari/快切更穩定
    window.AKC = window.AKC || {};
    window.AKC.videoSrc = url; // ← 和封面時保持一致，方便其他模組取用

    videoEl.classList.remove('hidden');
    // 登入檢查已於函式開頭完成，故此處僅保證控制列可用
    videoEl.controls = true;

    watchDecodeHealth(videoEl, 'lesson');

    // 新增：章節影片健康檢查（不會中斷播放）
    checkVideoDecodable(videoEl, { url, label: 'lesson' });
    // 使用者是點章節，此為使用者手勢 → 可以嘗試自動播放
    try {
      await videoEl.play();
    } catch {
      /* 若被拒絕就保持顯示大播放鍵 */
    }

    // 設定進度追蹤
    setupLessonProgressTracking(
      new URLSearchParams(location.search).get('courseId'),
      lessonId,
      videoEl,
      opts
    );
  }

  // 顯示課程介紹（虛擬索引 -1）：回到封面影片/海報與敘述
  function showCourseIntro() {
    cleanupUpNextOverlay();
    window.currentLessonIndex = -1;
    // 介紹頁不追蹤進度
    window._progressFlush = null;

    // 高亮課綱的「課程介紹」
    const lis = document.querySelectorAll('#outlineList li');
    lis.forEach((li) => {
      if (Number(li.dataset.index) === -1)
        li.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50');
      else li.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50');
    });
    const v = document.getElementById('videoPlayer');
    const article = document.getElementById('articleViewer');
    const desc = document.getElementById('description');
    const progressContainer = document.getElementById('progressContainer');
    // 顯示課程敘述
    article?.classList.add('hidden');
    if (desc) desc.classList.remove('hidden');
    if (progressContainer) progressContainer.classList.add('hidden');
    // 依是否有封面影片決定顯示/隱藏播放器
    try {
      v.pause();
    } catch {}
    if (window.coverVideoURL) {
      v.src = window.coverVideoURL;
      v.classList.remove('hidden');
      watchDecodeHealth(v, 'cover');
    } else {
      v.removeAttribute('src');
      v.load();
      v.classList.add('hidden');
    }

    // 重新繪製左右導覽：介紹頁只有「下一個 = 第 1 單元」
    renderEdgeNavControls(-1);
  }

  function renderPrevNextCards(index) {
    const boxId = 'prevNextBox';
    let box = document.getElementById(boxId);
    if (!box) {
      box = document.createElement('div');
      box.id = boxId;
      box.className = 'mb-4 space-y-2';
      const container = document.getElementById('outlineContainer');
      container?.prepend(box);
    }
    const prev = index <= 0 ? null : window.lessons[index - 1];
    const next =
      index < 0 ? window.lessons[0] || null : window.lessons[index + 1];

    box.innerHTML = `
    ${
      prev
        ? `
      <div class="p-3 bg-white rounded shadow flex items-center justify-between">
        <div class="text-sm">
          <div class="text-gray-500">上一單元</div>
          <div class="font-medium">${prev.title || '上一單元'}</div>
        </div>
        <button class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300" data-nav="prev">上一個</button>
      </div>`
        : ''
    }

    ${
      next
        ? `
      <div class="p-3 bg-white rounded shadow flex items-center justify-between">
        <div class="text-sm">
          <div class="text-gray-500">下一單元</div>
          <div class="font-medium">${next.title || '下一單元'}</div>
        </div>
        <button class="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700" data-nav="next">下一個</button>
      </div>`
        : ''
    }
  `;
    box.querySelector('[data-nav="prev"]')?.addEventListener('click', goPrev);
    box.querySelector('[data-nav="next"]')?.addEventListener('click', goNext);
  }

  function renderEdgeNavControls(index) {
    const wrap = document.getElementById('playerContainer');
    if (!wrap) return;

    // 建容器（只建一次）
    let edge = document.getElementById('edgeNav');
    if (!edge) {
      edge = document.createElement('div');
      edge.id = 'edgeNav';
      // 容器不吃事件，只有按鈕吃（避免干擾點擊影片暫停/播放）
      edge.className =
        'absolute inset-0 flex items-center justify-between pointer-events-none';
      wrap.appendChild(edge);
    }

    // 先清空裡面（保留容器）
    edge.innerHTML = '';

    const prev = window.lessons[index - 1];
    const next = window.lessons[index + 1];

    // 工具：產生一顆邊緣大按鈕
    const mkBtn = (side, label, onTap) => {
      const btn = document.createElement('button');
      btn.className = `
      pointer-events-auto mx-2 rounded-full bg-black/40 hover:bg-black/60
      w-14 h-14 flex items-center justify-center text-white shadow
    `;
      btn.setAttribute('aria-label', label);
      btn.innerHTML =
        side === 'left'
          ? `<svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"></path></svg>`
          : `<svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="m8.59 16.59 1.41 1.41 6-6-6-6-1.41 1.41L13.17 12z"></path></svg>`;
      btn.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        onTap();
      });
      return btn;
    };

    // 左鍵（上一單元）
    const leftBox = document.createElement('div');
    leftBox.className = 'flex-1 flex items-center';
    if (prev) leftBox.appendChild(mkBtn('left', '上一單元', goPrev));
    edge.appendChild(leftBox);

    // 右鍵（下一單元）
    const rightBox = document.createElement('div');
    rightBox.className = 'flex-1 flex items-center justify-end';
    if (next) rightBox.appendChild(mkBtn('right', '下一單元', goNext));
    edge.appendChild(rightBox);
  }

  function cleanupUpNextOverlay() {
    const u = window._upNext || {};
    if (u.timer) {
      clearInterval(u.timer);
      u.timer = null;
    }
    if (u.el && u.el.parentNode) {
      u.el.remove();
    }
    u.el = null;
  }

  function showUpNextOverlay(nextIndex) {
    window.autoPlayNext = true; // 保險：每次顯示覆蓋層時都回到預設自動播放

    // 若本來就有，先清
    cleanupUpNextOverlay();
    const videoWrap = document.getElementById('playerContainer');
    const next = (window.lessons || [])[nextIndex];

    const overlayId = 'upNextOverlay';
    let ov = document.getElementById(overlayId);
    if (ov) ov.remove();

    ov = document.createElement('div');
    ov.id = overlayId;
    ov.className =
      'absolute inset-0 bg-black/70 text-white flex items-center justify-center p-6';
    let countdown = 5;
    ov.innerHTML = `
    <div class="max-w-md text-center space-y-4">
      <div class="text-lg">播放完畢</div>
      ${
        next
          ? `
        <div class="text-sm text-gray-300">即將播放下一單元</div>
        <div class="text-xl font-semibold">${next.title || '下一單元'}</div>
        <div id="upNextTimer" class="text-sm">將在 ${countdown} 秒後自動播放…</div>
        <div class="flex gap-3 justify-center">
          <button id="btnPrev" class="px-3 py-1 rounded bg-gray-500 hover:bg-gray-600">上一個</button>
          <button id="btnCancel" class="px-3 py-1 rounded bg-gray-500 hover:bg-gray-600">取消自動</button>
          <button id="btnNext" class="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700">立刻播放</button>
        </div>`
          : `<div class="text-sm text-gray-300">已是最後一單元</div>
         <div class="flex gap-3 justify-center">
           <button id="btnPrev" class="px-3 py-1 rounded bg-gray-500 hover:bg-gray-600">回上一個</button>
         </div>`
      }
    </div>`;
    videoWrap.appendChild(ov);
    // 記錄握把供 cleanupUpNextOverlay() 使用
    window._upNext.el = ov;
    window._upNext.timer = null;

    let timer = null;
    if (next && window.autoPlayNext) {
      timer = setInterval(() => {
        countdown -= 1;
        const label = document.getElementById('upNextTimer');
        if (label) label.textContent = `將在 ${countdown} 秒後自動播放…`;
        if (countdown <= 0) {
          cleanupUpNextOverlay();
          goNext();
        }
      }, 1000);
      window._upNext.timer = timer;
    }

    ov.querySelector('#btnPrev')?.addEventListener('click', () => {
      cleanupUpNextOverlay();
      goPrev();
    });
    ov.querySelector('#btnNext')?.addEventListener('click', () => {
      cleanupUpNextOverlay();
      goNext();
    });
    ov.querySelector('#btnCancel')?.addEventListener('click', () => {
      cleanupUpNextOverlay();
    });
  }
  // 支援鍵盤：← 上一、→ 下一、K 暫停/播放
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goNext();
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goPrev();
    }
    if (e.key.toLowerCase() === 'k') {
      const v = document.getElementById('videoPlayer');
      if (v && !v.classList.contains('hidden')) {
        if (v.paused) v.play();
        else v.pause();
      }
    }
  });

  // 檢查是否有畫面（避免 .mov/HEVC 只出聲無畫）
  function watchDecodeHealth(v, tag = 'video') {
    try {
      const onMeta = () => {
        const W = v.videoWidth | 0;
        const H = v.videoHeight | 0;
        if (!W || !H) {
          console.warn(
            `[video] ${tag} loadedmetadata but no dimensions -> likely unsupported codec (.mov/HEVC).`
          );
          // 可選：若頁面有 decodeHint 元素，就顯示提示
          const hint = document.getElementById('decodeHint');
          if (hint) {
            hint.textContent =
              '偵測到影片可能不相容（只有聲音無畫面）。建議轉成 MP4 (H.264 + AAC)。';
            hint.classList.remove('hidden');
          }
          if (!v.poster) {
            // 可替換成你自己的占位圖
            // v.poster = '/img/video-unsupported.png';
          }
        }
      };
      v.addEventListener('loadedmetadata', onMeta, { once: true });
    } catch (_) {}
  }

  // === 影片解碼健康檢查與提示（提升到與 watchDecodeHealth 同層） ===
  async function checkVideoDecodable(videoEl, { url, label } = {}) {
    if (!videoEl) return;
    // 等 metadata 載入或錯誤（最長等 5 秒）
    const wait = (evt) =>
      new Promise((res) => videoEl.addEventListener(evt, res, { once: true }));
    const timeout = new Promise((res) => setTimeout(res, 5000));
    await Promise.race([wait('loadedmetadata'), wait('error'), timeout]);

    // 若視訊維度為 0，通常是編碼不支援（音訊可能仍會播）
    const w = videoEl.videoWidth || 0;
    const h = videoEl.videoHeight || 0;
    if (w === 0 || h === 0) {
      console.warn('[course-view] video seems audio-only or undecodable:', {
        url,
        label,
      });
      // 友善提示（不擋播放；讓使用者/創作者知道該轉檔或改 metadata）
      toastCodecHint();
    }
  }

  function ensureBigPlay() {
    const wrap = document.getElementById('playerContainer');
    const v = document.getElementById('videoPlayer');
    if (!wrap || !v) return;

    // 防重綁：若已處理，僅同步一次顯示狀態
    if (v.dataset.bigPlayBound === '1') {
      const btn0 = document.getElementById('bigPlayButton');
      if (btn0) btn0.style.display = v.paused ? 'flex' : 'none';
      return;
    }
    v.dataset.bigPlayBound = '1';

    let isScrubbing = false;
    let _toggleGateUntil = 0;
    const withinGate = () => Date.now() < _toggleGateUntil;
    const armGate = (ms = 340) => (_toggleGateUntil = Date.now() + ms);

    wrap.classList.add('cursor-pointer');

    // 建立大播放鍵（先建立，再掛用到 btn 的事件）
    let btn = document.getElementById('bigPlayButton');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'bigPlayButton';
      btn.className = 'absolute inset-0 flex items-center justify-center';
      btn.setAttribute('aria-label', '播放 / 暫停 (K)');
      btn.innerHTML = `
      <span class="rounded-full bg-black/50 p-5">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="white" aria-hidden="true">
          <path d="M8 5v14l11-7z"></path>
        </svg>
      </span>`;
      wrap.appendChild(btn);
    }

    // 拖拉時間軸：暫時隱藏大播放鍵，結束後依狀態還原
    v.addEventListener('seeking', () => {
      isScrubbing = true;
      btn.style.display = 'none';
    });
    v.addEventListener('seeked', () => {
      isScrubbing = false;
      // 先依當下狀態決定一次
      btn.style.display = v.paused ? 'flex' : 'none';
      // 有些瀏覽器 seek 結束後才會進入 playing；再延遲複查一次
      setTimeout(() => {
        if (!v.paused) btn.style.display = 'none';
      }, 300);
      // ✅ 保險：再延遲 900ms 複查一次，處理極少數裝置未觸發 playing 的情況
      setTimeout(() => {
        if (!v.paused && btn.style.display !== 'none')
          btn.style.display = 'none';
      }, 900);
    });

    v.addEventListener('waiting', () => {
      if (!isScrubbing) btn.style.display = 'none';
    });

    // 大播放鍵只處理自身（避免冒泡到 video）
    btn.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      if (withinGate()) return;
      if (v.paused) v.play().catch(() => {});
      else v.pause();
      armGate();
    });

    // 視訊區域點擊：用 pointerup 取代 click，並避開控制列區域
    v.addEventListener('pointerup', (e) => {
      const controlBand = Math.max(48, Math.round(v.clientHeight * 0.18));
      const isOnControls =
        v.controls && e.offsetY >= v.clientHeight - controlBand;
      if (isOnControls) return;
      e.preventDefault();
      e.stopPropagation();
      if (withinGate()) return;
      if (v.paused) v.play().catch(() => {});
      else v.pause();
      armGate();
    });

    // 取消原生 click（避免 pointerup 後 click 再次觸發）
    v.addEventListener(
      'click',
      (e) => {
        const controlBand = Math.max(48, Math.round(v.clientHeight * 0.18));
        const isOnControls =
          v.controls && e.offsetY >= v.clientHeight - controlBand;
        if (isOnControls) return;
        e.preventDefault();
        e.stopPropagation();
      },
      { capture: true }
    );

    v.addEventListener(
      'pointerdown',
      (e) => {
        const controlBand = Math.max(48, Math.round(v.clientHeight * 0.18));
        const isOnControls =
          v.controls && e.offsetY >= v.clientHeight - controlBand;
        if (isOnControls) return;
        e.preventDefault();
        e.stopPropagation();
      },
      { capture: true }
    );

    // 播放／暫停後同步大播放鍵顯示
    v.addEventListener('play', () => {
      armGate();
      btn.style.display = 'none';
    });
    v.addEventListener('pause', () => {
      armGate();
      if (isScrubbing) return;
      setTimeout(() => {
        btn.style.display = 'flex';
      }, 120);
    });

    // 拖曳後若未觸發 play，playing 仍會到；在此確保自動隱藏
    v.addEventListener('playing', () => {
      if (!isScrubbing) btn.style.display = 'none';
    });
    // 保底：只要在播放中且還看到按鈕，就藏起來
    v.addEventListener('timeupdate', () => {
      if (!v.paused && btn.style.display !== 'none') btn.style.display = 'none';
    });

    // 初始顯示
    btn.style.display = v.paused ? 'flex' : 'none';
  }

  // 在 DOMContentLoaded 初始化的 try 區塊末尾呼叫：
  ensureBigPlay();

  /**
   * 初始化單元進度條，讀取/寫入 Firestore 進度。
   * @param {string} courseId
   * @param {string} lessonId
   * @param {HTMLVideoElement} videoEl
   */

  function setupLessonProgressTracking(courseId, lessonId, videoEl, opts = {}) {
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const address = sessionStorage.getItem('walletAddress');
    if (!address) {
      // 未登入則不追蹤，但仍顯示影片
      progressContainer?.classList.add('hidden');
      return;
    }
    // 顯示進度條
    progressContainer?.classList.remove('hidden');

    const progressRef = window.db
      .collection('progress')
      .doc(`${address}_${courseId}_${lessonId}`);

    // 讀取既有進度，若有則同步到 UI
    progressRef
      .get()
      .then((doc) => {
        const d = doc.data();
        if (!d || typeof d.pct !== 'number') return;

        const applyWithPolicy = () => {
          const dur = videoEl.duration;
          if (!dur || isNaN(dur) || dur === Infinity) return;

          const pct = d.pct;
          const t = (pct / 100) * dur;
          const nearEndByPct = pct >= (window.resumePolicy?.thresholdPct ?? 98);
          const nearEndByTail =
            dur - t <= (window.resumePolicy?.minTailSeconds ?? 2);
          const shouldRestart =
            !!opts?.fromUserNav || nearEndByPct || nearEndByTail;

          if (shouldRestart) {
            videoEl.currentTime = 0;
            progressBar && (progressBar.style.width = '0%');
          } else {
            videoEl.currentTime = t;
            progressBar && (progressBar.style.width = pct + '%');
          }
        };

        if (videoEl.readyState >= 1) {
          applyWithPolicy();
        } else {
          videoEl.addEventListener('loadedmetadata', applyWithPolicy, {
            once: true,
          });
        }
      })
      .catch(() => {});

    // 綁定 timeupdate 事件，寫入進度
    let _lastWriteAt = 0;
    async function writeProgressSnapshot() {
      if (
        !videoEl.duration ||
        videoEl.duration === Infinity ||
        videoEl.duration === 0
      )
        return;
      const pct = (videoEl.currentTime / videoEl.duration) * 100;
      progressBar &&
        (progressBar.style.width = Math.min(100, Math.max(0, pct)) + '%');
      try {
        await progressRef.set(
          {
            courseId,
            lessonId,
            address,
            pct,
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn('[course-view] progress update failed:', e);
      }
    }

    window._lessonProgressHandler = () => {
      const now = Date.now();
      if (now - _lastWriteAt >= 1000) {
        _lastWriteAt = now;
        // 用 idle 機會寫，降抖動；若環境不支援就直接寫
        window.requestIdleCallback
          ? requestIdleCallback(() => writeProgressSnapshot(), { timeout: 800 })
          : writeProgressSnapshot();
      }
    };
    videoEl.addEventListener('timeupdate', window._lessonProgressHandler);

    // 交給全域單例監聽呼叫當前 flush
    window._progressFlush = () => writeProgressSnapshot();
    ensureGlobalProgressFlushListeners();

    // 全域：僅綁一次的進度 flush 監聽
    function ensureGlobalProgressFlushListeners() {
      if (window._progressListenersBound) return;
      const handler = () => {
        try {
          if (typeof window._progressFlush === 'function') {
            window._progressFlush();
          }
        } catch (e) {
          console.warn('[course-view] progress flush failed:', e);
        }
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') handler();
      });
      window.addEventListener('beforeunload', handler);
      window._progressListenersBound = true;
    }
  }
});
