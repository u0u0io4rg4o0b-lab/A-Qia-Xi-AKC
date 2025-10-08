// ✅ upload.js - 負責課程資料與影片上傳功能

window.db;
window.storage;

// ====== 全局狀態與進度條工具 ======
// 避免重複提交：當正在提交主表單時，__submitting 為 true
let __submitting = false;
// 聚合所有課綱檔案上傳的進度，鍵為 lessonId，值為 {x: bytesTransferred, t: totalBytes}
const __taskStats = new Map();

// 插入或更新主影片上傳進度條
function ensureCourseProgress() {
  if (document.getElementById('courseProgress')) return;
  const host =
    document.getElementById('panelUpload') ||
    document.getElementById('uploadForm') ||
    document.body;
  const wrap = document.createElement('div');
  wrap.id = 'courseProgress';
  wrap.className = 'mt-3 text-sm text-gray-600';
  wrap.innerHTML = `
    <div class="h-2 bg-gray-200 rounded overflow-hidden">
      <div class="h-2 bg-blue-600" style="width:0%"></div>
    </div>
    <div class="mt-1"><span class="akc-course-progress-text">準備上傳…</span></div>`;
  host.prepend(wrap);
}

function updateCourseProgress(pct, status, errMsg) {
  const root = document.getElementById('courseProgress');
  if (!root) return;
  const bar = root.querySelector('div > div');
  const text = root.querySelector('.akc-course-progress-text');
  if (status === 'uploading') {
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = `主影片上傳中… ${pct}%`;
  } else if (status === 'error') {
    if (text) text.textContent = `上傳失敗：${errMsg || ''}`;
  } else if (status === 'ready') {
    if (bar) bar.style.width = '100%';
    if (text) text.textContent = '主影片完成';
    // 完成後延遲移除
    setTimeout(() => root.remove(), 1500);
  }
}

// 插入課綱總進度條
function ensureGlobalProgress() {
  if (document.getElementById('globalProgress')) return;
  const host =
    document.getElementById('panelCurriculum') ||
    document.getElementById('lessonList') ||
    document.body;
  const el = document.createElement('div');
  el.id = 'globalProgress';
  el.className = 'mb-3 p-3 bg-white border rounded';
  el.innerHTML = `
    <div class="text-sm text-gray-700 mb-1">課綱上傳總進度</div>
    <div class="h-2 bg-gray-200 rounded overflow-hidden"><div class="h-2 bg-amber-500" style="width:0%"></div></div>
    <div class="mt-1 text-xs text-gray-500"><span class="gp-text">等待中…</span></div>`;
  host.prepend(el);
}

function updateGlobalProgress() {
  const el = document.getElementById('globalProgress');
  if (!el) return;
  let x = 0;
  let t = 0;
  __taskStats.forEach((v) => {
    x += v?.x || 0;
    t += v?.t || 0;
  });
  const pct = t > 0 ? Math.max(0, Math.min(100, Math.round((x / t) * 100))) : 0;
  const bar = el.querySelector('div > div');
  if (bar) bar.style.width = pct + '%';
  const txt = el.querySelector('.gp-text');
  if (txt)
    txt.textContent =
      t > 0 ? `合計 ${pct}%（${__taskStats.size} 項）` : '無進行中的上傳';
  if (t > 0 && pct === 100) {
    setTimeout(() => el.remove(), 1200);
  }
}

// 🎯 統一從 sessionStorage 取出錢包地址與 UID，避免重複邏輯
function getAddressAndUID() {
  return {
    address: sessionStorage.getItem('walletAddress') || '未登入',
    uid: sessionStorage.getItem('uid') || '未登入',
  };
}

// 📤 上傳課程的主函式（本檔已自綁 #uploadForm 的 submit 事件）

