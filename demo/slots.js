// Availability = Chris's posted hours − bookings − Apple Calendar busy − blocks − min notice.
// Pure: everything it needs comes in as arguments, so it's easy to test.
import { addDays, hhmmToMin, weekday, zonedToUtc, TZ } from "./time.js";

                                                     // "09:00"–"18:00" local
                     
                                                            
                                                                            
  
                     
                                              
                                                                  
                                                       
                                           
  
                                                  

export function windowsFor(date        , hours       )           {
  return hours.overrides[date] ?? hours.weekly[weekday(date)] ?? [];
}

export function overlaps(s        , e        , busy        , bufferMs = 0)          {
  for (const b of busy) if (s < b.end + bufferMs && e + bufferMs > b.start) return true;
  return false;
}

export function computeSlots(opts   
                                                  
                                                                     
 )                                      {
  const { from, durationMin, hours, rules, busy, now } = opts;
  const tz = opts.tz ?? TZ;
  const step = Math.max(5, rules.stepMin);
  const earliest = now + rules.minNoticeMin * 60000;
  const horizon = now + rules.maxDaysOut * 86400000;
  const buf = rules.bufferMin * 60000;
  const out                                      = [];

  for (let i = 0; i < opts.days; i++) {
    const date = addDays(from, i);
    const slots           = [];
    for (const w of windowsFor(date, hours)) {
      const ws = hhmmToMin(w.start), we = hhmmToMin(w.end);
      for (let m = ws; m + durationMin <= we; m += step) {
        const s = zonedToUtc(date, m, tz);
        const e = s + durationMin * 60000;
        if (s < earliest || s > horizon) continue;
        if (overlaps(s, e, busy, buf)) continue;
        slots.push(s);
      }
    }
    out.push({ date, slots });
  }
  return out;
}
