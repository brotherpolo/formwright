// Date and time boxes open their calendar or clock wherever they're clicked, not only on the small
// icon at the end: nobody has to type a date. Covers every date, date-and-time, time, month and
// week box in Formwright (form fields, filters, dashboard periods, automations…), including ones
// drawn later. Typing still works for anyone using the keyboard.
const PICK = new Set(['date', 'datetime-local', 'time', 'month', 'week']);
export const opensPicker = (el) => !!el && el.tagName === 'INPUT' && PICK.has(el.type) && !el.disabled && !el.readOnly;

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!opensPicker(t) || typeof t.showPicker !== 'function') return;
    try { t.showPicker(); } catch (err) { /* already open, or the browser won't from here: the icon still works */ }
  });
}
