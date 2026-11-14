// Inlezen en samenvatten van ritten. Geen DOM-afhankelijkheden, zodat dit ook in Node te testen is.

export const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const MONTHS_LONG = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

// Kolomnamen uit de Strava-export (Engels en Nederlands) plus gangbare eigen namen.
const COLUMNS = {
  id: ['activity id', 'activiteits-id', 'activiteit-id', 'id'],
  date: ['activity date', 'datum van activiteit', 'activiteitsdatum', 'date', 'datum', 'start time', 'starttijd'],
  name: ['activity name', 'naam activiteit', 'naam van activiteit', 'name', 'naam', 'title', 'titel'],
  type: ['activity type', 'activiteitstype', 'type activiteit', 'type', 'sport'],
  distance: ['distance', 'afstand', 'distance (km)', 'afstand (km)', 'km'],
  moving: ['moving time', 'beweegtijd', 'bewegingstijd', 'tijd in beweging'],
  elapsed: ['elapsed time', 'verstreken tijd', 'time', 'tijd', 'duration', 'duur'],
  elevation: ['elevation gain', 'hoogteverschil', 'hoogtewinst', 'hoogtemeters', 'stijging', 'elevation'],
};

const RIDE_PATTERN = /ride|fiets|bike|cycl|velo|rit\b|biking/i;

export function isRide(type) {
  return !type || RIDE_PATTERN.test(type);
}

/** CSV naar rijen van cellen. Ondersteunt aanhalingstekens en herkent , of ; als scheidingsteken. */
export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/** "25,31", "25.31", "1.234,5" en "1,234.5" naar een getal. */
export function parseNumber(value) {
  if (value == null) return NaN;
  let s = String(value).trim().replace(/[^\d.,-]/g, '');
  if (s === '') return NaN;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma > -1 && dot > -1) {
    s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (comma > -1) {
    s = s.replace(',', '.');
  }
  return Number(s);
}

/** Seconden uit "5025", "1:23:45" of "83:45". */
export function parseDuration(value) {
  if (value == null) return NaN;
  const s = String(value).trim();
  if (s.includes(':')) {
    const parts = s.split(':').map(Number);
    if (parts.some(Number.isNaN)) return NaN;
    return parts.reduce((total, p) => total * 60 + p, 0);
  }
  return parseNumber(s);
}

const NL_MONTHS = { jan: 0, feb: 1, mrt: 2, maa: 2, mar: 2, apr: 3, mei: 4, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, dec: 11 };