async function handleUploadCourse(event) {
  event.preventDefault();
  // 若正在提交，直接忽略（避免重複）
  if (__submitting) return;
  if (!window.db || !window.storage || !window.firebase) {
    alert('初始化未完成（db/storage 未就緒），請稍後再試或重整頁面。');
    return;
  }

  const title = document.getElementById('title')?.value?.trim();
  const category = document.getElementById('category')?.value?.trim();
  const type = document.getElementById('type')?.value?.trim();
  const description = document.getElementById('description')?.value?.trim();
  const fileInput = document.getElementById('uploadFile');
  const access = (
    document.querySelector('input[name="access"]:checked')?.value || 'free'
  ).trim();
  const priceAKCInput = document.getElementById('priceAKC');
  const priceAKC = access === 'token' ? Number(priceAKCInput?.value || 0) : 0;
  const { address, uid } = getAddressAndUID();
  const submitBtn = document.querySelector('#uploadForm button[type="submit"]');
  if (
    !title ||
    !category ||
    !type ||
    !description ||
    (access === 'token' && (!priceAKC || priceAKC <= 0))
  ) {
    alert('❗請填寫所有欄位後再提交');
    return;
  }
  if (address === '未登入') {
    alert('請先連接錢包後再上傳課程');
    return;
  }
  submitBtn && (submitBtn.disabled = true);
  __submitting = true;
  try {
    // 判斷是新增還是編輯
    const existingCid = getQueryParam('courseId');
    let docRef;
    let courseId = existingCid || '';

    // 構造基本資料
    const baseData = {
      title,
      category,
      type,
      description,
      uploader: address.toLowerCase(),
      uid,
      access,
      priceAKC,
      status: 'draft',
      visibility: 'private',
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (!existingCid) {
      baseData.createdAt =
        window.firebase.firestore.FieldValue.serverTimestamp();
      docRef = await window.db.collection('courses').add(baseData);
      courseId = docRef.id;
    } else {
      docRef = window.db.collection('courses').doc(existingCid);
      await docRef.update(baseData);
    }

    // 如有檔案→上傳到 Storage 並顯示進度；完成後清空輸入框並鎖定預覽
    if (fileInput?.files?.length > 0) {
      const file = fileInput.files[0];
      const path = `courses/${courseId}/${file.name}`;
      const storageRef = window.storage.ref(path);
      const metadata = { contentType: file.type || 'application/octet-stream' };
      // 友善提醒：若是 .mov 或 video/quicktime，建議轉 MP4(H.264+AAC)
      try {
        const name = (file?.name || '').toLowerCase();
        if (file?.type === 'video/quicktime' || name.endsWith('.mov')) {
          const goOn = window.confirm(
            '偵測到 .mov / video/quicktime。這類檔案在部分裝置可能只有聲音沒有畫面。\n建議先轉成 MP4 (H.264+AAC)。仍要繼續上傳嗎？'
          );
          if (!goOn) {
            submitBtn && (submitBtn.disabled = false);
            __submitting = false;
            return; // 取消本次提交
          }
        }
      } catch (_) {}

      // 插入進度條
      ensureCourseProgress();
      const task = storageRef.put(file, metadata);
      task.on(
        'state_changed',
        (snap) => {
          const pct = Math.round(
            (snap.bytesTransferred / snap.totalBytes) * 100
          );
          updateCourseProgress(pct, 'uploading');
          if (submitBtn) submitBtn.textContent = `上傳中… ${pct}%`;
        },
        (err) => {
          updateCourseProgress(0, 'error', err?.message || '');
          throw err;
        },
        async () => {
          const url = await task.snapshot.ref.getDownloadURL();
          await docRef.update({
            filename: file.name,
            downloadURL: url,
            videoPath: path,
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          });
          updateCourseProgress(100, 'ready');
          // 清空檔案輸入，避免下次重傳
          try {
            if (fileInput) fileInput.value = '';
          } catch (_) {}
          // 更新預覽
          try {
            const pvVideo = document.getElementById('pvVideo');
            if (pvVideo) {
              pvVideo.src = url;
              pvVideo.classList.remove('hidden');
            }
            sessionStorage.setItem(`AKC_PV_MAIN_${courseId}`, url);
          } catch (_) {}
        }
      );
      // 等待上傳完成
      await task;
    }

    // 成功提示與跳轉/不跳轉
    if (!existingCid) {
      // ✅ Points：新建課程成功 → 發 10 分（前端樂觀；不依賴後端）
      try {
        AKC?.points?.award?.({
          type: 'course:create',
          ref: courseId,
          amount: 10,
        });
      } catch (_) {}

      alert('✅ 課程已建立！接下來你可以在同頁繼續編輯。');
      window.location.replace(`upload.html?courseId=${courseId}`);
    } else {
      alert('✅ 已儲存變更');
    }
  } catch (err) {
    console.error('❌ 上傳失敗！', err);
    alert('上傳失敗：' + (err?.message || err));
  } finally {
    submitBtn && (submitBtn.disabled = false);
    // 按鈕文案恢復
    if (submitBtn)
      submitBtn.textContent = getQueryParam('courseId')
        ? '儲存變更'
        : '✅ 確認上傳';
    __submitting = false;
  }
}

window.handleUploadCourse = handleUploadCourse;

// === 預覽卡同步（插入，約第 100 行附近） ===
(function bindPreviewSync() {
  const $ = (sel) => document.querySelector(sel);
  const titleEl = $('#title');
  const categoryEl = $('#category');
  const typeEl = $('#type');
  const descEl = $('#description');
  const priceEl = $('#priceAKC');
  const fileEl = $('#uploadFile');

  const pvTitle = $('#pvTitle');
  const pvCategory = $('#pvCategory');
  const pvType = $('#pvType');
  const pvAccess = $('#pvAccess');
  const pvPriceRow = $('#pvPriceRow');
  const pvPrice = $('#pvPrice');
  const pvVideo = $('#pvVideo');
  // 在預覽區塊的常數之後加入：
  let _pvPrevUrl = null; // 用來記錄上一個預覽 URL，切檔或清空時釋放

  function syncBasic() {
    pvTitle && (pvTitle.textContent = titleEl?.value?.trim() || '（尚未輸入）');
    pvCategory &&
      (pvCategory.textContent =
        categoryEl?.selectedOptions?.[0]?.text || '（尚未選擇）');
    pvType &&
      (pvType.textContent =
        typeEl?.selectedOptions?.[0]?.text || '（尚未選擇）');
    const access =
      document.querySelector('input[name="access"]:checked')?.value || 'free';
    pvAccess &&
      (pvAccess.textContent = access === 'token' ? '以 AKC 解鎖' : '免費');
    if (pvPriceRow) {
      pvPriceRow.classList.toggle('hidden', access !== 'token');
      if (access === 'token' && pvPrice)
        pvPrice.textContent = priceEl?.value || '—';
    }
  }

  function syncFilePreview() {
    if (!pvVideo) return;
    const f = fileEl?.files?.[0];
    if (!f) {
      if (_pvPrevUrl) {
        URL.revokeObjectURL(_pvPrevUrl);
        _pvPrevUrl = null;
      }
      pvVideo.src = '';
      pvVideo.classList.add('hidden');
      return;
    }
    // 僅做本地預覽（不上傳）
    const url = URL.createObjectURL(f);
    if (_pvPrevUrl) {
      URL.revokeObjectURL(_pvPrevUrl);
    }
    _pvPrevUrl = url;
    // 以 video 做保守預覽
    pvVideo.src = url;
    pvVideo.classList.remove('hidden');
  }

  ['input', 'change'].forEach((ev) => {
    titleEl?.addEventListener(ev, syncBasic);
    categoryEl?.addEventListener(ev, syncBasic);
    typeEl?.addEventListener(ev, syncBasic);
    priceEl?.addEventListener(ev, syncBasic);
    document
      .querySelectorAll('input[name="access"]')
      .forEach((r) => r.addEventListener('change', syncBasic));
    fileEl?.addEventListener('change', syncFilePreview);
  });

  // 首次進頁同步一次
  syncBasic();
})();

document
  .getElementById('uploadForm')
  ?.addEventListener('submit', handleUploadCourse);

// === My Courses（安全插入：建議在 L194 與 L198 之間） ===
function getQueryParam(key) {
  const m = new URL(location.href).searchParams.get(key);
  return m || '';
}
// 只打開同頁編輯器，不建檔、不跳頁
async function createDraftCourse() {
  const { address } = getAddressAndUID();
  if (address === '未登入') {
    alert('請先連接錢包再建立課程');
    return;
  }

  // 1) 設定旗標，讓編輯器顯示（即使沒有 ?courseId）
  window.__forceOpenEditor = true;

  // 2) 清掉 URL 上可能存在的 courseId（避免誤以為在編輯舊課程）
  try {
    const url = new URL(location.href);
    url.searchParams.delete('courseId');
    history.replaceState({}, '', url);
  } catch (_) {}

  // 3) 清空表單、設預設值
  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v ?? '';
  };
  setVal('title', '');
  setVal('description', '');
  setVal('category', 'blockchain');
  setVal('type', 'video');

  // Access 預設 free、隱藏價格
  const rFree = document.querySelector('input[name="access"][value="free"]');
  const rToken = document.querySelector('input[name="access"][value="token"]');
  if (rFree) rFree.checked = true;
  if (rToken) rToken.checked = false;
  const price = document.getElementById('priceAKC');
  if (price) price.value = '';

  // 4) 觸發你原本的顯示/預覽同步（priceRow 顯示、預覽卡更新）
  document
    .querySelectorAll('input[name="access"]')
    .forEach((r) => r.dispatchEvent(new Event('change')));
  ['title', 'category', 'type', 'priceAKC'].forEach((id) => {
    const el = document.getElementById(id);
    el && el.dispatchEvent(new Event('input'));
  });

  // 5) 顯示編輯器並捲動到表單
  toggleStudioEditor();
  document
    .getElementById('studioEditor')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.createDraftCourse = createDraftCourse;

// 顯示/隱藏右側編輯器（只有帶 courseId 才顯示）
function toggleStudioEditor() {
  const editor = document.getElementById('studioEditor');
  if (!editor) return;
  const cid = getQueryParam('courseId');
  const force = !!window.__forceOpenEditor;
  editor.classList.toggle('hidden', !(cid || force));
}

// 讀取指定課程，把欄位回填到表單
async function loadCourseIntoForm(courseId) {
  if (!courseId) return;
  const doc = await window.db.collection('courses').doc(courseId).get();
  if (!doc.exists) return;
  const d = doc.data();

  // 基本欄位
  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v ?? '';
  };
  setVal('title', d.title || '');
  setVal('description', d.description || '');
  setVal('category', d.category || 'blockchain');
  setVal('type', d.type || 'video');

  // 存取 & 價格
  const access = d.access === 'token' ? 'token' : 'free';
  const rFree = document.querySelector('input[name="access"][value="free"]');
  const rToken = document.querySelector('input[name="access"][value="token"]');
  if (access === 'token') {
    rToken && (rToken.checked = true);
    setVal('priceAKC', d.priceAKC ?? 0);
  } else {
    rFree && (rFree.checked = true);
    setVal('priceAKC', '');
  }

  // 觸發你原本的顯示/預覽同步（priceRow 顯示、預覽卡更新）
  document
    .querySelectorAll('input[name="access"]')
    .forEach((r) => r.dispatchEvent(new Event('change')));
  ['title', 'category', 'type', 'priceAKC'].forEach((id) => {
    const el = document.getElementById(id);
    el && el.dispatchEvent(new Event('input'));
  });

  // ✅ 線上主影片預覽（若已有 downloadURL）
  try {
    const pvVideo = document.getElementById('pvVideo');
    if (pvVideo && d.downloadURL) {
      pvVideo.src = d.downloadURL;
      pvVideo.classList.remove('hidden');
      // 暫存以便切分頁/重整時還原
      sessionStorage.setItem(`AKC_PV_MAIN_${courseId}`, d.downloadURL);
    }
  } catch (_) {}
}

