// === Nickname submit flow: unified handler for form submit & button click ===
function validateNickname(input) {
  const s = (input || '').trim();
  if (!s) return '請輸入暱稱';
  if (s.length > 24) return '暱稱最長 24 字';
  const ok = /^[\p{L}\p{N}_\-. ]+$/u.test(s);
  if (!ok) return '僅限中文/英文/數字/空格/._-';
  return '';
}

async function handleNicknameSubmit(e) {
  e?.preventDefault && e.preventDefault();
  const inputEl = document.getElementById('nicknameInput');
  const btnEl = document.getElementById('saveNicknameButton');
  const nickname = inputEl?.value?.trim();
  const address = (sessionStorage.getItem('walletAddress') || '').toLowerCase();
  const toast = AKC?.ui?.toast ?? ((m) => alert(m));
  const err = validateNickname(nickname);
  if (err) {
    toast(err);
    return;
  }
  if (!address) {
    toast('請先連接錢包');
    return;
  }
  if (window.__NICK_SAVE_INFLIGHT__) return;
  window.__NICK_SAVE_INFLIGHT__ = true;
  btnEl &&
    (btnEl.disabled = true) &&
    btnEl.classList.add('opacity-50', 'pointer-events-none');
  try {
    if (typeof saveUserData !== 'function') {
      console.warn('[profile] saveUserData 未載入');
      toast('系統尚未就緒，請稍後再試');
      return; // 讓 finally 收尾
    }
    await saveUserData(address, nickname);
    // 更新個人頁 + Navbar
    const display = document.getElementById('nicknameDisplay');
    if (display) display.textContent = nickname;
    const nav = document.getElementById('userNickname');
    if (nav) nav.textContent = nickname;
    AKC?.bus?.emit?.('nickname:updated', { address, nickname });
    AKC?.bus?.on('points:hydrate', ({ total }) => {
      badge.textContent = String(total);
      badge.hidden = false;
    });
    toast('✅ 暱稱更新成功');
  } catch (err) {
    console.error('[profile] 暱稱儲存失敗', err);
    toast('❌ 暱稱儲存失敗，請稍後再試');
  } finally {
    window.__NICK_SAVE_INFLIGHT__ = false;
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.classList.remove('opacity-50', 'pointer-events-none');
    }
  }
}
document
  .getElementById('nicknameForm')
  ?.addEventListener('submit', handleNicknameSubmit);
document
  .getElementById('saveNicknameButton')
  ?.addEventListener('click', handleNicknameSubmit);

// 🔄 從 Firebase 載入使用者暱稱，並更新顯示
async function loadNicknameFromDatabase() {
  const address = sessionStorage.getItem('walletAddress');
  if (!address) return;

  try {
    const db = window.db || (firebase?.firestore?.() ?? null);
    if (!db) {
      console.error('[profile.js] Firebase DB 未就緒（window.db 空）');
      return;
    }

    // 1) 以小寫地址（標準 docId）讀取）
    const lower = (address || '').toLowerCase();
    let snap = await db.collection('users').doc(lower).get();

    // 2) 找不到 → 回退讀「原樣地址」（相容舊資料）
    if (!snap.exists && lower !== address) {
      const snapOrig = await db.collection('users').doc(address).get();
      if (snapOrig.exists) snap = snapOrig;
    }

    if (snap.exists) {
      const data = snap.data() || {};
      const nick = data.nickname ?? ''; // 僅 null/undefined 才套預設（避免把空字串當沒值）
      const input = document.getElementById('nicknameInput');
      const display = document.getElementById('nicknameDisplay');
      const navbar = document.getElementById('userNickname');

      // 3) 覆蓋三處：輸入框 / 個人頁顯示 / Navbar
      if (input) input.value = nick;
      if (display)
        display.textContent =
          nick || address.slice(0, 6) + '...' + address.slice(-4);
      if (navbar)
        navbar.textContent =
          nick || address.slice(0, 6) + '...' + address.slice(-4);
    } else {
      // 沒文件：以地址縮寫填入畫面，避免卡在「載入中…」
      const input = document.getElementById('nicknameInput');
      const display = document.getElementById('nicknameDisplay');
      const navbar = document.getElementById('userNickname');
      const short = address.slice(0, 6) + '...' + address.slice(-4);
      if (input) input.value = '';
      if (display) display.textContent = short;
      if (navbar) navbar.textContent = short;
    }
  } catch (err) {
    console.error('❌ 載入 nickname 失敗', err);
    const display = document.getElementById('nicknameDisplay');
    if (display && address)
      display.textContent = address.slice(0, 6) + '...' + address.slice(-4);
  }
}

