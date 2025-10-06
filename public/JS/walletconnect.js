// walletconnect.js — 支援其他錢包連線（WalletConnect v2）

// 此檔為最小封測版本，提供一個 EIP‑1193 兼容 provider，
// 讓沒有 MetaMask 擴充的使用者也能透過 WalletConnect 連線您的 dApp。
// 它採用 WalletConnect v2 的 EthereumProvider，請確保專案中已安裝
// `@walletconnect/ethereum-provider` 並在 AKC_CONFIG 中配置 WALLETCONNECT_PROJECT_ID。
//
// 使用範例：
//   const wcResult = await AKC.walletconnect.connect();
//   console.log(wcResult.address); // 已連線帳號
//   // wcResult.provider 可以傳入 ethers.js 或 web3.js 進一步簽名或交易

(function () {
  // 避免重覆初始化
  if (window.__INIT_WALLETCONNECT__) return;
  window.__INIT_WALLETCONNECT__ = true;

  // 建立全域命名空間
  window.AKC = window.AKC || {};
  AKC.walletconnect = AKC.walletconnect || {};

  // 緩存 provider，避免重複初始化
  let wcProvider = null;

  /**
   * 動態載入 WalletConnect EthereumProvider。若已載入則直接使用。
   * @returns {Promise<any>} EthereumProvider 類別
   */
  async function loadEthereumProvider() {
    if (window.WalletConnectEthereumProvider) {
      return window.WalletConnectEthereumProvider;
    }
    try {
      const mod = await import(
        /* webpackIgnore: true */ '@walletconnect/ethereum-provider'
      );
      return mod.default || mod.EthereumProvider || mod;
    } catch (e) {
      // 🔁 純前端環境走 CDN 後備（UMD）
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src =
          'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider/dist/umd/index.min.js';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () =>
          reject(new Error('無法載入 WalletConnect Provider（CDN）'));
        document.head.appendChild(s);
      });
      if (window.WalletConnectEthereumProvider)
        return window.WalletConnectEthereumProvider;
      throw new Error(
        '無法載入 WalletConnect Provider，請確認已安裝或可訪問 CDN'
      );
    }
  }

  /**
   * 確保 WalletConnect provider 已初始化。
   * 傳回 EIP‑1193 兼容 provider（可傳給 ethers.js）。
   * @returns {Promise<any>} provider 實例
   */
  async function ensureWalletConnectProvider() {
    if (wcProvider) return wcProvider;
    const projectId = window.AKC_CONFIG?.WALLETCONNECT_PROJECT_ID;
    if (!projectId) {
      throw new Error('缺少 WALLETCONNECT_PROJECT_ID，請在 AKC_CONFIG 中設定');
    }
    const chainId = Number(window.AKC_CONFIG?.CHAIN_ID || '1');
    const EthereumProvider = await loadEthereumProvider();
    // 依 WalletConnect v2 規範初始化 provider
    wcProvider = await EthereumProvider.init({
      projectId: projectId,
      chains: [chainId],
      // 若提供 RPC_URLS，將映射至對應鏈 ID
      rpcMap: window.AKC_CONFIG?.RPC_URLS
        ? { [chainId]: window.AKC_CONFIG.RPC_URLS[0] }
        : undefined,
      showQrModal: true, // 桌機顯示 QR code 掃描
    });
    // 監聽核心事件並轉發至 AKC.bus（如果有）
    wcProvider.on('connect', (info) => {
      try {
        const [address] = info.accounts || [];
        if (address && window.AKC?.bus) {
          AKC.bus.emit('wallet:connected', { address: address.toLowerCase() });
        }
      } catch (_) {}
    });
    wcProvider.on('disconnect', () => {
      if (window.AKC?.bus) AKC.bus.emit('wallet:disconnected');
    });
    wcProvider.on('accountsChanged', (accounts) => {
      if (window.AKC?.bus) {
        const next = (accounts?.[0] || '').toLowerCase();
        AKC.bus.emit('wallet:accountChanged', { address: next });
      }
    });
    wcProvider.on('chainChanged', (hexId) => {
      if (window.AKC?.bus) {
        AKC.bus.emit('wallet:chainChanged', { chainId: hexId });
      }
    });
    return wcProvider;
  }

  /**
   * 使用 WalletConnect 連線並回傳 provider/signer/address
   * @param {Object} opts - 可留空。預留未來擴充用。
   */
  AKC.walletconnect.connect = async function (opts = {}) {
    const providerWC = await ensureWalletConnectProvider();
    // enable 會顯示 QR modal（桌機）或觸發 deeplink（行動）
    const accounts = await providerWC.request({
      method: 'eth_requestAccounts',
    });

    // 建立 ethers provider 以便後續操作
    if (typeof ethers === 'undefined' || !ethers.providers?.Web3Provider) {
      throw new Error('ethers library not loaded');
    }
    const ethersProvider = new ethers.providers.Web3Provider(providerWC, 'any');
    const signer = ethersProvider.getSigner();
    const address = await signer.getAddress();
    return { provider: ethersProvider, signer, address };
  };

  /**
   * 斷開 WalletConnect 連線
   */
  AKC.walletconnect.disconnect = async function () {
    if (!wcProvider) return;
    try {
      await wcProvider.disconnect();
    } catch (_) {}
    wcProvider = null;
  };

  // 將 provider 取得函式暴露，便於自訂用
  AKC.walletconnect.getProvider = ensureWalletConnectProvider;
})();