// 啟動：頁面載入後先切換可視狀態；若有 courseId 就回填
window.addEventListener('DOMContentLoaded', async () => {
  try {
    toggleStudioEditor();
    const cid = getQueryParam('courseId');
    if (cid) {
      await loadCourseIntoForm(cid);
      await renderLessons(); // ← 有 courseId 時，先把課綱渲染出來
    }
    bindCurriculumActions(); // ← 綁定「＋影片單元／＋文章單元」
    // ✅ 若 sessionStorage 有主影片預覽，套用之（避免重整後不見）
    try {
      const cid2 = getQueryParam('courseId');
      if (cid2) {
        const cached = sessionStorage.getItem(`AKC_PV_MAIN_${cid2}`);
        const pvVideo = document.getElementById('pvVideo');
        if (pvVideo && cached) {
          pvVideo.src = cached;
          pvVideo.classList.remove('hidden');
        }
      }
    } catch (_) {}
  } catch (e) {
    console.warn('Studio init failed', e);
  }
});

async function loadMyCoursesPanel(targetId = 'myCoursesPanel') {
  const panel = document.getElementById(targetId);
  if (!panel) return; // 沒放容器就不動

  const address = sessionStorage.getItem('walletAddress');
  if (!address) {
    panel.innerHTML = '<p class="text-gray-500">請先連接錢包以查看你的課程</p>';
    return;
  }
  const uploader = address.toLowerCase();
  const snap = await window.db
    .collection('courses')
    .where('uploader', '==', uploader)
    .orderBy('updatedAt', 'desc')
    .limit(50)
    .get();

  if (snap.empty) {
    panel.innerHTML =
      '<p class="text-gray-500">尚無課程，點右上角「新增課程」開始吧！</p>';
    return;
  }
  const rows = [];
  snap.forEach((doc) => {
    const d = doc.data();
    rows.push(`
  <li class="py-2 border-b">
    <div class="flex items-center justify-between">
      <div>
        <div class="font-medium">${d.title || '(未命名課程)'}</div>
        <div class="text-sm text-gray-500">${d.status || 'draft'} · ${
      d.access || 'free'
    }${d.priceAKC ? ' · ' + d.priceAKC + ' AKC' : ''}</div>
      </div>
      <div class="flex items-center gap-3">
        <a class="text-blue-600 hover:underline" href="upload.html?courseId=${
          doc.id
        }">編輯</a>
        <button class="text-gray-700 hover:underline" data-action="toggleVisibility" data-id="${
          doc.id
        }">
          ${d.visibility === 'private' ? '設為公開' : '設為私人'}
        </button>
        <button class="text-gray-700 hover:underline" data-action="deleteCourse" data-id="${
          doc.id
        }">刪除</button>
      </div>
    </div>
  </li>
`);
  });
  panel.innerHTML = `<ul>${rows.join('')}</ul>`;
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    loadMyCoursesPanel();
  } catch (e) {
    console.warn('loadMyCoursesPanel failed', e);
  }
});