/** Datum uit ISO, Strava-Engels ("Jan 5, 2024, 8:12:33 AM"), Strava-Nederlands ("5 jan. 2024 08:12:33") of dd-mm-jjjj. */
export function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{1,2})[\s.]+([a-zA-Z]{3})[a-z]*\.?,?\s+(\d{4})(?:[,\s]+(?:om\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m && m[2].toLowerCase() in NL_MONTHS) {
    return new Date(+m[3], NL_MONTHS[m[2].toLowerCase()], +m[1], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0));
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[,\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function findColumn(header, names) {
  for (const name of names) {
    const i = header.indexOf(name); // eerste voorkomen: in de Strava-export is dat de afstand in km
    if (i > -1) return i;
  }
  return -1;
}

/**
 * Ritten uit een CSV (Strava `activities.csv` of een eigen bestand met minstens datum en afstand in km).
 * Geeft { activities, skipped } terug; andere sporten dan fietsen worden overgeslagen.
 */
export function activitiesFromCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('Het bestand bevat geen ritten.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([key, names]) => [key, findColumn(header, names)]));
  if (col.date < 0 || col.distance < 0) {
    throw new Error('Geen kolom voor datum en/of afstand gevonden. Verwacht bijvoorbeeld "Activity Date" en "Distance".');
  }
  const activities = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const type = col.type > -1 ? row[col.type]?.trim() : '';
    const date = parseDate(row[col.date]);
    const distanceKm = parseNumber(row[col.distance]);
    if (!date || !Number.isFinite(distanceKm) || !isRide(type)) { skipped++; continue; }
    const moving = parseDuration(col.moving > -1 ? row[col.moving] : undefined);
    const elapsed = parseDuration(col.elapsed > -1 ? row[col.elapsed] : undefined);
    const elevation = parseNumber(col.elevation > -1 ? row[col.elevation] : undefined);
    activities.push({
      id: (col.id > -1 && row[col.id]?.trim()) || `${date.toISOString()}|${distanceKm.toFixed(2)}`,
      date: date.toISOString(),
      name: (col.name > -1 && row[col.name]?.trim()) || 'Rit',
      type: type || 'Rit',
      distanceKm,
      movingSec: Number.isFinite(moving) ? moving : Number.isFinite(elapsed) ? elapsed : 0,
      elevationM: Number.isFinite(elevation) ? elevation : 0,
    });
  }
  return { activities, skipped };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/** Eén rit uit een GPX-track: afstand, hoogtemeters en tijd in beweging uit de trackpunten. */
export function activityFromGPX(text, fallbackName = 'GPX-rit') {
  const points = [];
  const re = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
  let m;
  while ((m = re.exec(text))) {
    const lat = parseFloat(m[1].match(/lat="([^"]+)"/)?.[1]);
    const lon = parseFloat(m[1].match(/lon="([^"]+)"/)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const body = m[2] || '';
    const ele = parseFloat(body.match(/<ele>([^<]+)<\/ele>/)?.[1]);
    const time = Date.parse(body.match(/<time>([^<]+)<\/time>/)?.[1]);
    points.push({ lat, lon, ele, time });
  }
  if (points.length < 2) throw new Error('Geen track met punten gevonden in het GPX-bestand.');

  let distanceKm = 0;
  let movingSec = 0;
  let elevationM = 0;
  let lastEle = points.find((p) => Number.isFinite(p.ele))?.ele;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = haversineKm(a.lat, a.lon, b.lat, b.lon);
    distanceKm += d;
    const dt = (b.time - a.time) / 1000;
    // Stilstand (pauzes, stoplichten) telt niet mee: onder ~1 km/u of gaten van meer dan een minuut.
    if (dt > 0 && dt <= 60 && d / dt > 0.0003) movingSec += dt;
    // Drempel van 2 m dempt GPS-ruis in de hoogte.
    if (Number.isFinite(b.ele) && Math.abs(b.ele - lastEle) >= 2) {
      if (b.ele > lastEle) elevationM += b.ele - lastEle;
      lastEle = b.ele;
    }
  }
  const start = points.find((p) => Number.isFinite(p.time))?.time
    ?? Date.parse(text.match(/<metadata>[\s\S]*?<time>([^<]+)<\/time>/)?.[1]);
  if (!Number.isFinite(start)) throw new Error('Het GPX-bestand bevat geen tijdstippen, dus de maand is onbekend.');
  const trk = text.match(/<trk>([\s\S]*?)<trkseg/)?.[1] || '';
  const name = trk.match(/<name>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/name>/)?.[1]?.trim();
  const date = new Date(start).toISOString();
  return {
    id: `${date}|${distanceKm.toFixed(2)}`,
    date,
    name: name || fallbackName,
    type: 'Rit',
    distanceKm,
    movingSec,
    elevationM,
  };
}

/** Voegt ritten samen; een rit met een al bekend id vervangt de oude. Gesorteerd op datum. */
export function mergeActivities(existing, incoming) {
  const byId = new Map(existing.map((a) => [a.id, a]));
  for (const a of incoming) byId.set(a.id, a);
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function yearsOf(activities) {
  return [...new Set(activities.map((a) => new Date(a.date).getFullYear()))].sort((a, b) => b - a);
}

const emptyTotals = () => ({ rides: 0, distanceKm: 0, movingSec: 0, elevationM: 0 });

function add(totals, a) {
  totals.rides += 1;
  totals.distanceKm += a.distanceKm;
  totals.movingSec += a.movingSec;
  totals.elevationM += a.elevationM;
}

/** Twaalf maandtotalen voor een jaar. */
export function aggregateByMonth(activities, year) {
  const months = Array.from({ length: 12 }, emptyTotals);
  for (const a of activities) {
    const d = new Date(a.date);
    if (d.getFullYear() === year) add(months[d.getMonth()], a);
  }
  return months;
}

/** Totalen voor een jaar, optioneel alleen t/m een bepaalde dag (maand 0-11, dag 1-31). */
export function totalsFor(activities, year, until) {
  const totals = emptyTotals();
  for (const a of activities) {
    const d = new Date(a.date);
    if (d.getFullYear() !== year) continue;
    if (until && (d.getMonth() > until.month || (d.getMonth() === until.month && d.getDate() > until.day))) continue;
    add(totals, a);
  }
  return totals;
}

/** Voorbeeldritten over drie jaar, met een vaste seed zodat het dashboard er steeds hetzelfde uitziet. */
export function demoActivities(today = new Date()) {
  let seed = 20240607;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const season = [0.35, 0.4, 0.65, 0.9, 1.15, 1.25, 1.3, 1.2, 1.0, 0.7, 0.45, 0.35];
  const names = ['Rondje polder', 'Ochtendrit', 'Koffierit', 'Dijkenronde', 'Avondrondje', 'Heuvelrit', 'Lange duurrit'];
  const out = [];
  const endYear = today.getFullYear();
  for (let year = endYear - 2; year <= endYear; year++) {
    const growth = 1 + (year - (endYear - 2)) * 0.12;
    for (let month = 0; month < 12; month++) {
      const rides = Math.round(season[month] * growth * (7 + rnd() * 4));
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let i = 0; i < rides; i++) {
        const date = new Date(year, month, 1 + Math.floor(rnd() * daysInMonth), 7 + Math.floor(rnd() * 12), Math.floor(rnd() * 60));
        if (date > today) continue;
        const long = rnd() < 0.2;
        const distanceKm = (long ? 80 : 30) + rnd() * (long ? 60 : 35);
        const speed = 24 + rnd() * 6;
        out.push({
          id: `demo-${year}-${month}-${i}`,
          date: date.toISOString(),
          name: names[Math.floor(rnd() * names.length)],
          type: 'Rit',
          distanceKm,
          movingSec: Math.round((distanceKm / speed) * 3600),
          elevationM: Math.round(distanceKm * (2 + rnd() * 7)),
        });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
