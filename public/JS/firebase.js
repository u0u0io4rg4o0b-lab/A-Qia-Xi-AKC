// ✅ Firebase 設定與初始化（非模組版）
// ✅ 步驟1：先定義 firebaseConfig

const firebaseConfig = {
  apiKey: 'AIzaSyB_E2Rc5U8PBl6fQ9hJ8UFMYugNyW-_CfA', // gitleaks:allow Firebase web client key (client-visible by design)
  authDomain: 'akashic-library-test.firebaseapp.com',
  projectId: 'akashic-library-test',
  storageBucket: 'akashic-library-test.firebasestorage.app',
  messagingSenderId: '166633950693',
  appId: '1:166633950693:web:a0dd1140032ae821fff30c',
  measurementId: 'G-TV3RXYW24K',
};

// ✅ 步驟2：初始化 Firebase（只能呼叫一次）
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// 只有在 auth-compat 已載入的情況下才呼叫 firebase.auth()
if (typeof firebase.auth === 'function') {
  firebase.auth().onAuthStateChanged((u) => {
    if (!u) firebase.auth().signInAnonymously().catch(console.error);
  });
} else {
  console.warn(
    '[firebase.js] firebase.auth 未載入；請確認已引入 auth-compat 並在它之後載入 firebase.js'
  );
}

const db = window.db || firebase.firestore();
const storage =
  firebase?.storage && typeof firebase.storage === 'function'
    ? firebase.storage()
    : null; // 沒載 storage-compat 時保持 null
window.storage = storage;

window.db = db;
window.storage = storage;

// ✅（選擇性）如果你有使用者儲存函式也掛上

function saveUserData(address, nickname) {
  const id = (address || '').toLowerCase().trim();
  if (!id) throw new Error('無效地址');
  const users = window.db.collection('users');
  const ref = users.doc(id);
  const data = { updatedAt: Date.now() };
  if (nickname && nickname.trim()) {
    data.nickname = nickname.trim();
  }
  return ref.set(data, { merge: true });
}

window.checkLogin = async function () {
  const address = sessionStorage.getItem('walletAddress');
  const isLoggedIn = sessionStorage.getItem('isLoggedIn') === 'true';

  if (address && isLoggedIn) {
    return address; // 可以改成回傳更完整的 user 物件
  } else {
    throw new Error('尚未登入');
  }
};

window.saveUserData = saveUserData;
console.log('✅ Firebase 初始化完成');
