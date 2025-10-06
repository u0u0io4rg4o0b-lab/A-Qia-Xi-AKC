/*
 * missions.js
 *
 * 封測階段任務頁面的客戶端邏輯。此檔案定義了任務清單、渲染函式
 * 以及任務行為，並透過 AKC.bus 廣播或監聽事件與其他模組整合。
 * 請勿在此檔案中使用 style.display 切換元素顯示，應使用 classList
 * 來控制 Tailwind CSS 類別；亦勿在未定義 AKC 時提前引用其屬性。
 */

(function () {
  // 防止重複初始化
  if (window.__INIT_MISSIONS_JS__) return;
  window.__INIT_MISSIONS_JS__ = true;

  // 任務資料定義
  const missions = [
    {
      id: 'feedback',
      title: '留言與回饋',
      roles: ['協作者', '學習者', '教育者'],
      description:
        '分享您在使用阿卡西平台過程中的心得、建議與錯誤回報。您的回饋將直接影響我們的產品優化。',
      reward: '社區積分 + 早期挖礦資格',
      action() {
        // 回饋任務暫無固定表單，顯示說明即可
        notify(
          '請前往我們的官方社群（Discord/Telegram）發布回饋，或填寫未來將公告的 Google 表單。敬請期待！'
        );
      },
    },
    {
      id: 'upload-course',
      title: '教案投稿',
      roles: ['教育者'],
      description:
        '創建您的第一個課程！簡單規劃 1–3 節課綱（影片或文章皆可），在「Studio」上傳測試以驗證流程。',
      reward: '教育者晉升資格 + 額外社區積分',
      action() {
        // 如果尚未登入則提醒連接錢包，否則導向上傳頁面
        const loggedIn = sessionStorage.getItem('isLoggedIn') === 'true';
        if (!loggedIn) {
          notify('請先連接錢包後再進行教案投稿');
          AKC?.bus?.emit('wallet:requestConnect');
        } else {
          // 送一則可選的點擊事件（若 bus/metrics 未實作，這行不會報錯）
          try {
            AKC?.bus?.emit?.('metrics:missionClick', { id: 'upload-course' });
          } catch {}
          // 導航到課程上傳頁面，附來源參數，便於上傳完成後回跳
          AKC?.bus?.emit?.('mission:start', { id: 'upload-course' });
          window.location.href = 'upload.html?from=missions';
        }
      },
    },
    {
      id: 'collaboration-proposal',
      title: '協作提案',
      roles: ['協作者'],
      description:
        '幫助我們改進平台的使用者體驗、翻譯、智慧合約或設計。提交設計稿、開發建議或拉取請求，我們會盡快回覆。',
      reward: '協作者 SBT + AKC 配置額度',
      action() {
        notify(
          '請透過 GitHub 提交 issue 或 PR（暫未公開）；您也可於社群中分享協作提案，我們將於正式版提供更多管道。'
        );
      },
    },
    {
      id: 'bug-report',
      title: '測試報告',
      roles: ['學習者'],
      description:
        '瀏覽首頁、課程頁、個人檔案與鑄造通道等功能，記錄發現的錯誤或不一致之處，協助我們改進產品。',
      reward: '早期礦工資格 + 功能投票權',
      action() {
        notify(
          '請記錄您的使用流程與遇到的問題，並於社群或表單提交。我們將在正式版提供完整錯誤回報系統。'
        );
      },
    },
    {
      id: 'community-governance',
      title: '社群共識',
      roles: ['所有角色'],
      description:
        '加入我們的線上社群，參與產品功能的討論與投票，分享你對去中心化圖書館願景的想法。',
      reward: '治理 SBT + 社區積分',
      action() {
        notify(
          '請加入我們的 Discord 或 Telegram 群組參與討論。正式連結將於社群平台公布。'
        );
      },
    },
    {
      id: 'create-your-mission',
      title: '自訂任務',
      roles: ['所有角色'],
      description:
        '提出您認為可以促進阿卡西圖書館發展的任務，我們將評估並納入官方任務，並給予創意獎勵。',
      reward: '創意貢獻 SBT + 額外獎勵',
      action() {
        notify('歡迎於社群或郵件分享您的任務構想，我們將統一整理並回覆。');
      },
    },
  ];
  // 可選：讓其他頁（例如 profile 的 Drawer）也能使用同一份任務清單
  if (window.AKC) {
    AKC.missions = missions;
  }
  /**
   * 顯示訊息的方法。若 AKC.ui.toast 存在則使用，否則回退到 alert()。
   * @param {string} message 要顯示的訊息
   */
  function notify(message) {
    try {
      if (window.AKC && AKC.ui && typeof AKC.ui.toast === 'function') {
        AKC.ui.toast(message);
      } else {
        alert(message);
      }
    } catch (err) {
      console.error('通知顯示時發生錯誤', err);
      alert(message);
    }
  }

  /**
   * 渲染任務卡片到頁面。
   */
  function renderMissions() {
    const listEl = document.getElementById('missionsList');
    if (!listEl) return;
    // 清空舊內容
    listEl.innerHTML = '';
    missions.forEach((mission) => {
      const card = document.createElement('div');
      // Tailwind 卡片樣式
      card.className =
        'bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-5 flex flex-col';
      // 穩定的自動化測試選擇器
      card.setAttribute('data-mission-id', mission.id);
      card.setAttribute('role', 'region');
      // 建立標題
      const titleEl = document.createElement('h2');
      titleEl.textContent = mission.title;
      titleEl.className = 'text-xl font-semibold mb-2 text-gray-800';
      card.appendChild(titleEl);
      // 顯示適用角色
      const rolesEl = document.createElement('p');
      rolesEl.className = 'mb-2 text-sm text-indigo-600';
      rolesEl.textContent = '適用角色：' + mission.roles.join('、');
      card.appendChild(rolesEl);
      // 說明文字
      const descEl = document.createElement('p');
      descEl.textContent = mission.description;
      descEl.className = 'mb-3 text-gray-700';
      // 讓按鈕能以 aria-describedby 指向描述
      const descId = `mission-desc-${mission.id}`;
      descEl.id = descId;
      card.appendChild(descEl);
      // 獎勵
      const rewardEl = document.createElement('p');
      rewardEl.textContent = '獎勵：' + mission.reward;
      rewardEl.className = 'mb-4 text-sm text-green-700';
      card.appendChild(rewardEl);
      // 按鈕
      const btn = document.createElement('button');
      btn.textContent = '開始任務';
      btn.type = 'button';
      btn.className =
        'self-start bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-400';
      btn.setAttribute('aria-label', `開始任務：${mission.title}`);
      btn.setAttribute('aria-describedby', descId);
      btn.addEventListener('click', (event) => {
        try {
          mission.action();
        } catch (err) {
          console.error('執行任務時發生錯誤', err);
          notify('任務觸發錯誤，請稍後再試');
        }
      });
      card.appendChild(btn);
      listEl.appendChild(card);
    });
  }

  /**
   * 初始化函式：等待 DOM 準備完成後渲染任務。
   */
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderMissions);
    } else {
      renderMissions();
    }
  }

  // 透過 AKC 事件匯流排監聽錢包連接後重新渲染（若需要）
  if (window.AKC && AKC.bus && typeof AKC.bus.on === 'function') {
    AKC.bus.on('wallet:connected', () => {
      // 重新渲染任務以更新登入判斷
      renderMissions();
    });
  }

  // 啟動
  init();
})();
