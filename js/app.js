import {
  MONTHS_LONG, activitiesFromCSV, activityFromGPX, aggregateByMonth, demoActivities,
  mergeActivities, totalsFor, yearsOf,
} from './data.js';
import { columnChart, lineChart } from './charts.js';

const STORAGE_KEY = 'fietsdashboard.ritten';
const $ = (id) => document.getElementById(id);

const nf0 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const hours = (sec) => {
  const minutes = Math.round(sec / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')} u`;
};

const METRICS = [
  { key: 'distanceKm', title: 'Afstand', unit: 'km', format: (v) => `${nf0.format(v)} km` },
  { key: 'rides', title: 'Ritten', unit: 'aantal', format: (v) => nf0.format(v) },
  { key: 'elevationM', title: 'Hoogtemeters', unit: 'm', format: (v) => `${nf0.format(v)} m` },
  { key: 'movingSec', title: 'Tijd op de fiets', unit: 'uren', format: hours, scale: 1 / 3600 },
];

const state = { activities: [], year: null, compare: true, isDemo: false };

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved?.activities)) {
      state.activities = saved.activities;
      state.isDemo = Boolean(saved.isDemo);
    }
  } catch { /* geen of onleesbare opslag: begin leeg */ }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ activities: state.activities, isDemo: state.isDemo }));
  } catch { /* opslag vol of geblokkeerd: het dashboard werkt deze sessie gewoon door */ }
}

function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('is-error', isError);
}

