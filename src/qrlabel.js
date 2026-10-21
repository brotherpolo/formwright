// A record's QR code (⋯ More → QR code): a label with the code, the form and the record's title,
// to print and stick on a binder, a machine or a site box. Scanning it opens the record in
// Formwright; whoever scans signs in first and sees it only if they're allowed to.
// The code itself is made by qr.js, here in the browser; nothing is sent anywhere.

import { qrSvg } from './qr.js';
import { esc, toast } from './ui.js';

/** The record's web address: this Formwright, #/record/<id>. */
export function recordUrl(recId, loc = typeof location !== 'undefined' ? location : { origin: '', pathname: '/' }) {
  return loc.origin + loc.pathname + '#/record/' + encodeURIComponent(recId);
}

/** The dialog: the label as it prints, and what to do with it. */
export function qrDialogHTML({ url, title, formName, item = 'record', badgeHTML }) {
  const svg = qrSvg(url, { size: 168, label: 'QR code for ' + title });
  return `<div class="lv-scrim qr-scrim" data-act="qr-scrim"><div class="lv-dlg qr-dlg" role="dialog" aria-modal="true" aria-labelledby="qr-h" data-stop-scrim="1">
    <div class="qr-top"><h2 id="qr-h">QR code</h2><button type="button" class="ibtn" data-act="qr-close" aria-label="Close">✕</button></div>
    <p class="help">Print it and stick it where people need this ${esc(String(item).toLowerCase())}. A phone’s camera opens it in Formwright. Whoever scans it signs in first, and only sees it if they’re allowed to.</p>
    <div class="qr-label" id="qr-label">
      <div class="qr-code">${svg}</div>
      <div class="qr-txt"><span class="qr-form">${badgeHTML}<span>${esc(formName)}</span></span><b class="qr-title">${esc(title)}</b><span class="qr-hint">Scan to open in Formwright</span></div>
    </div>
    <div class="qr-acts"><button type="button" class="btn primary" data-act="qr-print">Print label</button><button type="button" class="btn" data-act="qr-png">Download image</button><button type="button" class="btn" data-act="qr-copy">Copy link</button></div>
  </div></div>`;
}

/** Print just the label (the rest of the page is hidden while printing). */
export function printLabel() {
  const root = document.documentElement;
  root.classList.add('qr-printing');
  const done = () => { root.classList.remove('qr-printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500); // some browsers don't send afterprint
}

/** The code as a large PNG, for label printers and documents. */
export function downloadPng(url, title) {
  const svg = qrSvg(url, { size: 1024, label: title });
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, 1024, 1024);
    c.toBlob((blob) => {
      if (!blob) { toast('That image couldn’t be made. Try Print label instead.'); return; }
      const a = document.createElement('a'), href = URL.createObjectURL(blob);
      a.href = href; a.download = (String(title || 'Record').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Record') + ' QR.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
      toast('Downloaded the QR code');
    }, 'image/png');
  };
  img.onerror = () => toast('That image couldn’t be made. Try Print label instead.');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** Copy a link, falling back to showing it when the clipboard isn't available. */
export async function copyText(text, done = 'Link copied') {
  try { await navigator.clipboard.writeText(text); toast(done); return true; } catch (e) {
    try {
      const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove();
      if (ok) { toast(done); return true; }
    } catch (e2) { /* no clipboard at all */ }
    toast('Couldn’t copy. The link is: ' + text);
    return false;
  }
}
