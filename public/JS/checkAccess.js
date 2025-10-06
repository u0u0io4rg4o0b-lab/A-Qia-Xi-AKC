// 讀使用者偏好（放 localStorage 就不會因為重整而失憶）
if (!('AKC_DEBUG_RPC' in window)) {
  window.AKC_DEBUG_RPC = localStorage.AKC_DEBUG_RPC === '1';
}

// === DEV-ONLY 全域 RPC 守門（抓出任何 send({ ... }) 誤用；可自動修正） ===
if (window.AKC_DEBUG_RPC) {
  try {
    const guards = [
      ethers?.providers?.Web3Provider?.prototype, // 與 MetaMask 互動（寫）
      ethers?.providers?.JsonRpcProvider?.prototype, // 讀鏈（RPC）
      ethers?.providers?.StaticJsonRpcProvider?.prototype, // 讀鏈（RPC/固定）
    ].filter(Boolean);

    for (const Proto of guards) {
      if (Proto.__AKC_GUARDED__) continue;
      Proto.__AKC_GUARDED__ = true;
      const _orig = Proto.send;

      Proto.send = function (method, params = []) {
        // 記帳本
        window.__AKC_RPC_MISUSE__ ||= [];

        // L24 起（替換整段）
        if (typeof method !== 'string') {
          // ✅ 一律嘗試「正規化」：{ method, params } → ('method', [])
          if (
            method &&
            typeof method === 'object' &&
            typeof method.method === 'string'
          ) {
            const fixedMethod = method.method;
            const fixedParams = Array.isArray(method.params)
              ? method.params
              : [];
            if (window.AKC_DEBUG_RPC) {
              console.warn(
                '[AKC rpc normalized] 修正 object 形狀 →',
                fixedMethod,
                fixedParams
              );
              console.trace();
            }
            return _orig.call(this, fixedMethod, fixedParams);
          }

          // ❌ 真的修不了才視為誤用（DEV 才擋）
          window.__AKC_RPC_MISUSE__ ||= [];
          window.__AKC_RPC_MISUSE__.push({
            when: Date.now(),
            fixedTo: 'unfixable',
            stack: new Error().stack,
          });
          if (window.AKC_DEBUG_RPC) {
            throw new Error(
              'provider.send(method, params[]) 的 method 必須是字串'
            );
          }
        }

        return _orig.call(this, method, params);
      };

      Proto.__AKC_GUARDED__ = true;
    }
  } catch (e) {
    console.warn('[AKC DEBUG RPC] guard install failed:', e);
  }
}

// 乾淨 URL 濾掉 placeholder / example
function isCleanRpc(u) {
  return (
    typeof u === 'string' &&
    u &&
    !/\/v3\/xxx\b/i.test(u) &&
    !/example\.com/i.test(u)
  );
}

function makeReadOnlyProvider(url) {
  if (!isCleanRpc(url)) return null;
  // 與 profile.js 一致：靜態唯讀，固定 sepolia
  return new ethers.providers.StaticJsonRpcProvider(url, {
    name: 'sepolia',
    chainId: 11155111,
  });
}
// --- 全域單例：統一 MetaMask Web3Provider，避免重複建立導致回退不一致
let __mmCached = null;
function getOrMakeMM() {
  if (__mmCached) return __mmCached;
  const injected =
    (typeof window.AKC?.getProvider === 'function' &&
      window.AKC.getProvider()) ||
    window.ethereum ||
    null;
  __mmCached = injected ? new ethers.providers.Web3Provider(injected) : null;
  return __mmCached;
}
//（可選）掛到 window 方便其他檔重用
window.getOrMakeMM = window.getOrMakeMM || getOrMakeMM;

