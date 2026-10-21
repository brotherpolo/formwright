// What Settings → Dates and time shows before saving: today, this week, this quarter and this
// year under the calendar being set up. Pure functions, unit-tested.
import { normalizeCal, withCalendar, MONTH, dayName, spanName, bucketName, fyOf } from './cal.js';
import { periodRange } from './dashlogic.js';

export { normalizeCal, withCalendar, MONTH };

/** { rows: [[label, text]], fyExample } for a calendar at `now`. */
export function periodRangeFor(cal, now) {
  return withCalendar(cal, () => {
    const c = normalizeCal(cal);
    const w = periodRange('week', now), q = periodRange('quarter', now), y = periodRange('year', now);
    const e = fyOf(now);
    const fy = c.fyStart === 1 ? 'the year runs January to December' : `FY${e} runs ${MONTH[c.fyStart - 1]} ${e - 1} to ${MONTH[(c.fyStart + 10) % 12]} ${e}`;
    return {
      rows: [
        ['Today', dayName(now, { weekday: true })],
        ['This week', spanName(w.from, w.to)],
        ['This quarter', `${bucketName(q.from, 'quarter')}: ${spanName(q.from, q.to)}`],
        ['This year', `${bucketName(y.from, 'year')}: ${spanName(y.from, y.to)}`],
      ],
      fyExample: fy,
    };
  });
}