// === 讀取並顯示使用者 Points 總分（只讀） ===
async function loadPointsTotal(address) {
  try {
    if (!address || !window.db) return;
    const lower = (address || '').toLowerCase();
    const snap = await window.db.collection('users').doc(lower).get();
    const total = (snap.exists && (snap.data().pointsTotal ?? 0)) || 0;

    // 優先覆蓋既有節點；若不存在就動態插入一張小卡
    let displayEl = document.getElementById('pointsTotalDisplay');
    if (!displayEl) {
      // 嘗試放在「課程清單」卡片上方；若找不到容器就插到 body 開頭
      const createdCoursesEl = document.getElementById('createdCourses');
      const host = createdCoursesEl?.parentElement || document.body;

      const card = document.createElement('div');
      card.className = 'my-3 p-4 rounded-2xl shadow bg-white';
      card.innerHTML = `
        <div class="text-sm text-gray-500 mb-1">我的 Points</div>
        <div id="pointsTotalDisplay" class="text-2xl font-semibold tracking-wide">0</div>
      `;
      host.prepend(card);
      displayEl = card.querySelector('#pointsTotalDisplay');
    }
    displayEl.textContent = String(total);

    // ★ 新增：導覽列角標同步（兩種選擇器都支援）
    const hud = document.querySelector('[data-points-badge], #pointsBadge');
    if (hud) {
      hud.textContent = String(total);
      hud.hidden = false;
    }

    // 廣播 Points 基準值，讓其它頁面/HUD 對齊
    try {
      window.AKC?.bus?.emit?.('points:hydrate', { total });
    } catch {}
  } catch (err) {
    console.warn('[profile] loadPointsTotal failed:', err);
  }
}

// ★ 新增：type → 人話說明
const __AKC_REASON__ = {
  login: '登入（舊制）',

  'login:daily': '每日登入',
  'course:create': '建立課程',
  'course:publish': '發佈課程',
};
const reasonOf = (type, ref) => __AKC_REASON__[type] || type;

