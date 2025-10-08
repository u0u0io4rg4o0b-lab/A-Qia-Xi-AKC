// public/JS/config.js
// 把專案的全域設定集中在這裡：合約地址、鏈 ID、IPFS Gateway

window.AKC = window.AKC || {};

(function () {
  window.AKC_CONFIG = {
    // ✅ 換成你已部署好的合約地址（與 Etherscan/區塊瀏覽器一致）
    CONTRACT: '0x84340763cBa98a3bc4521DBd5A734054DC6Fd657',

    CHAIN_NAME: 'Sepolia',
    NATIVE_CURRENCY: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    RPC_URLS: {
      11155111: '',
    },

    // ✅ 目標鏈 ID：例 Sepolia=11155111，主網=1，Base=8453，Polygon=137...
    CHAIN_ID: 11155111,
    // ✅ 這兩個是給 checkAccess.js 用的：false=明確 721；true=明確 1155；未設=自動探測
    ERC1155: false,
    // ✅ 若為 1155，指定要查的 TokenId；若為 721 可忽略
    TOKEN_ID: 0,
    // ✅ IPFS Gateway（可換成 Cloudflare 或自家 Gateway）
    IPFS_GATEWAY: 'https://ipfs.io/ipfs/',

    // 建議：先用你自己的 Infura/Alchemy/Ankr 節點；封測可暫時用公共端點
    RPC_URL: '',

    WALLETCONNECT_PROJECT_ID: 'ae03c9bd2f3c4b1b32747f7ceef9cf20',
  };
  // 小工具：把 ipfs:// 轉成瀏覽器可用的 HTTP
  window.AKC.toGateway = function (u) {
    if (!u) return u;
    return u.startsWith('ipfs://')
      ? u.replace(/^ipfs:\/\//, window.AKC_CONFIG.IPFS_GATEWAY)
      : u;
  };

  // 小工具：全站 Provider 工廠（優先唯讀，其次 MetaMask，最後回唯讀）
  AKC.getProvider = function (preferReadOnly = true) {
    // ① 優先唯讀 RPC（最穩定）
    const __chainId = Number(window.AKC_CONFIG.CHAIN_ID || 11155111);
    const __name = __chainId === 11155111 ? 'sepolia' : 'unknown';

    if (preferReadOnly && window.AKC_CONFIG.RPC_URL) {
      const ro = new ethers.providers.StaticJsonRpcProvider(
        window.AKC_CONFIG.RPC_URL,
        { name: __name, chainId: __chainId }
      );
      // --- AKC 統一「RPC 形狀保險」：把 {method, params} 自動攤平成 ('method',[...]) ---
      const _origSend = ro.send.bind(ro);
      ro.send = async (method, params = []) => {
        if (
          typeof method !== 'string' &&
          method &&
          typeof method.method === 'string'
        ) {
          const m = method.method;
          const p = Array.isArray(method.params) ? method.params : [];
          if (window.AKC_DEBUG_RPC) {
            console.warn('[AKC rpc normalized]', m, p);
            console.trace();
          }
          return _origSend(m, p);
        }
        if (window.AKC_DEBUG_RPC && typeof method !== 'string') {
          console.error('[RPC misuse] provider.send 需要 method=字串', method);
          console.trace();
          throw new Error(
            'provider.send(method, params[]) 的 method 必須是字串'
          );
        }
        if (window.AKC_DEBUG_RPC) console.debug('[rpc/send]', method, params);
        return _origSend(method, params);
      };
      return ro;
    }
    // ② 使用者已安裝/解鎖 MetaMask 時
    if (window.ethereum) {
      return new ethers.providers.Web3Provider(window.ethereum);
    }
    // ③ 仍可退回唯讀 RPC（即使 preferReadOnly=false）
    if (window.AKC_CONFIG.RPC_URL) {
      return new ethers.providers.JsonRpcProvider(
        window.AKC_CONFIG.RPC_URL,
        { name: __name, chainId: __chainId } // ★ 同上
      );
    }
    throw new Error(
      '[AKC] No provider available: please set AKC_CONFIG.RPC_URL'
    );
  };

  Object.freeze(window.AKC_CONFIG);

  // === AKC.ipfs: 多網關 + 逾時退避（全域工具） ===
  AKC.ipfs = (function () {
    const GATEWAYS = [
      'https://cloudflare-ipfs.com/ipfs/',
      'https://ipfs.io/ipfs/',
      'https://dweb.link/ipfs/',
    ];
    const pick = (uriOrCid) => String(uriOrCid || '').replace(/^ipfs:\/\//, '');
    async function withTimeout(url, ms = 6000) {
      const ctrl = new AbortController();
      const id = setTimeout(() => ctrl.abort('timeout'), ms);
      try {
        const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r;
      } finally {
        clearTimeout(id);
      }
    }
    return {
      async loadJson(uriOrCid) {
        const cid = pick(uriOrCid);
        let err;
        for (const g of GATEWAYS) {
          try {
            const r = await withTimeout(g + cid);
            return await r.json();
          } catch (e) {
            err = e;
          }
        }
        throw err || new Error('All gateways failed for ' + uriOrCid);
      },
      async loadImage(uriOrCid) {
        const cid = pick(uriOrCid);
        for (const g of GATEWAYS) {
          try {
            const r = await withTimeout(g + cid);
            return URL.createObjectURL(await r.blob());
          } catch (e) {}
        }
        return null;
      },
    };
  })();
})();

AKC.bus = AKC.bus || {
  on: (type, handler) => document.addEventListener(type, handler),
  emit: (type, detail) =>
    document.dispatchEvent(new CustomEvent(type, { detail })),
};
window.AKC = window.AKC || {};
window.AKC.features = Object.assign({}, window.AKC.features, {
  authModal: true,
});
