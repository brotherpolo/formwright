// Entry point: waits for Firebase Auth, sets up the account, then starts the app.
import { onAuthStateChanged } from 'firebase/auth';
import { auth, configured } from './firebase.js';
import { ensureAccount, startData, stopData } from './store.js';
import { showAuth, hideAuth } from './auth.js';
import { startApp, stopApp } from './app.js';
import { $, esc } from './ui.js';
import { installProblems } from './problems.js';
import { installOffline } from './offline.js';

// what goes wrong in this browser is reported to Settings → Problems (problems.js)
installProblems({ title: () => document.getElementById('topttl')?.textContent || '' });
installOffline(); // the bar when there's no signal, and syncing afterwards (offline.js)

if (!configured) {
  showAuth();
} else {
  onAuthStateChanged(auth, async (user) => {
    stopApp();
    stopData();
    if (!user) {
      showAuth();
      return;
    }
    hideAuth();
    const boot = $('#boot');
    boot.hidden = false;
    boot.textContent = 'Loading your forms…';
    try {
      await ensureAccount(user);
    } catch (e) {
      console.error('[formwright] account setup failed', e);
      boot.innerHTML = !navigator.onLine || e?.code === 'unavailable'
        ? `<div class="panel empty"><h2>You’re offline</h2><p>The first time on this device, Formwright needs a connection to fetch your forms. After that it opens with no signal.</p><button class="btn" data-act="reload-boot">Try again</button></div>`
        : `<div class="panel empty"><h2>Your account couldn’t be set up</h2><p>${
        e?.code === 'permission-denied'
          ? 'The database refused the request. Check that the security rules from the Cadence folder have been deployed.'
          : 'Check your connection and reload the page.'
      }</p><p class="help">${esc(e?.code || '')}</p><button class="btn" data-act="sign-out-boot">Sign out</button></div>`;
      return;
    }
    startApp();
    startData(user);
    // offline and nothing saved on this device yet: say so rather than loading forever
    setTimeout(() => { if (!navigator.onLine && !boot.hidden && /Loading/.test(boot.textContent)) boot.innerHTML = '<div class="panel empty"><h2>You’re offline</h2><p>Your forms haven’t been saved on this device yet. Open Formwright once with a signal, and after that it works offline.</p></div>'; }, 8000);
  });
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-act="sign-out-boot"]')) auth.signOut();
  if (e.target.closest('[data-act="reload-boot"]')) location.reload();
});