document.addEventListener('click', async (e) => {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return;
  const id = el.getAttribute('data-id');
  const action = el.getAttribute('data-action');
  if (!id || !action) return;

  const ref = window.db.collection('courses').doc(id);

  if (action === 'toggleVisibility') {
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : {};
    const cur = data.visibility || 'public';
    const next = cur === 'private' ? 'public' : 'private';

    // 若要設為公開 → 先跑發佈檢查
    if (next === 'public') {
      const problems = await checkPublishable(id, data);

      if (problems.length) {
        alert('未符合上架條件：\n- ' + problems.join('\n- '));
        return;
      }
    }

    await ref.update({
      visibility: next,
      status: next === 'public' ? 'published' : data.status || 'draft',
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    });
    // ✅ Points：課程發佈成功 → +5（前端樂觀；只在私有→公開時觸發）
    if (next === 'public' && cur !== 'public') {
      try {
        AKC?.points?.award?.({ type: 'course:publish', ref: id, amount: 5 });
      } catch (_) {}
    }
    loadMyCoursesPanel(
      el.closest('#myCoursesPanelStudio')
        ? 'myCoursesPanelStudio'
        : 'myCoursesPanel'
    );
  }

  if (action === 'deleteCourse') {
    if (!confirm('確定要刪除？此動作可在管理端還原（軟刪除）。')) return;
    await ref.update({
      deletedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      status: 'deleted',
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    });
    loadMyCoursesPanel(
      el.closest('#myCoursesPanelStudio')
        ? 'myCoursesPanelStudio'
        : 'myCoursesPanel'
    );
  }
  if (action === 'retryLessonUpload') {
    const cid = getQueryParam('courseId');
    if (!cid) return;
    const lessonId = id;
    // 重新選檔再上傳
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'video/*';
    picker.onchange = async () => {
      const file = picker.files && picker.files[0];
      if (!file) return;

      const lessonRef = window.db
        .collection('courses')
        .doc(cid)
        .collection('lessons')
        .doc(lessonId);

      // 重傳前也嘗試探測時長
      const dur = await probeVideoDuration(file);
      if (dur > 0) {
        await lessonRef.update({
          duration: dur,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        });
      }

      const path = `courses/${cid}/lessons/${lessonId}/${file.name}`;
      await lessonRef.update({
        status: 'uploading',
        error: '',
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      });

      const task = window.storage
        .ref(path)
        .put(file, { contentType: file.type || 'application/octet-stream' });
      __uploadTasks.set(lessonId, task);
      task.on(
        'state_changed',
        (snap) => {
          const pct = Math.round(
            (snap.bytesTransferred / snap.totalBytes) * 100
          );
          updateLessonProgress(lessonId, pct, 'uploading');
          // 🧮 納入課綱總進度
          ensureGlobalProgress();
          __taskStats.set(lessonId, {
            x: snap.bytesTransferred,
            t: snap.totalBytes,
          });
          updateGlobalProgress();
        },
        async (err) => {
          __uploadTasks.delete(lessonId);
          // 從總進度移除
          __taskStats.delete(lessonId);
          updateGlobalProgress();
          await lessonRef.update({
            status: 'error',
            error: String(err),
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          });
          updateLessonProgress(lessonId, 0, 'error', String(err));
        },
        async () => {
          __uploadTasks.delete(lessonId);
          const url = await task.snapshot.ref.getDownloadURL();
          await lessonRef.update({
            status: 'ready',
            videoPath: path,
            downloadURL: url,
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          });
          updateLessonProgress(lessonId, 100, 'ready');
          // ✅ Points：影片單元重傳完成 → +5（同一 lessonId 由前端去重）
          try {
            AKC?.points?.award?.({
              type: 'lesson:video:ready',
              ref: lessonId,
              amount: 5,
            });
          } catch (_) {}
          // 移除總進度項並更新
          __taskStats.delete(lessonId);
          updateGlobalProgress();
          renderLessons();
        }
      );
    };
    picker.click();
  }

  if (action === 'renameLesson') {
    const cid = getQueryParam('courseId');
    if (!cid) return;
    const lessonId = id;
    const cur =
      document.querySelector(
        `#lessonList li[data-id="${lessonId}"] .font-medium`
      )?.textContent || '';
    const title = window.prompt('新的單元標題：', cur || '新標題');
    if (title === null) return;
    await window.db
      .collection('courses')
      .doc(cid)
      .collection('lessons')
      .doc(lessonId)
      .update({
        title: title.trim(),
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      });
    renderLessons();
  }

  if (action === 'deleteLesson') {
    const cid = getQueryParam('courseId');
    if (!cid) return;
    const lessonId = id;
    if (!confirm('確定刪除此單元？')) return;
    await window.db
      .collection('courses')
      .doc(cid)
      .collection('lessons')
      .doc(lessonId)
      .delete();
    renderLessons();
  }
});

