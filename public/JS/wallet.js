// ✅ wallet.js - 管理錢包連接與合約互動邏輯

if (window.__INIT_WALLET__) {
  if (
    (window.AKC && window.AKC.DEBUG) === true &&
    !window.__AKC_WARNED_WALLET_INIT__
  ) {
    console.debug('wallet.js already initialized — skipping second load.');
    window.__AKC_WARNED_WALLET_INIT__ = true;
  }
} else {
  window.__INIT_WALLET__ = true; // ★ 設旗子：避免二次初始化

  window.AKC = window.AKC || {};
  AKC.wallet = AKC.wallet || {};

  // === Provider detection (EIP-1193 + EIP-6963) =============================
  async function __AKC_detectProvider(timeout = 1500) {
    const providers = [];
    function onAnnounce(e) {
      if (e?.detail?.provider) providers.push(e.detail.provider);
    }
    try {
      window.addEventListener('eip6963:announceProvider', onAnnounce);
      window.dispatchEvent(new Event('eip6963:requestProvider'));
    } catch (_) {}
    // wait for async injection on mobile (ethereum#initialized)
    if (!window.ethereum) {
      await new Promise((resolve) => {
        const t = setTimeout(resolve, timeout);
        window.addEventListener(
          'ethereum#initialized',
          () => {
            clearTimeout(t);
            resolve();
          },
          { once: true }
        );
        // 兼容未派發 ethereum#initialized 的錢包：短輪詢到 timeout 為止
        const start = Date.now();
        const iv = setInterval(() => {
          if (window.ethereum) {
            clearInterval(iv);
            clearTimeout(t);
            resolve();
          } else if (Date.now() - start >= timeout) {
            clearInterval(iv);
          }
        }, 200);
      });
    }
    const injected = window.ethereum || null;
    const list = [...providers, injected].filter(Boolean);
    try {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
    } catch (_) {}
    if (!list.length) return null;
    const preferred = list.find((p) => p.isMetaMask) || list[0];
    return preferred;
  }
  function __AKC_chainHex(id) {
    return '0x' + Number(id).toString(16);
  }
  // 只載一次 ethers（CDN）；若已存在就略過
  async function __AKC_ensureEthers() {
    if (typeof ethers !== 'undefined' && ethers.providers?.Web3Provider) return;
    if (window.__AKC_ETHERS_PROMISE__) return window.__AKC_ETHERS_PROMISE__;
    window.__AKC_ETHERS_PROMISE__ = new Promise((resolve, reject) => {
      const src =
        window.AKC_CONFIG?.ETHERS_CDN ||
        'https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js';
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('ethers cdn load failed'));
      document.head.appendChild(s);
    }).finally(() => (window.__AKC_ETHERS_PROMISE__ = null));
    await window.__AKC_ETHERS_PROMISE__;
  }

  // B) 公開 API：連接錢包
  AKC.wallet.connect = async function connectWallet(opts = {}) {
    // 先宣告（避免 TDZ）：供內部 async 區塊賦值
    let provider, signer, contract;
    // 單例 Promise：多處呼叫共用同一個 pending，避免重複送 RPC
    if (window.__AKC_CONNECT_PROMISE__) return window.__AKC_CONNECT_PROMISE__;
    window.__AKC_CONNECT_PROMISE__ = (async () => {
      window.__AKC_CONNECTING__ = true;
      try {
        // B1) 偵測 Provider（等待行動端注入 + EIP-6963 多提供者）
        const injected = await __AKC_detectProvider();
        if (!injected) {
          // 由 UI 層決定是否改走 deeplink / WalletConnect
          throw new Error('沒有偵測到可用的 Ethereum Provider');
        }
        // L65 之後：把這次選到的 provider 記到全域，供事件監聽引用
        window.__AKC_INJECTED = injected;
        if (typeof ethers === 'undefined' || !ethers.providers?.Web3Provider) {
          try {
            await __AKC_ensureEthers();
          } catch (_) {
            throw new Error('ethers library not loaded');
          }
        }

        // B2) 建立 provider，請求帳號
        provider = new ethers.providers.Web3Provider(injected, 'any');

        // ── Preflight：若已授權就不要再彈窗 ───────────────────────────
        const pre = await injected.request({ method: 'eth_accounts' });
        if (!pre || pre.length === 0) {
          // 跨分頁防並發：用 localStorage 當「全域鎖」（60 秒 TTL）
          const LOCK_KEY = 'AKC_CONNECTING_LOCK';
          const now = Date.now();
          try {
            const lock = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null');
            if (lock && now - lock.ts < 60000) {
              throw Object.assign(new Error('Another tab is connecting'), {
                code: -32002,
              });
            }
            localStorage.setItem(LOCK_KEY, JSON.stringify({ ts: now }));
          } catch {}
          try {
            await provider.send('eth_requestAccounts', []);
          } catch (e) {
            if (e && e.code === -32002) {
              // 等待使用者在錢包裡面完成或取消那個「舊」請求（最多 120 秒）
              await new Promise((resolve, reject) => {
                const on = (accs = []) => {
                  cleanup();
                  accs.length ? resolve() : reject(e);
                };
                const t = setTimeout(() => {
                  cleanup();
                  reject(e);
                }, 120000);
                const cleanup = () => {
                  injected?.removeListener?.('accountsChanged', on);
                  clearTimeout(t);
                };
                injected?.on?.('accountsChanged', on);
              });
            } else {
              throw e;
            }
          } finally {
            try {
              localStorage.removeItem(LOCK_KEY);
            } catch {}
          }
        }

        // B3) 檢查 / 切換網路（鏈 ID）
        if (!window.AKC_CONFIG || window.AKC_CONFIG.CHAIN_ID == null) {
          throw new Error(
            '缺少 CHAIN_ID 設定，請在 config.js 設定 AKC_CONFIG.CHAIN_ID'
          );
        }
        const wantHex = __AKC_chainHex(window.AKC_CONFIG.CHAIN_ID);
        let currentHex = (
          await injected.request({ method: 'eth_chainId' })
        )?.toLowerCase();
        if (currentHex !== wantHex) {
          try {
            await injected.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: wantHex }],
            });
          } catch (e) {
            if (e && e.code === 4902) {
              await injected.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: wantHex,
                    chainName:
                      window.AKC_CONFIG?.CHAIN_NAME || 'Target Network',
                    nativeCurrency: window.AKC_CONFIG?.NATIVE_CURRENCY || {
                      name: 'ETH',
                      symbol: 'ETH',
                      decimals: 18,
                    },
                    rpcUrls:
                      window.AKC_CONFIG?.RPC_URLS ||
                      (window.AKC_CONFIG?.RPC_URL
                        ? [window.AKC_CONFIG.RPC_URL]
                        : ['https://rpc.sepolia.org/']),

                    blockExplorerUrls: window.AKC_CONFIG?.BLOCK_EXPLORERS || [
                      'https://sepolia.etherscan.io/',
                    ],
                  },
                ],
              });
            } else if (e && e.code === 4001) {
              throw new Error('使用者取消切換網路');
            } else {
              throw e;
            }
          }
          // 驗證是否確實切換成功
          await new Promise((r) => setTimeout(r, 100));
          currentHex = (
            await injected.request({ method: 'eth_chainId' })
          )?.toLowerCase();
          if (currentHex !== wantHex) {
            throw new Error(`仍在錯誤的鏈：${currentHex}，需要 ${wantHex}`);
          }
        }

        // B4) 取得 signer 與地址

        signer = provider.getSigner();
        const address = await signer.getAddress();

        // B5) 使用 SIWE 流程（EIP-4361）
        try {
          // 交給 siwe.js：會自動取 nonce、組訊息、簽名、POST /api/siwe/verify
          if (!AKC.siwe?.signIn) {
            throw new Error('SIWE 模組尚未載入，請確認此頁已引入 siwe.js');
          }
          await AKC.siwe.signIn({
            provider,
            statement: 'Sign in to Akashic Library',
          });
          // siwe.js 成功後已寫入 sessionStorage 並廣播 wallet:connected
          await window.saveUserData?.(address.toLowerCase(), '');
          // (W-1) 鏡射到 localStorage，讓跨分頁 storage 事件能即時同步
          try {
            localStorage.setItem('walletAddress', address.toLowerCase());
          } catch {}
        } catch (e) {
          // 與原本一致：回滾登入態 + 廣播錯誤
          sessionStorage.removeItem('walletAddress');
          sessionStorage.removeItem('signature');
          sessionStorage.removeItem('isLoggedIn');
          sessionStorage.removeItem('loginTime');
          AKC.bus?.emit('wallet:error', { error: e, message: 'SIWE 驗證失敗' });
          throw e;
        }

        // （更新）B6.8) 預設導向個人頁；若 opts.stay === true 則留在當前頁
        if (!opts?.stay) {
          try {
            window.location.replace(
              'profile.html?uid=' + encodeURIComponent(address.toLowerCase())
            );
          } catch (e) {
            console.warn('導向個人頁失敗（略過）：', e);
          }
        }

        // ── 事件監聽（一次性） ───────────────────────────────────────────
        if (!window.__AKC_WALLET_EVENTS_BOUND__) {
          window.__AKC_WALLET_EVENTS_BOUND__ = true;
          const evp = window.__AKC_INJECTED || window.ethereum;
          // A) 帳號變更
          evp?.on?.('accountsChanged', (accounts = []) => {
            try {
              const mode = (
                window.AKC?.getAuthMode ||
                (typeof __AKC_getAuthMode === 'function'
                  ? __AKC_getAuthMode
                  : () => 'strict')
              )();

              if (!accounts.length) {
                window.logout?.();
                // 僅在 strict 頁才立即導回首頁；open/soft 留在當前頁，由頁面自行處理
                if (mode === 'strict') window.location.replace('index.html');
                return;
              }
              const next = accounts[0];
              // 換帳號後要求重新簽名 → 先重置登入態
              sessionStorage.setItem(
                'walletAddress',
                (next || '').toLowerCase()
              );
              // (W-2) 跨分頁同步
              try {
                localStorage.setItem(
                  'walletAddress',
                  (next || '').toLowerCase()
                );
              } catch {}
              sessionStorage.removeItem('signature');
              sessionStorage.removeItem('isLoggedIn');
              sessionStorage.removeItem('loginTime');
              AKC.bus?.emit('wallet:accountChanged', {
                address: (next || '').toLowerCase(),
              });
              // 不自動跳轉；strict 頁若需要導回，交給 auth-control.js 的模式判斷
            } catch (e) {
              AKC.bus?.emit('wallet:error', { error: e });
            }
          });
          // B) 鏈變更
          evp?.on?.('chainChanged', async (hexId) => {
            hexId = (hexId || '').toLowerCase();
            try {
              const want = __AKC_chainHex(window.AKC_CONFIG.CHAIN_ID);
              if (hexId !== want) {
                try {
                  await evp.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: want }],
                  });
                } catch (e) {
                  AKC.bus?.emit('wallet:error', { error: e });
                  return;
                }
              }
              AKC.bus?.emit('wallet:connected', {
                address: sessionStorage.getItem('walletAddress'),
              });
            } catch (e) {
              AKC.bus?.emit('wallet:error', { error: e });
            }
          });
          //  Provider 連線中斷（EIP-1193）
          evp?.on?.('disconnect', (err) => {
            try {
              window.logout?.(); // 與無帳號語義一致 → 廣播 wallet:disconnected
              const mode = (
                window.AKC?.getAuthMode ||
                (typeof __AKC_getAuthMode === 'function'
                  ? __AKC_getAuthMode
                  : () => 'strict')
              )();
              // 僅 strict 頁導回首頁；open/soft 留在原頁，由 UI 自行還原
              if (mode === 'strict') window.location.replace('index.html');
            } catch (e) {
              AKC.bus?.emit('wallet:error', { error: e });
            }
          });
        }
        // ────────────────────────────────────────────────────────────────

        // B7) 回傳一些常用物件，讓需要的人繼續用
        return { address, provider, signer };
      } catch (err) {
        // B8) 若失敗，廣播錯誤事件並把錯拋出去
        const friendly =
          err?.code === -32002
            ? '錢包已在處理連線請求，請切到擴充或錢包 App 完成或取消現有請求'
            : err?.message;

        AKC.bus?.emit('wallet:error', {
          error: err,
          message: friendly,
          code: err?.code,
        });
        throw err;
      } finally {
        window.__AKC_CONNECTING__ = false;
        window.__AKC_CONNECT_PROMISE__ = null;
      }
    })();
    // （保留既有後續變數的可見性，不再重複宣告）
    /* const contractAddress = window.AKC_CONFIG.CONTRACT;
    if ((window.AKC && window.AKC.DEBUG) === true) {
      console.debug('WALLET.js USING CONTRACT =', contractAddress);
    }
*/
    const abi = [
      'function message() view returns (string)',
      'function setMessage(string)',
      'function whitelist(address) view returns (bool)',
      'function joinWhitelist()',
    ];

    // 🔍 檢查是否在白名單中
    // window.checkWhitelist = async function (address) {
    // if (!contract) return false;
    // try {
    //   return await contract.whitelist(address);
    // } catch (err) {
    //   console.error('❌ 查詢白名單失敗：', err);
    //  return false;
    //  }
    //};

    // 🚪 登出功能：清除 sessionStorage 並返回首頁
    window.logout = async function () {
      // 先嘗試通知後端清除 session（siwe.js 會同時清本地 sessionStorage 並廣播）
      try {
        await AKC.siwe?.signOut?.();
      } catch (_) {
        // ignore
      }
      // 仍保留 localStorage 鏡射清理（siwe.js 不管 localStorage）
      try {
        localStorage.removeItem('walletAddress');
      } catch {}
      console.log('🧹 已登出，清除登入資訊（含後端 session）');
    };

    // 僅在開發模式提示一次；生產靜音
    if (
      (window.AKC && window.AKC.DEBUG) === true &&
      !window.__AKC_WARNED_INITUI__
    ) {
      console.debug(
        '[wallet.js] initUI is deprecated — handled by ui.js. No action taken.'
      );
      window.__AKC_WARNED_INITUI__ = true;
    }

    window.connectWallet = AKC.wallet.connect;
  };
  // C) 綁定「連接錢包」按鈕（若存在）；防止重覆綁定（用 dataset）
  window.bindWalletButtons = function bindWalletButtons() {
    // 置於 wallet.js（舊 API：保留介面，但不再做任何 UI 綁定）
    (function () {
      // 只在開發時提示一次；生產完全靜音
      const isDev = (window.AKC && window.AKC.DEBUG) === true;
      if (!window.__AKC_WARNED_WALLET_BIND && isDev) {
        console.debug(
          '[wallet.js] Deprecated: bindWalletButtons() — UI binds moved to ui.js'
        );
        window.__AKC_WARNED_WALLET_BIND = true;
      }

      // 將舊 API 改為 no-op，避免重複綁定
      window.wallet = window.wallet || {};
      window.wallet.bindWalletButtons = function () {
        // no-op for backward compatibility
        return;
      };
    })();
  };
}
// 允許由 bus 直接觸發（舊路徑相容）
AKC.bus?.on('wallet:connect', () => {
  AKC.wallet.connect().catch(() => {});
});
