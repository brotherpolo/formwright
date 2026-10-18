// People's avatars across Formwright: their Google photo (saved on their profile when they sign in
// with Google) over their initials. A photo that won't load is removed, leaving the initials.
import { store } from './store.js';
import { avatarHTML, photoSrc } from './commentlogic.js';

const failed = new Set();
if (typeof document !== 'undefined') {
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('av-pic')) { failed.add(t.getAttribute('src')); t.remove(); }
  }, true);
}
/** Their photo address, if they have one that has loaded (or hasn't failed yet). */
export function photoOf(uid) {
  const src = photoSrc(store.profiles?.[uid]?.photoURL);
  return src && !failed.has(src) ? src : '';
}
/** A person's avatar: personAv(uid, name, { small, cls }). Roles get their ◉. */
export function personAv(uid, name, opts = {}) {
  if (String(uid || '').startsWith('role:')) return `<span class="cm-av${opts.small ? ' sm' : ''} pk-ic" aria-hidden="true">◉</span>`;
  return avatarHTML(uid, name, { ...opts, photo: photoOf(uid) });
}