window.checkHasNFT = async function (address, opts = {}) {
  try {
    //  保險：若 ethers 尚未載入，直接短路避免後續 throw
    if (!window.ethers?.providers || !window.ethers?.utils) {
      console.warn('[access] ethers not ready');
      return false;
    }
    // 參數檢查 + 位址正規化
    let owner = String(address || '').trim();
    if (!owner && opts?.requestAccounts) {
      const injected =
        (typeof window.AKC?.getProvider === 'function' &&
          window.AKC.getProvider()) ||
        window.ethereum;
      if (!injected) {
        console.warn('[access] No wallet (window.ethereum not found)');
        return false;
      }

      const arr = await window.ethereum
        .request({ method: 'eth_requestAccounts' })
        .catch(() => []);

      owner = arr && arr[0] ? String(arr[0]).trim() : '';
    }

    try {
      owner = ethers.utils.getAddress(owner);
    } catch {
      console.warn('[access] invalid owner address:', owner);
      return false;
    }

    const configUrls = Array.isArray(window.AKC_CONFIG?.RPC_URLS)
      ? [...window.AKC_CONFIG.RPC_URLS]
      : window.AKC_CONFIG?.RPC_URLS
      ? [String(window.AKC_CONFIG.RPC_URLS)]
      : [];
    if (window.AKC_CONFIG?.RPC_URL)
      configUrls.unshift(window.AKC_CONFIG.RPC_URL);
    const rpcUrls = configUrls.filter(isCleanRpc);
    const overrideUrl = isCleanRpc(opts?.rpcUrlOverride)
      ? opts.rpcUrlOverride
      : '';
    const rpcUrl = overrideUrl || rpcUrls[0] || '';

    // 提前決定預期鏈別，供 roProvider 帶入 network hint，避免 ethers 偵測造成 noNetwork
    const expected = Number(
      opts.expectedChainId ?? window.AKC_CONFIG?.CHAIN_ID ?? 11155111
    );

    const preferReadOnly =
      (opts?.preferReadOnly ?? !opts?.requestAccounts) && !!rpcUrl;
    const roProvider = preferReadOnly ? makeReadOnlyProvider(rpcUrl) : null;
    const mm = getOrMakeMM();
    let provider = roProvider || null;
    if (!provider) provider = mm;
    console.debug(
      '[access] using',
      provider === roProvider ? 'RPC' : 'MetaMask'
    );

    if (!provider) {
      console.warn(
        '[access] No provider available (RPC_URL / MetaMask both unavailable)'
      );
      return false;
    }

    // 若先選到 RPC，先檢查 RPC 鏈別是否正確；錯鏈則回退到 MetaMask（若有）

    if (provider === roProvider && expected != null) {
      try {
        const net = await provider.getNetwork();
        if (Number(net.chainId) !== Number(expected)) {
          console.warn(
            '[access] RPC chain mismatch:',
            net.chainId,
            '≠',
            expected
          );
          if (mm) {
            provider = mm;
          } else {
            return false;
          }
        }
      } catch (e) {
        console.warn(
          '[access] RPC getNetwork failed, fallback to MetaMask if available',
          e
        );
        if (mm) {
          provider = mm;
        } else {
          return false;
        }
      }
    }

    // 僅在使用 MetaMask provider 時檢查/切換鏈別
    if (provider === mm && expected != null) {
      const net = await provider.getNetwork();
      const currentId = Number(net.chainId);
      const targetId = Number(expected);
      if (currentId !== targetId) {
        const hexId =
          typeof window.__AKC_chainHex === 'function'
            ? window.__AKC_chainHex(targetId)
            : '0x' + targetId.toString(16);
        try {
          await mm.send('wallet_switchEthereumChain', [{ chainId: hexId }]);
        } catch (switchErr) {
          // 4902 = 目標鏈尚未加入 → 嘗試加鏈後再切
          const msg = String(switchErr?.message || '').toLowerCase();
          if (
            switchErr?.code === 4902 ||
            msg.includes('unrecognized chain') ||
            msg.includes('could not switch')
          ) {
            const addParams = {
              chainId: hexId,
              chainName: window.AKC_CONFIG?.CHAIN_NAME || 'Sepolia',
              nativeCurrency: window.AKC_CONFIG?.NATIVE_CURRENCY || {
                name: 'Sepolia ETH',
                symbol: 'ETH',
                decimals: 18,
              },
              rpcUrls: (typeof rpcUrls !== 'undefined' && rpcUrls.length
                ? rpcUrls
                : [rpcUrl]
              ).filter(Boolean),
              blockExplorerUrls: window.AKC_CONFIG?.BLOCK_EXPLORERS || [],
            };
            try {
              await provider.send('wallet_addEthereumChain', [addParams]);
              await provider.send('wallet_switchEthereumChain', [
                { chainId: hexId },
              ]);
            } catch (addErr) {
              console.warn('[access] add/switch chain failed', addErr);
              return false;
            }
          } else {
            console.warn('[access] switch chain failed', switchErr);
            return false;
          }
        }
      }
    }

    // 準備合約清單 + 參數
    const fromOpts = Array.isArray(opts.contract)
      ? opts.contract
      : opts.contract
      ? [opts.contract]
      : [];
    const fromConfig = Array.isArray(window.AKC_CONFIG?.CONTRACT)
      ? window.AKC_CONFIG.CONTRACT
      : window.AKC_CONFIG?.CONTRACT
      ? [window.AKC_CONFIG.CONTRACT]
      : [];
    let contractAddrs = [...fromOpts, ...fromConfig]
      .map((a) => String(a || '').trim())
      .map((a) => {
        try {
          return ethers.utils.getAddress(a);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    // 去重，避免對同一合約重複查詢
    contractAddrs = Array.from(new Set(contractAddrs));
    if (!contractAddrs.length) {
      console.warn(
        '[access] CONTRACT missing/invalid (opts.contract / AKC_CONFIG.CONTRACT)'
      );
      return false;
    }
    const use1155Flag =
      typeof opts.erc1155 === 'boolean'
        ? opts.erc1155
        : typeof window.AKC_CONFIG?.ERC1155 === 'boolean'
        ? window.AKC_CONFIG.ERC1155
        : null;

    const tokenId = opts.tokenId ?? window.AKC_CONFIG?.TOKEN_ID ?? 0;
    const abi165 = ['function supportsInterface(bytes4) view returns (bool)'];
    const abi721 = ['function balanceOf(address owner) view returns (uint256)'];
    const abi1155 = [
      'function balanceOf(address account, uint256 id) view returns (uint256)',
    ];
    const __csKey = contractAddrs.map((a) => a.toLowerCase()).sort();

    //  簡易快取（同位址/鏈別/合約列表/類型/TokenId）
    const __cache = (window.__AKC_ACCESS_CACHE__ =
      window.__AKC_ACCESS_CACHE__ || {});
    const __key = JSON.stringify({
      o: owner.toLowerCase(),
      e: Number(expected || 0),

      cs: __csKey,
      t: Number(tokenId || 0),
      f: use1155Flag,
    });
    const cacheNeg = opts?.cacheNegative ?? false;
    const cacheMs = Number.isFinite(opts?.cacheMs)
      ? Number(opts.cacheMs)
      : 120000;
    if (
      !opts?.force &&
      __cache[__key] &&
      Date.now() - __cache[__key].t < cacheMs
    ) {
      return !!__cache[__key].v;
    }
    //  執行 balanceOf（追蹤 -32603，必要時切 RPC 再試）
    let hadBreaker = false;
    const isBreaker = (e) =>
      e?.code === -32603 ||
      String(e?.message || '')
        .toLowerCase()
        .includes('circuit breaker');

    async function tryWithProvider(p) {
      console.debug('[access] tryWithProvider start');
      for (const addr of contractAddrs) {
        let use1155 = use1155Flag;
        if (use1155 === null) {
          try {
            const d = new ethers.Contract(addr, abi165, p);
            const is1155 = await d.supportsInterface('0xd9b67a26');
            const is721 = await d.supportsInterface('0x80ac58cd');
            if (is1155) use1155 = true;
            else if (is721) use1155 = false;
          } catch (_) {
            /* 無 ERC-165 → 進入雙試 */
          }
        }
        if (use1155 === true) {
          try {
            const c = new ethers.Contract(addr, abi1155, p);
            const bal = await c.balanceOf(owner, tokenId);
            if (bal && bal.gt(0)) return true;
          } catch (e) {
            if (isBreaker(e)) hadBreaker = true;
            try {
              const c2 = new ethers.Contract(addr, abi721, p);
              const bal2 = await c2.balanceOf(owner);
              if (bal2 && bal2.gt(0)) return true;
            } catch (e2) {
              if (isBreaker(e2)) hadBreaker = true;
            }
          }
        } else if (use1155 === false) {
          try {
            const c = new ethers.Contract(addr, abi721, p);
            const bal = await c.balanceOf(owner);
            if (bal && bal.gt(0)) return true;
          } catch (e) {
            if (isBreaker(e)) hadBreaker = true;
            try {
              const c2 = new ethers.Contract(addr, abi1155, p);
              const bal2 = await c2.balanceOf(owner, tokenId);
              if (bal2 && bal2.gt(0)) return true;
            } catch (e2) {
              if (isBreaker(e2)) hadBreaker = true;
            }
          }
        } else {
          try {
            const c = new ethers.Contract(addr, abi721, p);
            const bal = await c.balanceOf(owner);
            if (bal && bal.gt(0)) return true;
          } catch (e) {
            if (isBreaker(e)) hadBreaker = true;
          }
          try {
            const c2 = new ethers.Contract(addr, abi1155, p);
            const bal2 = await c2.balanceOf(owner, tokenId);
            if (bal2 && bal2.gt(0)) return true;
          } catch (e2) {
            if (isBreaker(e2)) hadBreaker = true;
          }
        }
      }
      return false;
    }

    let result = await tryWithProvider(provider);
    // ✅ 若 RPC 已成功且偏好唯讀路徑，直接回傳，避免進入錢包分支造成額外偵測噪音
    if (result && (opts?.preferReadOnly ?? false) && provider === roProvider) {
      __cache[__key] = { t: Date.now(), v: true };
      return true;
    }

    // 若第一輪用 RPC 仍是 false，且有 MetaMask，就再以 MetaMask 試一次（並確保鏈別）
    {
      if (!result && provider === roProvider && mm) {
        if (expected != null) {
          try {
            const net2 = await mm.getNetwork();
            if (Number(net2.chainId) !== Number(expected)) {
              const hexId =
                typeof window.__AKC_chainHex === 'function'
                  ? window.__AKC_chainHex(Number(expected))
                  : '0x' + Number(expected).toString(16);
              try {
                await mm.send('wallet_switchEthereumChain', [
                  { chainId: hexId },
                ]);
              } catch (switchErr) {
                const msg = String(switchErr?.message || '').toLowerCase();
                if (
                  msg.includes('unrecognized chain') ||
                  msg.includes('could not switch')
                ) {
                  const addParams = {
                    chainId: hexId,
                    chainName: window.AKC_CONFIG?.CHAIN_NAME || 'Sepolia',
                    nativeCurrency: window.AKC_CONFIG?.NATIVE_CURRENCY || {
                      name: 'Sepolia ETH',
                      symbol: 'ETH',
                      decimals: 18,
                    },
                    rpcUrls: (typeof rpcUrls !== 'undefined' && rpcUrls.length
                      ? rpcUrls
                      : [rpcUrl]
                    ).filter(Boolean),
                    blockExplorerUrls: window.AKC_CONFIG?.BLOCK_EXPLORERS || [],
                  };
                  await mm.send('wallet_addEthereumChain', [addParams]);
                  await mm.send('wallet_switchEthereumChain', [
                    { chainId: hexId },
                  ]);
                } else {
                  throw switchErr; // 外層 catch 會記錄並繼續以目前鏈別讀取
                }
              }
            }
          } catch (e) {
            console.warn('[access] fallback switch chain failed', e);
            // 不中斷，仍嘗試以目前鏈別讀取
          }
        }
        try {
          result = await tryWithProvider(mm);
        } catch (_) {}
      }
    }
    if (result || (cacheNeg && !hadBreaker)) {
      __cache[__key] = { t: Date.now(), v: !!result };
    }

    return !!result;
  } catch (err) {
    console.warn('[access] checkHasNFT error:', err);
    return false;
  }
};
