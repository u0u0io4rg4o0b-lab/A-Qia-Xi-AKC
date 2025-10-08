import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js';

const auth = getAuth();
const provider = new GoogleAuthProvider();
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const bus = window.AKC?.bus;
if (bus) {
  bus.on('auth:login:social', async () => {
    try {
      if (isMobile) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
      bus.emit('auth:login:success', { provider: 'google' });
    } catch (e) {
      bus.emit('auth:login:fail', e);
    }
  });
}
