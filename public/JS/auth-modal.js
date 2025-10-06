/* AKC Authentication Modal
 * 監聽 ui:auth:open，顯示 Passkey／Email/社交／錢包 三種登入選擇。
 * 選定後透過 AKC.bus.emit 發出對應事件，再關閉彈窗。
 */
(function () {
  function __akc_wait_for_bus_and_init(retry = 0) {
    const bus = window.AKC?.bus;
    const modal = ensureModal(); // 先確保 DOM 存在
    if (!bus) {
      if (retry < 20) {
        // 最多重試 20 次（約 6 秒）
        setTimeout(() => __akc_wait_for_bus_and_init(retry + 1), 300);
      } else {
        console.warn(
          '[auth-modal] AKC bus not ready after retries; modal DOM created but not bound.'
        );
      }
      return;
    }
    bindModal(modal, bus); // 綁定一次就好
  }

  function ensureModal() {
    let modal = document.getElementById('akc-auth-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'akc-auth-modal';
    modal.className = 'fixed inset-0 z-50 hidden';
    modal.innerHTML = `
      <div class="fixed inset-0 bg-black bg-opacity-50"></div>
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 max-w-sm w-11/12 md:w-full rounded-lg shadow-lg pointer-events-auto p-6" role="dialog" aria-modal="true" aria-label="登入選擇">
          <h2 class="text-xl font-bold mb-4">選擇登入方式</h2>
          <div class="flex flex-col space-y-3">
            <button id="akc-auth-passkey" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring">Passkey 快速登入</button>
            <button id="akc-auth-social" class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring">Email/社交登入</button>
            <button id="akc-auth-wallet" data-wallet="connect" class="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring">錢包登入</button>
            <button id="akc-auth-close" class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white focus:outline-none underline">取消</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function showModal(modal) {
    modal.classList.remove('hidden');
  }
  function hideModal(modal) {
    modal.classList.add('hidden');
  }

  function bindModal(modal, bus) {
    if (modal.dataset.bound === '1') return;
    const overlay = modal.querySelector('.bg-black');
    overlay?.addEventListener('click', () => hideModal(modal));
    modal.querySelector('#akc-auth-close')?.addEventListener('click', (e) => {
      e.preventDefault();
      hideModal(modal);
    });
    modal.querySelector('#akc-auth-passkey')?.addEventListener('click', (e) => {
      e.preventDefault();
      bus.emit('auth:login:passkey');
      hideModal(modal);
    });
    modal.querySelector('#akc-auth-social')?.addEventListener('click', (e) => {
      e.preventDefault();
      bus.emit('auth:login:social');
      hideModal(modal);
    });
    modal.querySelector('#akc-auth-wallet')?.addEventListener('click', (e) => {
      e.preventDefault();
      bus.emit('auth:login:wallet');
      hideModal(modal);
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !modal.classList.contains('hidden')) {
        ev.preventDefault();
        hideModal(modal);
      }
    });
    modal.dataset.bound = '1';
  }

  // 提供一個可手動叫用的 API（測試好用）
  window.AKC = window.AKC || {};
  window.AKC.ui = Object.assign({}, window.AKC.ui, {
    openAuthModal: () => {
      const m = ensureModal();
      m.classList.remove('hidden');
      m.querySelector('#akc-auth-passkey')?.focus();
    },
    closeAuthModal: () => {
      const m = ensureModal();
      m.classList.add('hidden');
    },
  });

  // 等 DOM 準備好就啟動重試程序
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () =>
      __akc_wait_for_bus_and_init()
    );
  } else {
    __akc_wait_for_bus_and_init();
  }
  // 另：就算事件先被 emit，也能手動叫出
  document.addEventListener(
    'ui:auth:open',
    () => window.AKC.ui.openAuthModal(),
    {
      // 放在 openAuthModal 一旁
      closeAuthModal: () => {
        const m = ensureModal();
        m.classList.add('hidden');
      },

      once: false,
    }
  );
})();