async function importFiles(files) {
  const incoming = [];
  const problems = [];
  let skipped = 0;
  for (const file of files) {
    try {
      const text = await file.text();
      if (/\.gpx$/i.test(file.name)) {
        incoming.push(activityFromGPX(text, file.name.replace(/\.gpx$/i, '')));
      } else {
        const result = activitiesFromCSV(text);
        incoming.push(...result.activities);
        skipped += result.skipped;
      }
    } catch (error) {
      problems.push(`${file.name}: ${error.message}`);
    }
  }
  if (incoming.length) {
    // Echte ritten vervangen de voorbeeldritten in plaats van ermee te mengen.
    const before = state.isDemo ? [] : state.activities;
    state.activities = mergeActivities(before, incoming);
    state.isDemo = false;
    state.year = yearsOf(state.activities)[0];
    save();
    render();
  }
  const parts = [];
  if (incoming.length) parts.push(`${nf0.format(incoming.length)} ${incoming.length === 1 ? 'rit' : 'ritten'} ingelezen.`);
  if (skipped) parts.push(`${nf0.format(skipped)} regels overgeslagen (andere sport of onleesbaar).`);
  parts.push(...problems);
  setStatus(parts.join(' ') || 'Geen ritten gevonden.', problems.length > 0 && !incoming.length);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderTiles(current, previous, prevYear, periodLabel) {
  const tiles = $('tiles');
  tiles.replaceChildren();
  const speed = (t) => (t.movingSec > 0 ? t.distanceKm / (t.movingSec / 3600) : 0);
  const items = [
    { label: 'Afstand', value: `${nf0.format(current.distanceKm)} km`, now: current.distanceKm, then: previous?.distanceKm },
    { label: 'Ritten', value: nf0.format(current.rides), now: current.rides, then: previous?.rides },
    { label: 'Hoogtemeters', value: `${nf0.format(current.elevationM)} m`, now: current.elevationM, then: previous?.elevationM },
    { label: 'Tijd op de fiets', value: hours(current.movingSec), now: current.movingSec, then: previous?.movingSec },
    { label: 'Gemiddelde snelheid', value: `${nf1.format(speed(current))} km/u`, now: speed(current), then: previous && speed(previous) },
  ];
  for (const item of items) {
    const tile = el('div', 'tile');
    tile.append(el('div', 'tile-label', item.label), el('div', 'tile-value', item.value));
    if (item.then > 0) {
      const pct = Math.round(((item.now - item.then) / item.then) * 100);
      const delta = el('div', `tile-delta ${pct > 0 ? 'is-up' : pct < 0 ? 'is-down' : ''}`);
      const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '=';
      delta.append(el('span', 'tile-arrow', arrow), ` ${Math.abs(pct)}% t.o.v. ${periodLabel} ${prevYear}`);
      tile.append(delta);
    }
    tiles.append(tile);
  }
}

function renderTable(months, total) {
  const body = $('table-body');
  body.replaceChildren();
  const row = (label, t, isTotal) => {
    const tr = el('tr', isTotal ? 'is-total' : '');
    tr.append(el(isTotal ? 'th' : 'td', '', label));
    const speed = t.movingSec > 0 ? nf1.format(t.distanceKm / (t.movingSec / 3600)) : '–';
    for (const value of [nf0.format(t.rides), nf0.format(t.distanceKm), nf0.format(t.elevationM), hours(t.movingSec), speed]) {
      tr.append(el('td', 'num', value));
    }
    return tr;
  };
  months.forEach((m, i) => body.append(row(MONTHS_LONG[i], m)));
  body.append(row('Totaal', total, true));
}

function render() {
  const years = yearsOf(state.activities);
  const hasData = years.length > 0;
  $('dashboard').hidden = !hasData;
  $('empty').hidden = hasData;
  $('clear').hidden = !hasData;
  $('demo-note').hidden = !state.isDemo;
  if (!hasData) return;

  if (!years.includes(state.year)) state.year = years[0];
  const select = $('year');
  select.replaceChildren(...years.map((y) => {
    const option = el('option', '', String(y));
    option.value = y;
    option.selected = y === state.year;
    return option;
  }));

  const year = state.year;
  const prevYear = year - 1;
  const hasPrev = years.includes(prevYear);
  const compare = state.compare && hasPrev;
  $('compare').checked = state.compare;
  $('compare').disabled = !hasPrev;
  $('compare-label').classList.toggle('is-disabled', !hasPrev);

  const months = aggregateByMonth(state.activities, year);
  const prevMonths = hasPrev ? aggregateByMonth(state.activities, prevYear) : null;

  // Het meest recente jaar is meestal nog niet af: vergelijk dan met dezelfde periode van het jaar ervoor.
  const lastRide = new Date(state.activities.filter((a) => new Date(a.date).getFullYear() === year).at(-1).date);
  const partial = year === years[0] && !(lastRide.getMonth() === 11 && lastRide.getDate() === 31);
  const until = partial ? { month: lastRide.getMonth(), day: lastRide.getDate() } : undefined;
  const total = totalsFor(state.activities, year);
  renderTiles(total, hasPrev ? totalsFor(state.activities, prevYear, until) : null, prevYear, partial ? 'dezelfde periode in' : 'heel');

  const seriesColor = (i) => `var(--series-${i + 1})`;
  $('legend').hidden = !compare;
  $('legend-current').textContent = year;
  $('legend-previous').textContent = prevYear;

  const grid = $('charts');
  grid.replaceChildren();
  for (const metric of METRICS) {
    const card = el('section', 'card');
    const head = el('h3', '', metric.title);
    head.append(el('span', 'unit', ` ${metric.unit} per maand`));
    const plot = el('div', 'plot');
    card.append(head, plot);
    grid.append(card);
    const scale = metric.scale ?? 1;
    const values = (list) => list.map((m) => m[metric.key] * scale);
    const series = [{ name: String(year), color: seriesColor(0), values: values(months) }];
    if (compare) series.push({ name: String(prevYear), color: seriesColor(1), values: values(prevMonths) });
    columnChart(plot, {
      series, year,
      label: `${metric.title} per maand in ${year}`,
      format: (v) => metric.format(v / scale),
    });
  }

  const cumulative = (list, count) => {
    let sum = 0;
    return list.slice(0, count).map((m) => (sum += m.distanceKm));
  };
  const lines = [{ name: String(year), color: seriesColor(0), values: cumulative(months, partial ? lastRide.getMonth() + 1 : 12) }];
  if (compare) lines.push({ name: String(prevYear), color: seriesColor(1), values: cumulative(prevMonths, 12) });
  lineChart($('cumulative'), {
    series: lines,
    label: `Opgetelde afstand door het jaar ${year}`,
    format: (v) => `${nf0.format(v)} km`,
  });

  $('table-title').textContent = `Maandoverzicht ${year}`;
  renderTable(months, total);
}

function init() {
  load();
  $('file').addEventListener('change', (event) => {
    importFiles([...event.target.files]);
    event.target.value = '';
  });
  $('demo').addEventListener('click', () => {
    state.activities = demoActivities();
    state.isDemo = true;
    state.year = null;
    save();
    setStatus('');
    render();
  });
  $('clear').addEventListener('click', () => {
    if (!state.isDemo && !confirm('Alle ingelezen ritten uit deze browser verwijderen?')) return;
    state.activities = [];
    state.isDemo = false;
    save();
    setStatus('');
    render();
  });
  $('year').addEventListener('change', (event) => { state.year = Number(event.target.value); render(); });
  $('compare').addEventListener('change', (event) => { state.compare = event.target.checked; render(); });

  const drop = document.body;
  drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('is-dragging'); });
  drop.addEventListener('dragleave', (event) => { if (!event.relatedTarget) drop.classList.remove('is-dragging'); });
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('is-dragging');
    if (event.dataTransfer.files.length) importFiles([...event.dataTransfer.files]);
  });

  let width = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === width) return;
    width = window.innerWidth;
    render();
  });
  render();
}

init();
