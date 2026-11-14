// Kleine SVG-grafieken zonder externe bibliotheek: kolommen per maand en een lijngrafiek.
import { MONTHS, MONTHS_LONG } from './data.js';

const NS = 'http://www.w3.org/2000/svg';
const HEIGHT = 210;
const MARGIN = { top: 22, right: 12, bottom: 24, left: 44 };

function svg(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

/** Ronde stapgrootte zodat de as op nette getallen uitkomt. */
export function niceScale(max, ticks = 4) {
  if (!(max > 0)) return { max: 1, step: 1 };
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  return { max: Math.ceil(max / step - 1e-9) * step, step };
}

const axisFormat = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });

let tooltip;
function showTooltip(target, title, rows) {
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.setAttribute('role', 'status');
    document.body.appendChild(tooltip);
  }
  tooltip.replaceChildren();
  const head = document.createElement('div');
  head.className = 'tooltip-title';
  head.textContent = title;
  tooltip.appendChild(head);
  for (const row of rows) {
    const line = document.createElement('div');
    line.className = 'tooltip-row';
    const key = document.createElement('span');
    key.className = 'tooltip-key';
    key.style.background = row.color;
    const value = document.createElement('strong');
    value.textContent = row.value;
    const name = document.createElement('span');
    name.textContent = row.name;
    line.append(key, value, name);
    tooltip.appendChild(line);
  }
  tooltip.hidden = false;
  const box = target.getBoundingClientRect();
  const tip = tooltip.getBoundingClientRect();
  let left = box.left + box.width / 2 - tip.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tip.width - 8));
  let top = box.top - tip.height - 8;
  if (top < 8) top = box.top + 28;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  if (tooltip) tooltip.hidden = true;
}

