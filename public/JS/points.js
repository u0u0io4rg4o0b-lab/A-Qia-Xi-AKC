// public/js/points.js
window.AKC = window.AKC || {};
window.AKC.points = window.AKC.points || {};

(function (NS) {
  NS.__backend = NS.__backend || { enabled: true, url: '/api/points/award' };

  const TTL_MS = 5 * 60 * 1000; // 5 分鐘，同頁面會話去重
  NS.__version__ = 'v0.2.2';
  NS.__allowed__ =
    NS.__allowed__ ||
    new Set(['course:create', 'course:publish', 'login:daily']);

  NS.__dedup__ = NS.__dedup__ || new Map(); // key -> expiry

  const now = () => Date.now();
  const cleanup = () => {
    const t = now();
    for (const [k, exp] of NS.__dedup__) if (exp <= t) NS.__dedup__.delete(k);
  };
  const makeKey = (addr, type, ref) =>
    `${(addr || '').toLowerCase()}:${String(type)}:${String(ref)}`;

  // 向後相容：維持相同的函式名與簽名
  NS.award = async function awardPoints(payload) {
    try {
      let address = (
        sessionStorage.getItem('walletAddress') || ''
      ).toLowerCase();

      if (!address) {
        try {
          address = (localStorage.getItem('walletAddress') || '').toLowerCase();
        } catch {}
      }
      // P-1: 後端啟用時必須登入；未啟用（demo/封測）仍允許樂觀更新
      if (NS.__backend?.enabled && !address) {
        AKC?.bus?.emit?.('wallet:disconnected');
        AKC?.ui?.toast?.('請先連線錢包後再獲取積分。', 'warn');
        return;
      }
      const type = String(payload?.type || '').trim();
      let ref = String(payload?.ref || '').trim();

      // ★ 防呆：每日登入若沒附 ref，先補一個本機日期（只當通行證用）
      if (type === 'login:daily' && !ref) {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        ref = `${yyyy}-${mm}-${dd}`;
      }
      const amt = Number(payload?.amount);
      const amount = Number.isFinite(amt) && amt >= 0 ? amt : 0;
      if (!type) {
        console.warn('[points] invalid payload (type/ref required):', payload);
        return;
      }
      // Alpha gating：封測期間未在白名單的型別一律忽略
      if (NS.__allowed__ && !NS.__allowed__.has(type)) {
        console.info('[points] type disabled in alpha:', type);
        return;
      }
      cleanup();
      const key = makeKey(address, type, ref);
      if (NS.__dedup__.has(key)) {
        // 已經在 TTL 內處理過，避免重複觸發
        return;
      }
      NS.__dedup__.set(key, now() + TTL_MS);

      const t = Date.now();
      const event = { address, type, ref, amount, ts: t, key };

      // 生命週期事件：排隊中（未連後端前先視為 queued）
      AKC?.bus?.emit?.('points:award:queued', event);
      if (!event || !Number.isFinite(Number(event.amount))) return; // 僅檢查數字是否合法

      let data = null;
      if (NS.__backend?.enabled) {
        try {
          const res = await fetch(NS.__backend.url, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'X-Idempotency-Key': event.key,
            },
            body: JSON.stringify(event),
          });
          if (res.status === 200 || res.status === 201) {
            data = await res.json().catch(() => null);
          } else if (res.status === 401 || res.status === 419) {
            AKC?.bus?.emit?.('wallet:disconnected');
            AKC?.ui?.toast?.('登入逾時，請重新連線後再試。', 'warn');
            return;
          } else if (res.status === 429) {
            const ra = Number(res.headers.get('Retry-After') || 0);
            AKC?.ui?.toast?.(
              ra ? `稍候 ${ra}s 再試` : '請稍後再試（太多請求）',
              'warn'
            );
            // 若伺服器回傳 Retry-After，就用它覆寫去重 TTL，避免使用者太快重試
            if (ra > 0) NS.__dedup__.set(key, now() + ra * 1000);
            return;
          } else {
            // P-2: 非 429 失敗 → 立刻釋放 dedup，允許重試
            NS.__dedup__.delete(key);
            AKC?.bus?.emit?.('points:award:failed', {
              event,
              status: res.status,
            });
            return;
          }
        } catch (netErr) {
          // P-2: 網路層失敗 → 釋放 dedup
          NS.__dedup__.delete(key);
          AKC?.bus?.emit?.('points:award:failed', { event, error: netErr });
          return;
        }
      }

      // UI 更新：維持舊有相容事件（若後端有回傳 data 以它為準）
      // 後端尚未啟用 → 直接使用本地事件物件（樂觀更新）
      // 若未啟用後端 → 仍採樂觀更新；已啟用 → 優先採後端回傳
      const out = data?.result || event;
      AKC?.bus?.emit?.('points:updated', out);
      AKC?.bus?.emit?.('points:awarded', out);
      // P-3: 如果後端提供權威 total，補一次 hydrate 對齊角標
      if (data?.result && typeof data.result.total === 'number') {
        AKC?.bus?.emit?.('points:hydrate', { total: data.result.total });
      }
    } catch (e) {
      console.warn('[points] awardPoints failed', e);
    }
  };

  // --- auto badge binder (optional, UI 無侵入) ---
  (function () {
    function updateBadge(total) {
      // 與 navbar.js 一致：認 [data-points-badge] 或 #pointsBadge
      const el = document.querySelector('[data-points-badge], #pointsBadge');
      if (!el) return;

      const val = Number(total);
      if (!Number.isFinite(val)) return; // 空空就跳過

      const cur = Number(el.textContent || 0);
      el.textContent = String(Math.max(cur, val));
      el.classList.remove('hidden'); // 只移除 hidden，不再加回去
    }

    // 首頁/個人頁補水
    AKC?.bus?.on?.('points:hydrate', (e) => updateBadge(e?.total));
    // 任意加分後同步
    AKC?.bus?.on?.('points:updated', (e) => {
      // 若事件有 total 就用它；否則讀目前 badge 數字 + e.amount 做簡易累加
      if (typeof e?.total === 'number') return updateBadge(e.total);
      const el = document.querySelector('[data-points-badge], #pointsBadge');
      const cur = el ? Number(el.textContent || 0) : 0;
      const next = cur + (Number(e?.amount) || 0);
      updateBadge(next);
    });
  })();
})(window.AKC.points);