// === 讀取並顯示使用者 Points 歷史（只讀） ===
async function loadPointsHistory(address, limit = 50) {
  const host = document.getElementById('pointsHistoryList');
  if (!host) return;
  host.textContent = '（載入中…）';
  try {
    if (!address || !window.db) {
      host.textContent = '（需要登入）';
      return;
    }
    const lower = (address || '').toLowerCase();
    const col = window.db.collection('users').doc(lower).collection('points');

    // 先以 serverTs 排序；若缺值再退回 clientTs
    let snap = await col.orderBy('serverTs', 'desc').limit(limit).get();
    if (snap.empty) {
      snap = await col
        .orderBy('clientTs', 'desc')
        .limit(limit)
        .get()
        .catch(() => snap);
    }

    host.textContent = '';
    if (snap.empty) {
      host.textContent = '（目前沒有紀錄）';
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'space-y-1';
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const li = document.createElement('li');
      const ts =
        d.serverTs?.toDate?.() ||
        (d.serverTs?.seconds ? new Date(d.serverTs.seconds * 1000) : null) ||
        (typeof d.clientTs === 'number' ? new Date(d.clientTs) : null);
      const when = ts
        ? new Intl.DateTimeFormat('zh-TW', {
            timeZone: 'Asia/Taipei',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(ts)
        : '(時間未知)';

      const type = String(d.type || '');
      const ref = String(d.ref || '');
      const amt = Number(d.amount || 0);
      li.textContent = `${when}｜${reasonOf(type, ref)}｜${ref}｜+${amt}`;

      ul.appendChild(li);
    });
    host.appendChild(ul);
  } catch (e) {
    console.warn('[profile] loadPointsHistory failed:', e);
    host.textContent = '（載入失敗）';
  }
}

// === Badges helpers（前端記憶版）======================================
function lightBadge(type) {
  const li = document.querySelector(`#badgeList [data-badge="${type}"]`);
  if (!li || li.dataset.active === '1') return;
  li.dataset.active = '1';
  li.classList.add('ring-2', 'ring-amber-300', 'bg-amber-50', 'shadow-md');
  // 小小的「已獲得」標記（可移除，不影響樣式）
  const mark = document.createElement('div');
  mark.className = 'mt-1 text-amber-600 text-sm';
  mark.textContent = '已獲得';
  li.appendChild(mark);
  // 解除鎖定樣式 + ARIA
  li.classList.remove('opacity-60', 'grayscale');
  li.setAttribute('aria-pressed', 'true');
}
function persistBadge(address, type) {
  try {
    localStorage.setItem(`akc:badge:${address}:${type}`, '1');
    localStorage.setItem('lastAuthAt', String(Date.now()));
  } catch {}
}
function hydrateBadges(address) {
  if (!address) return;
  document.querySelectorAll('#badgeList [data-badge]').forEach((el) => {
    const t = el.getAttribute('data-badge');
    try {
      if (localStorage.getItem(`akc:badge:${address}:${t}`) === '1') {
        lightBadge(t);
      }
    } catch {}
  });
}
// 初始化徽章預設為「鎖定」（未獲得 = 灰階/半透明/aria-pressed=false）
function initBadgeLockedStyle() {
  document.querySelectorAll('#badgeList [data-badge]').forEach((el) => {
    el.classList.add('opacity-60', 'grayscale');
    el.setAttribute('aria-pressed', 'false');
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  // 先把畫面標成「載入中…」，避免空白或閃爍
  const display = document.getElementById('nicknameDisplay');
  if (display) display.textContent = '載入中…';

  // ★ 新增：第一次把 UID/錢包寫回畫面，避免卡在「載入中…」
  const raw = sessionStorage.getItem('walletAddress') || '';
  const uidEl = document.getElementById('uidDisplay');
  const walletEl = document.getElementById('walletDisplay');
  if (uidEl) uidEl.textContent = raw || '尚未登入';
  if (walletEl)
    walletEl.textContent = raw
      ? raw.slice(0, 6) + '...' + raw.slice(-4)
      : '尚未登入';
  // 原本的 nickname 載入
  await loadNicknameFromDatabase();
  // ★ 先把 Navbar 也切到「已連線」狀態（如果本來就有地址）
  const initialForNav = sessionStorage.getItem('walletAddress');
  updateNavbarWalletUI(initialForNav);

  initBadgeLockedStyle();

  // ★ 如果 navbar-loader 有對外宣告「載入完成」，我們也接一次（沒有也不會壞）
  document.addEventListener('navbar:ready', () => {
    const addrNow = sessionStorage.getItem('walletAddress');
    updateNavbarWalletUI(addrNow);
    // 即時：當 points 更新（或教學單元完成）時，刷新我的總分卡片
    AKC.bus?.on?.('points:updated', () => {
      const addr = sessionStorage.getItem('walletAddress');
      if (addr) loadPointsTotal(addr);
    });
    // （暫時）若後端尚未回推 points:updated，也先用 lesson:completed 當提示
    AKC.bus?.on?.('lesson:completed', () => {
      const addr = sessionStorage.getItem('walletAddress');
      if (addr) loadPointsTotal(addr);
    });
    // ✅ 取得分數即點亮對應徽章，並前端記憶
    AKC.bus?.on?.('points:awarded', (e) => {
      const t = e?.detail?.type || e?.type;
      const addr = sessionStorage.getItem('walletAddress') || '';
      if (!t || !addr) return;
      lightBadge(t);
      persistBadge(addr, t);
    });
  });

  if (!window.__PROFILE_WALLET_CONNECTED_BOUND__) {
    window.__PROFILE_WALLET_CONNECTED_BOUND__ = true;
    AKC.bus?.on('wallet:connected', async (e) => {
      const addr =
        e?.detail?.address ||
        e?.address ||
        sessionStorage.getItem('walletAddress') ||
        '';
      if (addr) await updateNftPanel(addr);
      await loadNicknameFromDatabase();

      updateNavbarWalletUI(addr);
      await hydrateCreatedCourses(addr);
      await loadPointsTotal(addr);

      await hydrateBadges(addr);
      await hydrateMissions(addr);
      await loadPointsHistory(addr);
    });
  }

  // 監聽換帳號（仍保持連線狀態）
  if (!window.__PROFILE_WALLET_ACCOUNT_BOUND__) {
    window.__PROFILE_WALLET_ACCOUNT_BOUND__ = true;
    AKC.bus?.on?.('wallet:accountChanged', async (e) => {
      const addr =
        e?.detail?.address ||
        e?.address ||
        sessionStorage.getItem('walletAddress') ||
        '';
      if (!addr) {
        AKC.bus?.emit?.('wallet:disconnected');
        return;
      }
      await loadNicknameFromDatabase();
      updateNavbarWalletUI(addr);
      await updateNftPanel(addr);
      await hydrateCreatedCourses(addr);
      await loadPointsTotal(addr);
      await hydrateBadges(addr);
      await hydrateMissions(addr);
      await loadPointsHistory(addr);
    });
  }

  // 監聽登出事件（例如使用者手動「斷開」，或其他頁面清除了 sessionStorage）
  AKC.bus?.on?.('wallet:disconnected', () => {
    try {
      sessionStorage.removeItem('walletAddress');
    } catch {}
    updateNavbarWalletUI('');
    const uidEl = document.getElementById('uidDisplay');
    const walletEl = document.getElementById('walletDisplay');
    if (uidEl) uidEl.textContent = '尚未登入';
    if (walletEl) walletEl.textContent = '尚未登入';
    // 清除 NFT 面板的提示與卡片（若存在）
    const msg = document.getElementById('nftStatusMessage');
    const mint = document.getElementById('mintAction');
    const nfts = document.getElementById('myLibraryNFTs');
    if (msg) {
      msg.textContent = '';
      msg.classList.remove('text-green-400', 'text-red-400');
    }
    if (mint) mint.classList.add('hidden');
    if (nfts) nfts.innerHTML = '';
  });

  // 錢包錯誤 → 與斷線同 UI 語義（不中斷流程）
  if (!window.__PROFILE_WALLET_ERROR_BOUND__) {
    window.__PROFILE_WALLET_ERROR_BOUND__ = true;
    AKC.bus?.on?.('wallet:error', () => {
      AKC.bus?.emit?.('wallet:disconnected');
    });
  }

  // 跨分頁同步（localStorage 事件只在其他分頁觸發）
  // 若你目前使用 sessionStorage 保存 address，也能用 localStorage 的 "mirror" 方式觸發
  window.addEventListener('storage', (e) => {
    if (e.key === 'walletAddress' && !e.newValue) {
      AKC.bus?.emit?.('wallet:disconnected');
    }
  });

  // 開頁若已經連過錢包，先跑一次檢查（沒有事件也能更新）
  const initial = sessionStorage.getItem('walletAddress');
  if (initial) await updateNftPanel(initial);
  await hydrateCreatedCourses(initial);
  await loadPointsTotal(initial);
  await loadPointsHistory(initial);

  await hydrateBadges(initial);
  await hydrateMissions(initial);
});

// 監聽外部暱稱更新，雙向同步輸入框/顯示/UI
AKC.bus?.on?.('nickname:updated', (evt) => {
  const a = evt?.detail?.address || evt?.address;
  const n = evt?.detail?.nickname || evt?.nickname;
  if (!a || !n) return;
  const addrNow = sessionStorage.getItem('walletAddress') || '';
  if (a.toLowerCase() !== addrNow.toLowerCase()) return;
  const input = document.getElementById('nicknameInput');
  const display = document.getElementById('nicknameDisplay');
  const nav = document.getElementById('userNickname');
  if (input) input.value = n;
  if (display) display.textContent = n;
  if (nav) nav.textContent = n;
});

function setNftLoading(isLoading) {
  const messageEl = document.getElementById('nftStatusMessage');
  const mintActionEl = document.getElementById('mintAction');
  if (!messageEl || !mintActionEl) return;

  if (isLoading) {
    messageEl.textContent = '正在檢查 NFT 持有狀態…';
    mintActionEl.classList.add('pointer-events-none', 'opacity-50');
    mintActionEl.disabled = true;
  } else {
    mintActionEl.classList.remove('pointer-events-none', 'opacity-50');
    mintActionEl.disabled = false;
  }
}

function updateNavbarWalletUI(addr, tries = 0) {
  const connectBtn =
    document.getElementById('connectWalletButton') ||
    document.getElementById('connectWallet') ||
    document.getElementById('walletStatus'); // 有些頁是這個

  // 👇 你的專案真正可點去個人頁的是「暱稱」這個節點
  const nicknameEl = document.getElementById('userNickname');

  // navbar 可能尚未插入，稍後重試（最多 ~3 秒）
  if ((!connectBtn || !nicknameEl) && tries < 20) {
    setTimeout(() => updateNavbarWalletUI(addr, tries + 1), 150);
    return;
  }
  if (!connectBtn || !nicknameEl) {
    console.warn('Navbar 元素仍不存在，略過切換');
    return;
  }

  if (addr) {
    // 已登入：隱「連接錢包」，顯「暱稱（可點去個人頁）」
    connectBtn.classList.add('hidden');
    nicknameEl.classList.remove('hidden');
    nicknameEl.classList.add('inline-block');

    // 若讀不到暱稱（例如離線），用地址縮寫當暱稱
    const current = (nicknameEl.textContent || '').trim();
    if (!current || current === '未設定') {
      const short = addr.slice(0, 6) + '…' + addr.slice(-4);
      nicknameEl.textContent = short;
    }

    // 確保可以點 → 個人頁（帶上 uid）
    if (!nicknameEl.dataset.bound) {
      nicknameEl.setAttribute('role', 'button');
      nicknameEl.classList.add('cursor-pointer');
      nicknameEl.addEventListener('click', () => {
        window.location.href = 'profile.html?uid=' + addr;
      });
      nicknameEl.dataset.bound = '1';
    }
  } else {
    // 未登入：顯「連接錢包」，隱「暱稱」
    nicknameEl.classList.add('hidden');
    connectBtn.classList.remove('hidden');
    connectBtn.classList.add('inline-block');
  }
}

// ★ 共用：依地址檢查 hasNFT 並更新畫面
async function updateNftPanel(address) {
  if (!address) return;
  setNftLoading(true);
  try {
    console.debug('[profile] CHAIN =', window.AKC_CONFIG?.CHAIN_ID);

    let hasNFT;
    try {
      hasNFT = await checkHasNFT(address, {
        expectedChainId: window.AKC_CONFIG.CHAIN_ID,
        preferReadOnly: true,
        cacheNegative: false,
      });
    } catch (e) {
      const msg = String(e?.message || '');
      const code = e?.code;
      // 🔁 MetaMask 斷路器 / -32603 / 工具函式未載入 / 鏈不符（wrong network / chain id）時→唯讀 RPC 重試
      if (
        code === -32603 ||
        code === 4902 || // 部分錢包：未加載該鏈
        /circuit breaker|wrong network|chain id|expected/i.test(msg) ||
        e?.name === 'ReferenceError'
      ) {
        console.warn(
          '[profile] MetaMask provider blocked, fallback to read-only RPC'
        );
        const rpcUrl = window.AKC_CONFIG?.RPC_URL; // 例如你的專案設定

        if (rpcUrl) {
          const ro = makeReadOnlyProvider();
          // 直接在這裡做 balanceOf/ownerOf 的檢查（與 checkHasNFT 等價的 read-only 版本）
          // 假設是 ERC721 balanceOf(address)
          const c = new ethers.Contract(
            window.AKC_CONFIG.CONTRACT,
            ['function balanceOf(address) view returns (uint256)'],
            ro
          );
          const bal = await c.balanceOf(address);
          hasNFT = bal && bal.gt(0);
        } else {
          throw e; // 沒有 RPC_URL 就維持原錯
        }
      } else {
        throw e;
      }
    }

    console.log('📥 NFT 檢查地址:', address);
    console.log('📦 檢查結果 hasNFT:', hasNFT);

    const messageEl = document.getElementById('nftStatusMessage');
    const mintActionEl = document.getElementById('mintAction');
    if (!messageEl || !mintActionEl) return;

    if (hasNFT) {
      messageEl.textContent = '✅ 您已成功鑄造圖書證 NFT。';
      messageEl.classList.remove('text-red-400');
      messageEl.classList.add('text-green-400');
      mintActionEl.classList.add('hidden');
      await displayMyLibraryNFT(address);
    } else {
      messageEl.textContent = '❌ 尚未持有圖書證 NFT。請點擊下方按鈕進行鑄造。';
      messageEl.classList.remove('text-green-400');
      messageEl.classList.add('text-red-400');
      mintActionEl.classList.remove('hidden');
      mintActionEl.classList.add('block'); // 不用 inline style，統一用 Tailwind 類別
    }
  } catch (err) {
    console.error('NFT 檢查錯誤', err);
    const messageEl = document.getElementById('nftStatusMessage');
    if (messageEl) {
      messageEl.textContent = '❗ 無法確認 NFT 狀態，請稍後再試。';
      messageEl.classList.remove('text-green-400', 'text-red-400');
    }
  } finally {
    setNftLoading(false); // ← 新增：結束載入狀態
  }
}

// ===== PATCH: enforceReadOnlySendShape (profile.js 早期初始化區塊) =====
(function enforceReadOnlySendShape() {
  const ro = window.AKC?.readOnlyProvider;
  if (!ro || typeof ro.send !== 'function') return;
  const _send = ro.send.bind(ro);
  ro.send = async function (methodOrObj, paramsMaybe) {
    // 若有人錯把 {method, params} 丟進來，這裡修正成 ('method', paramsArray)
    if (
      typeof methodOrObj === 'object' &&
      methodOrObj &&
      'method' in methodOrObj
    ) {
      const m = String(methodOrObj.method || '');
      const p = Array.isArray(methodOrObj.params) ? methodOrObj.params : [];
      return _send(m, p);
    }
    // 正常情況直接透傳
    const m = String(methodOrObj || '');
    const p = Array.isArray(paramsMaybe) ? paramsMaybe : [];
    return _send(m, p);
  };
})();

// 放在檔案前面共用工具區（或 AKC 工具集中）
function makeReadOnlyProvider() {
  const url = window.AKC_CONFIG?.RPC_URL;
  if (!url) return null;
  // v5：用 StaticJsonRpcProvider；若你是 v6，改回 JsonRpcProvider 並指定 static network
  const ro = new ethers.providers.StaticJsonRpcProvider(url, {
    name: 'sepolia',
    chainId: 11155111,
  });
  // ✅ 永遠開著的「正規化保險」
  const _origSend = ro.send.bind(ro);
  ro.send = async (method, params = []) => {
    // 1) 若有人誤把「盒子」塞進來，就幫他拆成「紙條 + 清單」
    if (
      typeof method !== 'string' &&
      method &&
      typeof method.method === 'string'
    ) {
      const fixedMethod = method.method;
      const fixedParams = Array.isArray(method.params) ? method.params : [];
      if (window.AKC_DEBUG_RPC) {
        console.warn(
          '[AKC rpc normalized] 修正 object 形狀 →',
          fixedMethod,
          fixedParams
        );
        console.trace();
      }
      return _origSend(fixedMethod, fixedParams);
    }
    // 2) 仍然做基本型別檢查（debug 時才吵）
    if (window.AKC_DEBUG_RPC && typeof method !== 'string') {
      console.error(
        '[RPC misuse] provider.send 被以非字串 method 呼叫:',
        method
      );
      console.trace();
      throw new Error('provider.send(method, params[]) 的 method 必須是字串');
    }
    if (window.AKC_DEBUG_RPC) console.debug('[rpc/send]', method, params);
    return _origSend(method, params);
  };
  return ro;
}

async function displayMyLibraryNFT(address) {
  let provider = null;
  // ① 優先嘗試唯讀 RPC（較穩、免打擾錢包）
  if (window.AKC_CONFIG?.RPC_URL) {
    try {
      const ro = makeReadOnlyProvider();
      provider = ro;
      console.info(
        '[profile] 使用唯讀 RPC（Alchemy/自訂）：',
        window.AKC_CONFIG?.RPC_URL
      );
    } catch (e) {
      console.info(
        '[profile] RPC provider blocked (likely CORS) → fall back to Web3Provider',
        e
      );
    }
  }
  // ② 回落到 MetaMask（使用者已裝/已連線時）
  if (!provider && window.ethereum) {
    provider = new ethers.providers.Web3Provider(window.ethereum);
  }
  if (!provider) {
    throw new Error(
      '[profile] No available provider for displayMyLibraryNFT()'
    );
  }
  // ethers 守門：來源載入失敗時給出可讀錯誤，外層會顯示「無法確認」
  if (typeof ethers === 'undefined' || !ethers.Contract) {
    throw new Error('[profile] ethers library not loaded');
  }
  const abi = [
    'function nextTokenId() view returns (uint256)',
    'function ownerOf(uint256 tokenId) view returns (address)',
    'function tokenURI(uint256 tokenId) view returns (string)',
    'function balanceOf(address) view returns (uint256)',
    'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  ];
  const c = new ethers.Contract(window.AKC_CONFIG.CONTRACT, abi, provider);

  console.debug('[profile] contract =', window.AKC_CONFIG?.CONTRACT);

  const container = document.getElementById('myLibraryNFTs');
  if (!container) return;

  // 先嘗試 Enumerable 的 tokenOfOwnerByIndex 以避免全掃描
  let myId = null;
  try {
    const t0 = await c.tokenOfOwnerByIndex(address, 0);
    myId = t0.toNumber ? t0.toNumber() : Number(t0);
  } catch (e) {
    // 可能未實作 Enumerable，改走舊路徑（nextTokenId + ownerOf 掃描）
    try {
      const max = (await c.nextTokenId()).toNumber();
      for (let i = 0; i <= max; i++) {
        const owner = await c.ownerOf(i).catch(() => null);
        if (owner && owner.toLowerCase() === address.toLowerCase()) {
          myId = i;
          break;
        }
      }
    } catch (e2) {
      console.debug(
        '[profile] token enumerate failed (non-enumerable is OK)',
        e2
      );

      return;
    }
  }
  if (myId === null) return;

  let uri;
  try {
    uri = await c.tokenURI(myId);
  } catch (e) {
    // 若合約不支援 Enumerable 或取法不同，改走「已知 TOKEN_ID」或「事件掃描」備援
    if (typeof AKC_CONFIG?.TOKEN_ID === 'number') {
      uri = await c.tokenURI(AKC_CONFIG.TOKEN_ID);
    } else {
      // TODO：之後可加「從 Transfer 事件撈最後一顆屬於你的 tokenId」的方式
      throw e;
    }
  }
  if (!uri || typeof uri !== 'string') {
    console.warn('[profile] tokenURI 無效：', uri);
    return; // 不取 metadata，直接結束
  }
  const metadataUrl = window.AKC.toGateway(uri) || '';
  if (!metadataUrl || metadataUrl === 'undefined') {
    console.warn('[profile] metadataUrl 無效：', metadataUrl);
    return;
  }

  console.debug('[profile] metadataUrl =', metadataUrl);

  let metadata;
  try {
    // 這裡改用 config.js 提供的全域工具。丟「原始 uri/ipfs://」最安全，
    // 工具會自行處理多網關 + 逾時退避。
    metadata = await AKC.ipfs.loadJson(uri);
  } catch (e) {
    console.warn('[profile] loadJson failed', e);
    return;
  }
  const rawImage = String(metadata.image || metadata.image_url || '');
  const imageUrl = AKC.toGateway(rawImage) || '/img/nft-fallback.svg';

  const card = document.createElement('div');
  card.className = 'p-4 rounded-2xl shadow';
  const title = document.createElement('div');
  title.className = 'text-sm mb-2';
  title.textContent = `Token #${myId}`;
  const img = document.createElement('img');
  img.className = 'w-48 h-48 object-cover rounded-xl';
  img.alt = 'AKC Library Pass';
  img.src = imageUrl;

  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.onerror = () => {
    img.src = '/img/nft-fallback.svg';
  };

  card.appendChild(title);
  card.appendChild(img);
  container.innerHTML = '';
  container.appendChild(card);
}

async function hydrateCreatedCourses(address) {
  try {
    const el = document.getElementById('createdCourses');
    if (!el || !window.db || !address) return;
    const lower = address.toLowerCase();
    let snap;
    try {
      snap = await window.db
        .collection('courses')
        .where('uploader', '==', lower)
        .where('status', '!=', 'deleted')
        .get();
    } catch (err) {
      // 沒建 composite index 時退回單條件查詢

      console.info(
        '[profile] courses index missing → fallback to uploader-only',
        err?.code || err
      );

      snap = await window.db
        .collection('courses')
        .where('uploader', '==', lower)
        .get();
    }
    el.textContent = String(snap.size || 0);
  } catch (e) {
    console.error('[profile] hydrateCreatedCourses failed', e);
  }
}

async function hydrateMissions(address) {
  const ul = document.getElementById('missionList');
  if (!ul || !window.db) return;
  try {
    const snap = await window.db
      .collection('missions')
      .where('status', '==', 'open')
      .orderBy('dueAt', 'asc')
      .limit(3)
      .get();
    renderMissionListFromSnap(snap, ul);
  } catch (e) {
    console.info(
      '[profile] hydrateMissions fallback (index/rules) → client sort',
      e?.code || e
    );

    // Fallback：移除 orderBy，抓回來後在前端排序
    try {
      const snap2 = await window.db
        .collection('missions')
        .where('status', '==', 'open')
        .limit(10)
        .get();
      const arr = [];
      snap2.forEach((doc) => arr.push({ id: doc.id, ...(doc.data() || {}) }));
      const toMs = (v) =>
        v?.toMillis?.() ?? (v?.seconds ? v.seconds * 1000 : Number(v || 0));
      arr.sort((a, b) => toMs(a.dueAt) - toMs(b.dueAt));
      const top3 = arr.slice(0, 3);
      ul.textContent = '';
      if (top3.length) {
        top3.forEach((d) => {
          const li = document.createElement('li');
          li.textContent = `⬜ ${d.title || '未命名任務'}`;
          ul.appendChild(li);
        });
      } else {
        const li = document.createElement('li');
        li.textContent = '今日沒有任務，休息一下 ☕';
        ul.appendChild(li);
      }
    } catch (e2) {
      console.warn('[profile] missions fallback failed', e2);
      ul.textContent = '';
      const li = document.createElement('li');
      li.textContent =
        e2?.code === 'permission-denied'
          ? '（需要登入或權限不足）'
          : '任務載入失敗';
      ul.appendChild(li);
    }
  }
}

// 小工具：從快照渲染任務列表（改為 DOM 節點防注入）
function renderMissionListFromSnap(snap, ul) {
  ul.textContent = '';
  if (snap.empty) {
    const li = document.createElement('li');
    li.textContent = '今日沒有任務，休息一下 ☕';
    ul.appendChild(li);
    return;
  }
  snap.forEach((doc) => {
    const d = doc.data() || {};
    const li = document.createElement('li');
    li.textContent = `⬜ ${d.title || '未命名任務'}`;
    ul.appendChild(li);
  });
}
// 保險：把工具函式掛到 window，方便任何頁面/腳本共用
window.makeReadOnlyProvider =
  window.makeReadOnlyProvider || makeReadOnlyProvider;