function frame(container, yMax, label) {
  const width = Math.max(280, Math.round(container.clientWidth));
  container.replaceChildren();
  const root = svg('svg', { viewBox: `0 0 ${width} ${HEIGHT}`, width, height: HEIGHT, role: 'group', 'aria-label': label }, container);
  const plot = {
    x: MARGIN.left,
    y: MARGIN.top,
    w: width - MARGIN.left - MARGIN.right,
    h: HEIGHT - MARGIN.top - MARGIN.bottom,
  };
  const scale = niceScale(yMax);
  const y = (v) => plot.y + plot.h - (v / scale.max) * plot.h;
  for (let v = 0; v <= scale.max + 1e-9; v += scale.step) {
    svg('line', { x1: plot.x, x2: plot.x + plot.w, y1: y(v), y2: y(v), class: v === 0 ? 'axis-line' : 'grid-line' }, root);
    svg('text', { x: plot.x - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, root).textContent = axisFormat.format(v);
  }
  const band = plot.w / 12;
  MONTHS.forEach((m, i) => {
    // Op smalle schermen alleen de eerste letter, anders botsen de maandlabels.
    const text = band < 26 ? m[0].toUpperCase() : m;
    svg('text', { x: plot.x + band * (i + 0.5), y: HEIGHT - 6, 'text-anchor': 'middle', class: 'tick' }, root).textContent = text;
  });
  return { root, plot, y, band };
}

/** Onzichtbare, focusbare strook per maand: het raakvlak is groter dan de staaf of het punt zelf. */
function hitBands(root, plot, band, describe, onEnter, onLeave) {
  for (let i = 0; i < 12; i++) {
    const info = describe(i);
    if (!info) continue;
    const hit = svg('rect', {
      x: plot.x + band * i, y: plot.y - 10, width: band, height: plot.h + 10,
      class: 'hit', tabindex: 0, role: 'img',
      'aria-label': `${info.title}: ${info.rows.map((r) => `${r.name} ${r.value}`).join(', ')}`,
    }, root);
    const enter = () => { onEnter?.(i); showTooltip(hit, info.title, info.rows); };
    const leave = () => { onLeave?.(i); hideTooltip(); };
    hit.addEventListener('pointerenter', enter);
    hit.addEventListener('pointerleave', leave);
    hit.addEventListener('focus', enter);
    hit.addEventListener('blur', leave);
  }
}

/** Pad voor een kolom met een afgeronde bovenkant en een rechte voet op de basislijn. */
function columnPath(x, top, w, bottom) {
  const r = Math.min(4, w / 2, bottom - top);
  return `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${bottom}Z`;
}

/**
 * Kolommen per maand voor één of twee reeksen.
 * series: [{ name, color, values: number[12] }], format: getal -> tekst voor label en tooltip.
 */
export function columnChart(container, { series, format, label, year }) {
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const { root, plot, y, band } = frame(container, max, label);
  const gap = 2;
  const barW = Math.max(3, Math.min(series.length > 1 ? 14 : 24, (band * 0.72 - gap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + gap * (series.length - 1);
  const bottom = plot.y + plot.h;
  const bars = [];
  for (let i = 0; i < 12; i++) {
    const x0 = plot.x + band * (i + 0.5) - groupW / 2;
    bars[i] = series.map((s, si) => {
      const v = s.values[i];
      if (!(v > 0)) return null;
      return svg('path', { d: columnPath(x0 + si * (barW + gap), Math.min(y(v), bottom - 1), barW, bottom), fill: s.color, class: 'bar' }, root);
    });
  }
  // Alleen de hoogste maand van de hoofdreeks krijgt een label; de rest staat in tooltip en tabel.
  const main = series[0].values;
  const peak = main.indexOf(Math.max(...main));
  if (main[peak] > 0) {
    const x = plot.x + band * (peak + 0.5) - groupW / 2 + barW / 2;
    const anchor = peak === 0 ? 'start' : peak === 11 ? 'end' : 'middle';
    const dx = peak === 0 ? -barW / 2 : peak === 11 ? barW / 2 : 0;
    // Boven de hoogste staaf van die maand, zodat het label niet door de vergelijkingsstaaf loopt.
    const top = Math.max(...series.map((s) => s.values[peak]));
    svg('text', { x: x + dx, y: y(top) - 6, 'text-anchor': anchor, class: 'value-label' }, root).textContent = format(main[peak]);
  }
  hitBands(root, plot, band,
    (i) => ({
      title: `${MONTHS_LONG[i]} ${year}`,
      rows: series.map((s) => ({ name: s.name, color: s.color, value: format(s.values[i]) })),
    }),
    (i) => bars[i].forEach((b) => b?.classList.add('is-active')),
    (i) => bars[i].forEach((b) => b?.classList.remove('is-active')));
}

/**
 * Lijngrafiek met een punt per maand. Een reeks mag korter zijn dan twaalf maanden (lopend jaar).
 * series: [{ name, color, values: number[] }]
 */
export function lineChart(container, { series, format, label }) {
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const { root, plot, y, band } = frame(container, max, label);
  const x = (i) => plot.x + band * (i + 0.5);
  const crosshair = svg('line', { y1: plot.y, y2: plot.y + plot.h, class: 'crosshair', visibility: 'hidden' }, root);
  const dots = series.map(() => []);
  // De hoofdreeks als laatste tekenen zodat die bovenop ligt.
  [...series.keys()].reverse().forEach((si) => {
    const s = series[si];
    if (!s.values.length) return;
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
    svg('path', { d, stroke: s.color, class: 'line' }, root);
    s.values.forEach((v, i) => {
      const last = i === s.values.length - 1;
      dots[si][i] = svg('circle', { cx: x(i), cy: y(v), r: 4, fill: s.color, class: last ? 'dot is-end' : 'dot' }, root);
    });
  });
  const main = series[0].values;
  if (main.length) {
    const i = main.length - 1;
    // Ligt een andere lijn op dit punt hoger, dan gaat het label eronder; anders erboven.
    const below = series.slice(1).some((s) => s.values[i] > main[i]);
    svg('text', {
      x: x(i), y: y(main[i]) + (below ? 20 : -10), 'text-anchor': i >= 10 ? 'end' : 'middle', class: 'value-label',
    }, root).textContent = format(main[i]);
  }
  hitBands(root, plot, band,
    (i) => {
      const rows = series.filter((s) => i < s.values.length)
        .map((s) => ({ name: s.name, color: s.color, value: format(s.values[i]) }));
      return rows.length ? { title: `t/m ${MONTHS_LONG[i]}`, rows } : null;
    },
    (i) => {
      crosshair.setAttribute('x1', x(i));
      crosshair.setAttribute('x2', x(i));
      crosshair.setAttribute('visibility', 'visible');
      dots.forEach((list) => list[i]?.classList.add('is-active'));
    },
    (i) => {
      crosshair.setAttribute('visibility', 'hidden');
      dots.forEach((list) => list[i]?.classList.remove('is-active'));
    });
}