// 捕獲單元預覽按鈕事件（使用事件代理）
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="previewLesson"]');
  if (!btn) return;
  e.preventDefault();
  const lessonId = btn.getAttribute('data-id');
  if (lessonId) {
    toggleLessonPreview(lessonId);
  }
});

function showPanel(name) {
  const ids = ['panelUpload', 'panelCurriculum', 'panelMyList'];
  ids.forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  document.getElementById(name)?.classList.remove('hidden');

  // 切到非上傳時，避免誤觸送出 → 可視需要停用或灰階 submit 鈕
  const btn = document.getElementById('uploadButton');
  if (btn) btn.disabled = name !== 'panelUpload';
}

function bindStudioTabs() {
  const up = document.getElementById('tabUpload');
  const cu = document.getElementById('tabCurriculum');
  const li = document.getElementById('tabMyList');
  up?.addEventListener('click', () => showPanel('panelUpload'));
  cu?.addEventListener('click', async () => {
    showPanel('panelCurriculum');
    await renderLessons(); // ← 切到課綱就渲染
    bindCurriculumActions(); // ← 確保按鈕已綁定（防止熱替換漏綁）
  });
  li?.addEventListener('click', () => {
    // 讓清單在 Studio 內也能瀏覽/操作
    loadMyCoursesPanel('myCoursesPanelStudio'); // 目標容器改成 Studio 內的 div
    showPanel('panelMyList');
  });
}
window.addEventListener('DOMContentLoaded', bindStudioTabs);

// 補一個保險絲：用程式綁定「新增課程」按鈕，避免 inline 失效
window.addEventListener('DOMContentLoaded', () => {
  document
    .getElementById('btnCreateCourse')
    ?.addEventListener('click', () => window.createDraftCourse?.());
});

// === S2.1: lessons 渲染與上傳骨架（不影響既有上傳/清單流程） ===

let __rendering = false;
let __renderTimer = null;

const __uploadTasks = new Map();

// 離開頁面前，如仍有上傳任務則警示
window.addEventListener('beforeunload', (e) => {
  if (__uploadTasks.size > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});

async function renderLessons() {
  const list = document.getElementById('lessonList');
  if (!list) return;

  // 防抖：若短時間重複呼叫，排程 200ms 後執行一次
  if (__rendering) {
    clearTimeout(__renderTimer);
    __renderTimer = setTimeout(() => {
      __rendering = false;
      renderLessons();
    }, 200);
    return;
  }
  __rendering = true;

  // skeleton
  list.innerHTML = `
    <li class="py-2 animate-pulse">
      <div class="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
      <div class="h-3 bg-gray-100 rounded w-1/5"></div>
    </li>
    <li class="py-2 animate-pulse">
      <div class="h-4 bg-gray-200 rounded w-2/5 mb-2"></div>
      <div class="h-3 bg-gray-100 rounded w-1/4"></div>
    </li>`;

  const cid = getQueryParam('courseId');
  if (!cid) {
    list.innerHTML = '<li class="text-gray-400">請先建立/選擇課程</li>';
    updateOutline([]);
    __rendering = false;
    return;
  }

  const col = window.db.collection('courses').doc(cid).collection('lessons');

  const snap = await col.orderBy('position').get();
  if (snap.empty) {
    list.innerHTML = '<li class="text-gray-400">尚未新增任何單元</li>';
    updateOutline([]);
    __rendering = false;
    return;
  }
  const items = [];
  snap.forEach((doc) => {
    const d = doc.data();
    items.push({ id: doc.id, ...d });
  });
  list.innerHTML = items
    .map(
      (it, idx) => `
<li class="py-2 border-b" draggable="true" data-id="${it.id}" data-pos="${
        it.position || (idx + 1) * 10
      }">
  <div class="flex items-center justify-between">
    <div>
      <div class="font-medium">${
        it.title || (it.kind === 'video' ? '影片單元' : '文章單元')
      }</div>
      <div class="text-sm text-gray-500">
        ${it.kind || 'video'} · ${it.status || 'ready'}${
        it.duration ? ' · ' + it.duration + 's' : ''
      }
        · <button class="underline text-xs" data-action="previewLesson" data-id="${
          it.id
        }">預覽</button>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-xs text-gray-400">#${idx + 1}</span>
      <button class="text-xs underline" data-action="renameLesson" data-id="${
        it.id
      }">重命名</button>
      <button class="text-xs underline text-red-600" data-action="deleteLesson" data-id="${
        it.id
      }">刪除</button>
    </div>
  </div>

</li>`
    )
    .join('');
  enableDragReorder(list, items);
  updateOutline(items);
  __rendering = false;
}

function bindCurriculumActions() {
  const v = document.getElementById('btnAddVideoLesson');
  if (v && !v.__bound) {
    v.addEventListener('click', addVideoLesson);
    v.__bound = true;
  }
  const a = document.getElementById('btnAddArticleLesson');
  if (a && !a.__bound) {
    a.addEventListener('click', addArticleLesson);
    a.__bound = true;
  }
}

// 讀取本地檔案的影片長度（秒）
async function probeVideoDuration(file) {
  return new Promise((resolve) => {
    try {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        const d = v.duration;
        if (v.src) URL.revokeObjectURL(v.src);
        resolve(Number.isFinite(d) ? Math.round(d) : 0);
      };
      v.onerror = () => {
        if (v.src) URL.revokeObjectURL(v.src);
        resolve(0);
      };
      v.src = URL.createObjectURL(file);
    } catch (_) {
      resolve(0);
    }
  });
}

async function addVideoLesson() {
  const cid = getQueryParam('courseId');
  if (!cid) {
    alert('請先建立/選擇課程');
    return;
  }
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'video/*';
  picker.onchange = async () => {
    const file = picker.files && picker.files[0];
    if (!file) return;
    const col = window.db.collection('courses').doc(cid).collection('lessons');
    const last = await col.orderBy('position', 'desc').limit(1).get();
    const nextPos = last.empty ? 10 : (last.docs[0].data().position || 10) + 10;
    const ref = col.doc();
    await ref.set({
      title: file.name,
      kind: 'video',
      position: nextPos,
      status: 'uploading',
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    });
    // 先把新建立的單元顯示出來，再顯示 0% 進度
    await renderLessons();
    updateLessonProgress(ref.id, 0, 'uploading');

    // 嘗試先探測影片時長，成功就寫回
    const dur = await probeVideoDuration(file);
    if (dur > 0) {
      await ref.update({
        duration: dur,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    const path = `courses/${cid}/lessons/${ref.id}/${file.name}`;
    const task = window.storage
      .ref(path)
      .put(file, { contentType: file.type || 'application/octet-stream' });
    __uploadTasks.set(ref.id, task);
    task.on(
      'state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        // 單元即時進度
        updateLessonProgress(ref.id, pct, 'uploading');
        // 🧮 納入課綱總進度
        ensureGlobalProgress();
        __taskStats.set(ref.id, {
          x: snap.bytesTransferred,
          t: snap.totalBytes,
        });
        updateGlobalProgress();
      },
      async (err) => {
        __uploadTasks.delete(ref.id);
        // 從總進度移除
        __taskStats.delete(ref.id);
        updateGlobalProgress();
        await ref.update({
          status: 'error',
          error: String(err),
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        });
        updateLessonProgress(ref.id, 0, 'error', String(err));
      },
      async () => {
        __uploadTasks.delete(ref.id);
        const url = await task.snapshot.ref.getDownloadURL();
        await ref.update({
          status: 'ready',
          videoPath: path,
          downloadURL: url,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        });
        updateLessonProgress(ref.id, 100, 'ready');
        // ✅ Points：影片單元上傳完成 → +5（前端樂觀）
        try {
          AKC?.points?.award?.({
            type: 'lesson:video:ready',
            ref: ref.id,
            amount: 5,
          });
        } catch (_) {}
        // 移除總進度項並更新
        __taskStats.delete(ref.id);
        updateGlobalProgress();
        renderLessons();
      }
    );
  };
  picker.click();
}

async function addArticleLesson() {
  const cid = getQueryParam('courseId');
  if (!cid) {
    alert('請先建立/選擇課程');
    return;
  }
  const title = window.prompt('文章標題：', '新文章單元');
  if (title === null) return;
  const content = window.prompt('內容（可後續編輯）：', '');
  const col = window.db.collection('courses').doc(cid).collection('lessons');
  const last = await col.orderBy('position', 'desc').limit(1).get();
  const nextPos = last.empty ? 10 : (last.docs[0].data().position || 10) + 10;
  const docRef = await col.add({
    title: (title || '文章單元').trim(),
    kind: 'article',
    content: content || '',
    position: nextPos,
    status: 'ready',
    createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
  });
  // ✅ Points：文章單元建立成功 → +3（前端樂觀）
  try {
    AKC?.points?.award?.({
      type: 'lesson:article:create',
      ref: docRef.id,
      amount: 3,
    });
  } catch (_) {}
  renderLessons();
}

function updateLessonProgress(lessonId, pct, status, errMsg) {
  const li = document.querySelector(`#lessonList li[data-id="${lessonId}"]`);
  if (!li) return;

  // 若尚未插入進度列，先加一個
  let bar = li.querySelector('.akc-progress');
  if (!bar) {
    const wrap = document.createElement('div');
    wrap.className = 'mt-1 text-xs text-gray-500 akc-progress';
    wrap.innerHTML = `
      <div class="h-1 bg-gray-200 rounded overflow-hidden">
        <div class="h-1 bg-gray-500" style="width:0%"></div>
      </div>
      <div class="mt-1"><span class="akc-progress-text">準備中…</span></div>`;
    li.appendChild(wrap);
    bar = wrap;
  }

  const barInner = bar.querySelector('div > div');
  const text = bar.querySelector('.akc-progress-text');

  if (status === 'uploading') {
    if (barInner) barInner.style.width = pct + '%';
    if (text) text.textContent = `上傳中… ${pct}%`;
  } else if (status === 'error') {
    if (text) {
      text.innerHTML = `上傳失敗：${errMsg || ''} 
        <button class="underline ml-2" data-action="retryLessonUpload" data-id="${lessonId}">重傳</button>`;
    }
  } else if (status === 'ready') {
    if (barInner) barInner.style.width = '100%';
    if (text) text.textContent = '完成';
    setTimeout(() => bar.remove(), 1500);
  }
}

// === 單元預覽功能 ===
// 點擊列表上的「預覽」按鈕時，展開或收合該單元的內容預覽。
async function toggleLessonPreview(lessonId) {
  const li = document.querySelector(`#lessonList li[data-id="${lessonId}"]`);
  if (!li) return;
  // 若已有 preview 區塊，則收合
  let preview = li.querySelector('.lesson-preview');
  if (preview) {
    preview.remove();
    return;
  }
  const cid = getQueryParam('courseId');
  if (!cid) return;
  // 讀取最新資料
  const lessonRef = window.db
    .collection('courses')
    .doc(cid)
    .collection('lessons')
    .doc(lessonId);
  const snap = await lessonRef.get();
  if (!snap.exists) return;
  const d = snap.data() || {};
  preview = document.createElement('div');
  preview.className = 'lesson-preview mt-2 p-3 bg-gray-50 border rounded';
  const kind = d.kind || 'video';
  if (kind === 'video') {
    if (d.downloadURL) {
      // 影片預覽
      preview.innerHTML = `<video controls class="w-full rounded"><source src="${d.downloadURL}"></video>`;
      if (d.title) {
        const titleEl = document.createElement('div');
        titleEl.className = 'mt-2 text-sm text-gray-600';
        titleEl.textContent = d.title;
        preview.appendChild(titleEl);
      }
    } else {
      preview.textContent = '尚未上傳影片。';
    }
  } else {
    // 文章預覽：以純文字呈現
    const pre = document.createElement('div');
    pre.className =
      'prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap';
    pre.textContent = d.content || '';
    preview.appendChild(pre);
  }
  li.appendChild(preview);
}

function updateOutline(items) {
  const ul = document.getElementById('pvOutlineList');
  if (!ul) return;
  if (!items || !items.length) {
    ul.innerHTML = '<li class="text-gray-400">尚未建立課綱</li>';
    return;
  }
  ul.innerHTML = items
    .map(
      (it, i) =>
        `<li>${i + 1}. ${
          it.title || (it.kind === 'video' ? '影片單元' : '文章單元')
        }</li>`
    )
    .join('');
}

function enableDragReorder(listEl, items) {
  if (!listEl) return;
  let dragId = null;
  listEl.querySelectorAll('li[draggable="true"]').forEach((li) => {
    li.addEventListener('dragstart', (e) => {
      dragId = li.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      li.classList.add('opacity-60');
    });
    li.addEventListener('dragenter', () => {
      li.classList.add('ring-2', 'ring-amber-400');
    });
    li.addEventListener('dragleave', () => {
      li.classList.remove('ring-2', 'ring-amber-400');
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    li.addEventListener('drop', async (e) => {
      e.preventDefault();
      li.classList.remove('ring-2', 'ring-amber-400');
      const targetId = li.dataset.id;
      if (!dragId || dragId === targetId) {
        li.classList.remove('opacity-60');
        return;
      }
      await reorderLessons(items, dragId, targetId);
      renderLessons();
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('opacity-60', 'ring-2', 'ring-amber-400');
    });
  });
}

async function reorderLessons(items, dragId, targetId) {
  const cid = getQueryParam('courseId');
  if (!cid) return;
  const ids = items.map((x) => x.id);
  const from = ids.indexOf(dragId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return;
  const reordered = items.slice();
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  const batch = window.db.batch();
  const colRef = window.db.collection('courses').doc(cid).collection('lessons');
  reordered.forEach((it, idx) => {
    const ref = colRef.doc(it.id);
    batch.update(ref, {
      position: (idx + 1) * 10,
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

async function checkPublishable(courseId, d) {
  const issues = [];
  if (!d.title || !d.description || !d.category || !d.type) {
    issues.push('基本欄位未完成（標題/分類/形式/簡介）');
  }
  if (d.access === 'token' && !(Number(d.priceAKC) > 0)) {
    issues.push('AKC 解鎖價格未設定');
  }
  // 至少 1 個 lesson
  const col = window.db
    .collection('courses')
    .doc(courseId)
    .collection('lessons');
  const snap = await col.limit(1).get();
  if (snap.empty) issues.push('至少需建立 1 個課綱單元');

  return issues;
}

console.log('db 是否存在？', window.db);
console.log('storage 是否存在？', window.storage);
