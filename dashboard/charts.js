// Paddle Finder charts: a summary profile chart and an X/Y matrix. Both use the filtered, sorted `matches` rows.
window.pfChart = {x: 'powerPct', y: 'popPct'};

window.PF_FIELDS = {
  firePct: {label: 'Firepower percentile', short: 'FP'},
  powerPct: {label: 'Power percentile', short: 'Power'},
  popPct: {label: 'Pop percentile', short: 'Pop'},
  spinPct: {label: 'Spin percentile', short: 'Spin'},
  durability: {label: 'Grit durability tier (Tier 1 lasts longest)', short: 'Grit', tier: true},
  price: {label: 'Price ($)', short: 'Price', money: true},
  weight: {label: 'Weight (oz)', short: 'Weight', digits: 2},
  swing: {label: 'Swing weight', short: 'Swing'},
  score: {label: 'Match score', short: 'Match'},
};
window.pfFmt = (field, v) => {
  const f = window.PF_FIELDS[field] || {};
  if (v == null) return '—';
  if (f.tier) return 'Tier ' + v;
  if (f.money) return window.pfMoney(v);
  return window.pfNum(v, f.digits || 0);
};

const PF_CTX = '#6B7A96';
const PF_LIME = '#C6F432';
const PF_BG = '#1A2233';

function pfChartMsg(el, m) {
  const text = m.status === 'loading' ? 'Loading paddles…'
    : m.status === 'error' || m.status === 'missing' ? "Couldn't load the paddle data. Try refreshing."
    : 'No paddles match these filters.';
  el.replaceChildren(window.pfEl('p', 'pf-empty', text));
}

function pfTooltip(box) {
  const tip = window.pfEl('div', 'pf-tip');
  tip.hidden = true;
  box.append(tip);
  return {
    show(lines, px, py) {
      tip.replaceChildren();
      lines.forEach((t, i) => tip.append(window.pfEl(i === 0 ? 'b' : 'div', null, t)));
      tip.hidden = false;
      const bw = box.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
      let left = px + 12, top = py - th - 10;
      if (left + tw > bw) left = Math.max(0, px - tw - 12);
      if (top < 0) top = py + 14;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    },
    hide() { tip.hidden = true; },
  };
}

// Spread end labels so they don't overlap.
function pfSpread(items, gap, lo, hi) {
  items.sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
  const over = items.length ? items[items.length - 1].y - hi : 0;
  if (over > 0) for (const it of items) it.y -= over;
  for (let i = 0; i < items.length; i++) if (items[i].y < lo) items[i].y = lo;
  return items;
}

const PF_DIMS = [['powerPct', 'Power'], ['popPct', 'Pop'], ['firePct', 'Fire'], ['spinPct', 'Spin'], ['durScore', 'Grit'], ['valuePct', 'Value']];

dash.draw('pcp', (el) => {
  const m = dash.data('matches');
  if (m.status !== 'ok') return pfChartMsg(el, m);
  const rows = (m.data || []).filter((p) => PF_DIMS.every(([k]) => p[k] != null));
  if (!rows.length) return pfChartMsg(el, {status: 'empty'});
  const top = rows.slice(0, 5);
  const topIds = new Set(top.map((p) => p.id));
  const W = Math.max(300, el.clientWidth || 300), H = 300;
  const mg = {t: 26, r: 30, b: 12, l: 28};
  const x = d3.scalePoint(PF_DIMS.map((d) => d[0]), [mg.l, W - mg.r]);
  const y = d3.scaleLinear([0, 100], [H - mg.b, mg.t]);
  const line = d3.line().x((d) => x(d[0])).y((d) => y(d[1]));
  const pts = (p) => PF_DIMS.map(([k]) => [k, p[k]]);

  const box = window.pfEl('div');
  box.style.position = 'relative';
  const svg = d3.select(box).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img')
    .attr('aria-label', `Profile of ${rows.length} paddles across power, pop, firepower, spin, grit durability and value; top 5 highlighted`)
    .style('display', 'block').style('touch-action', 'pan-y');

  svg.append('g').selectAll('line').data([0, 50, 100]).join('line')
    .attr('x1', mg.l).attr('x2', W - mg.r).attr('y1', (d) => y(d)).attr('y2', (d) => y(d))
    .attr('stroke', '#2A3550').attr('stroke-width', 1);
  svg.append('g').selectAll('text').data([0, 50, 100]).join('text')
    .attr('x', mg.l - 6).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end')
    .attr('fill', '#A9B4C6').attr('font-size', 11).text((d) => d);
  const axes = svg.append('g');
  axes.selectAll('line').data(PF_DIMS).join('line')
    .attr('x1', (d) => x(d[0])).attr('x2', (d) => x(d[0])).attr('y1', y(0)).attr('y2', y(100))
    .attr('stroke', '#4A5874').attr('stroke-width', 1);
  axes.selectAll('text').data(PF_DIMS).join('text')
    .attr('x', (d) => x(d[0])).attr('y', mg.t - 10).attr('text-anchor', 'middle')
    .attr('fill', '#EEF2F7').attr('font-size', 11).text((d) => d[1]);

  svg.append('g').attr('fill', 'none').attr('stroke', PF_CTX).attr('stroke-opacity', 0.3).attr('stroke-width', 1)
    .selectAll('path').data(rows.filter((p) => !topIds.has(p.id))).join('path').attr('d', (p) => line(pts(p)));
  const hl = svg.append('g').attr('fill', 'none');
  for (const p of [...top].reverse()) {
    hl.append('path').attr('d', line(pts(p))).attr('stroke', PF_BG).attr('stroke-width', 5);
    hl.append('path').attr('d', line(pts(p))).attr('stroke', PF_LIME).attr('stroke-width', 2);
  }
  const lastK = PF_DIMS[PF_DIMS.length - 1][0];
  const ends = pfSpread(top.map((p, i) => ({p, i, y: y(p[lastK])})), 15, mg.t, H - mg.b);
  const lab = svg.append('g');
  for (const e of ends) {
    lab.append('line').attr('x1', x(lastK)).attr('x2', x(lastK) + 10).attr('y1', y(e.p[lastK])).attr('y2', e.y).attr('stroke', PF_LIME);
    lab.append('circle').attr('cx', x(lastK) + 17).attr('cy', e.y).attr('r', 7).attr('fill', PF_LIME);
    lab.append('text').attr('x', x(lastK) + 17).attr('y', e.y).attr('dy', '0.35em').attr('text-anchor', 'middle')
      .attr('font-size', 10).attr('font-weight', 500).attr('fill', PF_BG).text(e.i + 1);
  }
  const hover = svg.append('path').attr('fill', 'none').attr('stroke', '#FFFFFF').attr('stroke-width', 1.5).attr('display', 'none');

  const tip = pfTooltip(box);
  const dimLabel = Object.fromEntries(PF_DIMS);
  svg.on('pointermove pointerdown', (ev) => {
    const [px, py] = d3.pointer(ev, svg.node());
    let k = PF_DIMS[0][0], best = Infinity;
    for (const [dk] of PF_DIMS) { const d = Math.abs(x(dk) - px); if (d < best) { best = d; k = dk; } }
    let hit = null, hd = Infinity;
    for (const p of rows) { const d = Math.abs(y(p[k]) - py); if (d < hd) { hd = d; hit = p; } }
    if (!hit || hd > 14) { hover.attr('display', 'none'); tip.hide(); return; }
    hover.attr('display', null).attr('d', line(pts(hit)));
    const scale = svg.node().clientWidth / W;
    tip.show([hit.brand + ' ' + hit.name,
      PF_DIMS.map(([dk]) => dimLabel[dk] + ' ' + window.pfNum(hit[dk])).slice(0, 3).join(' · '),
      PF_DIMS.map(([dk]) => dimLabel[dk] + ' ' + window.pfNum(hit[dk])).slice(3).join(' · '),
      window.pfMoney(hit.price) + (hit.durability != null ? ' · Grit Tier ' + hit.durability : '')], px * scale, py * scale);
  }).on('pointerleave', () => { hover.attr('display', 'none'); tip.hide(); });

  el.replaceChildren(box);
});

dash.draw('top5', (ol) => {
  const m = dash.data('matches');
  if (m.status !== 'ok') { ol.replaceChildren(); return; }
  const rows = (m.data || []).filter((p) => PF_DIMS.every(([k]) => p[k] != null)).slice(0, 5);
  ol.replaceChildren(...rows.map((p, i) => {
    const li = window.pfEl('li');
    li.append(window.pfEl('span', 'pf-rankdot', String(i + 1)));
    const name = window.pfMark(window.pfEl('span', null, p.brand + ' ' + p.name), 'matches', 'name', p.id);
    const fp = window.pfEl('span', 'pf-sub', ' FP ');
    fp.append(window.pfMark(window.pfEl('span', null, window.pfNum(p.firePct)), 'matches', 'firePct', p.id));
    li.append(name, fp);
    return li;
  }));
});

function pfJitter(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((h >>> 0) % 1000) / 1000 - 0.5;
}

dash.draw('scatter', (el) => {
  const m = dash.data('matches');
  if (m.status !== 'ok') return pfChartMsg(el, m);
  const {x: fx, y: fy} = window.pfChart;
  const F = window.PF_FIELDS;
  const val = (p, f) => (F[f].tier ? p[f] + pfJitter(p.id + f) * 0.5 : p[f]);
  const rows = (m.data || []).filter((p) => p[fx] != null && p[fy] != null);
  if (!rows.length) return pfChartMsg(el, {status: 'empty'});
  const top = rows.slice(0, 5);
  const topIds = new Set(top.map((p) => p.id));
  const W = Math.max(300, el.clientWidth || 300), H = 320;
  const mg = {t: 22, r: 14, b: 40, l: 44};
  const scale = (f, range) => {
    if (F[f].tier) return d3.scaleLinear([4.5, 0.5], range);
    const ext = d3.extent(rows, (p) => p[f]);
    const pad = (ext[1] - ext[0]) * 0.06 || 1;
    return d3.scaleLinear([ext[0] - pad, ext[1] + pad], range).nice();
  };
  const x = scale(fx, [mg.l, W - mg.r]);
  const y = scale(fy, [H - mg.b, mg.t]);
  const tickFmt = (f) => (F[f].tier ? (d) => 'T' + d : F[f].money ? (d) => '$' + d : (d) => d3.format('~g')(d));
  const ticks = (f) => (F[f].tier ? [4, 3, 2, 1] : null);

  const box = window.pfEl('div');
  box.style.position = 'relative';
  const svg = d3.select(box).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img')
    .attr('aria-label', `Scatter of ${rows.length} paddles: ${F[fx].label} across, ${F[fy].label} up; top 5 highlighted`)
    .style('display', 'block').style('touch-action', 'pan-y');

  const ax = d3.axisBottom(x).tickFormat(tickFmt(fx)).tickSizeOuter(0);
  const ay = d3.axisLeft(y).tickFormat(tickFmt(fy)).tickSizeOuter(0);
  if (ticks(fx)) ax.tickValues(ticks(fx)); else ax.ticks(Math.max(3, Math.floor(W / 80)));
  if (ticks(fy)) ay.tickValues(ticks(fy)); else ay.ticks(5);
  svg.append('g').attr('class', 'pf-axis').attr('transform', `translate(0,${H - mg.b})`).call(ax);
  svg.append('g').attr('class', 'pf-axis').attr('transform', `translate(${mg.l},0)`).call(ay);
  svg.append('g').selectAll('line').data(ticks(fy) || y.ticks(5)).join('line')
    .attr('x1', mg.l).attr('x2', W - mg.r).attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).attr('stroke', '#2A3550');
  svg.append('text').attr('x', W - mg.r).attr('y', H - 6).attr('text-anchor', 'end').attr('fill', '#EEF2F7').attr('font-size', 11).text(F[fx].label + ' →');
  svg.append('text').attr('x', mg.l).attr('y', 11).attr('fill', '#EEF2F7').attr('font-size', 11).text('↑ ' + F[fy].label);

  const ctx = rows.filter((p) => !topIds.has(p.id));
  svg.append('g').selectAll('circle').data(ctx).join('circle')
    .attr('cx', (p) => x(val(p, fx))).attr('cy', (p) => y(val(p, fy))).attr('r', 4)
    .attr('fill', PF_CTX).attr('fill-opacity', 0.55).attr('stroke', PF_BG).attr('stroke-width', 1);
  const tg = svg.append('g');
  const spots = top.map((p, i) => ({i, cx: x(val(p, fx)), cy: y(val(p, fy))}));
  [...spots].reverse().forEach((s) => {
    tg.append('circle').attr('cx', s.cx).attr('cy', s.cy).attr('r', 6).attr('fill', PF_LIME).attr('stroke', PF_BG).attr('stroke-width', 2);
  });
  // Place each rank label where it hits no other label or top-5 dot, stepping further out if needed;
  // a label moved away from its dot gets a thin leader line.
  const taken = spots.map((s) => ({x0: s.cx - 7, y0: s.cy - 7, x1: s.cx + 7, y1: s.cy + 7}));
  const hits = (b) => taken.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
  const inside = (b) => b.x0 >= mg.l + 2 && b.x1 <= W - mg.r && b.y0 >= 14 && b.y1 <= H - mg.b - 2;
  const dirs = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];
  for (const s of spots) {
    let spot = null;
    for (const dist of [12, 20, 28, 38]) {
      for (const [dx, dy] of dirs) {
        const n = Math.hypot(dx, dy);
        const lx = s.cx + (dx / n) * dist, ly = s.cy + (dy / n) * dist;
        const b = {x0: lx - 5, y0: ly - 7, x1: lx + 5, y1: ly + 7};
        if (inside(b) && !hits(b)) { spot = {lx, ly, b, dist}; break; }
      }
      if (spot) break;
    }
    if (!spot) spot = {lx: s.cx + 12, ly: s.cy, b: {x0: s.cx + 7, y0: s.cy - 7, x1: s.cx + 17, y1: s.cy + 7}, dist: 12};
    taken.push(spot.b);
    if (spot.dist > 12) {
      const ux = (spot.lx - s.cx) / spot.dist, uy = (spot.ly - s.cy) / spot.dist;
      tg.append('line').attr('x1', s.cx + ux * 7).attr('y1', s.cy + uy * 7)
        .attr('x2', spot.lx - ux * 6).attr('y2', spot.ly - uy * 6).attr('stroke', PF_LIME).attr('stroke-width', 1);
    }
    tg.append('text').attr('x', spot.lx).attr('y', spot.ly).attr('dy', '0.35em').attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('font-weight', 500)
      .attr('fill', PF_LIME).attr('stroke', PF_BG).attr('stroke-width', 3).attr('paint-order', 'stroke').text(s.i + 1);
  }
  const ring = svg.append('circle').attr('r', 8).attr('fill', 'none').attr('stroke', '#FFFFFF').attr('stroke-width', 1.5).attr('display', 'none');

  const all = rows.map((p) => [x(val(p, fx)), y(val(p, fy))]);
  const delaunay = d3.Delaunay.from(all);
  const tip = pfTooltip(box);
  svg.on('pointermove pointerdown', (ev) => {
    const [px, py] = d3.pointer(ev, svg.node());
    const i = delaunay.find(px, py);
    const [cx, cy] = all[i];
    if (Math.hypot(cx - px, cy - py) > 28) { ring.attr('display', 'none'); tip.hide(); return; }
    const p = rows[i];
    ring.attr('display', null).attr('cx', cx).attr('cy', cy);
    const s = svg.node().clientWidth / W;
    tip.show([p.brand + ' ' + p.name,
      F[fx].short + ' ' + window.pfFmt(fx, p[fx]) + ' · ' + F[fy].short + ' ' + window.pfFmt(fy, p[fy]),
      [['firePct', 'FP ' + window.pfNum(p.firePct)], ['price', window.pfMoney(p.price)], ['durability', p.durability != null ? 'Grit Tier ' + p.durability : null]]
        .filter(([f, t]) => t && f !== fx && f !== fy).map(([, t]) => t).join(' · ')].filter(Boolean), cx * s, cy * s);
  }).on('pointerleave', () => { ring.attr('display', 'none'); tip.hide(); });

  el.replaceChildren(box);
});

// Axis pickers and presets
(() => {
  const sync = () => {
    document.querySelectorAll('#pf-x').forEach((s) => { s.value = window.pfChart.x; });
    document.querySelectorAll('#pf-y').forEach((s) => { s.value = window.pfChart.y; });
  };
  sync();
  document.querySelectorAll('#pf-x, #pf-y').forEach((s) => s.addEventListener('change', () => {
    window.pfChart[s.id === 'pf-x' ? 'x' : 'y'] = s.value;
    dash.draw('scatter');
  }));
  document.querySelectorAll('[data-preset-x]').forEach((b) => b.addEventListener('click', () => {
    window.pfChart = {x: b.getAttribute('data-preset-x'), y: b.getAttribute('data-preset-y')};
    sync();
    dash.draw('scatter');
  }));
})();

// List / Charts views
(() => {
  const show = (view) => {
    document.querySelectorAll('#list-view').forEach((s) => { s.hidden = view !== 'list-view'; });
    document.querySelectorAll('#charts').forEach((s) => { s.hidden = view !== 'charts'; });
    document.querySelectorAll('[data-view]').forEach((a) => {
      if (a.getAttribute('data-view') === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    dash.setLink(view);
    if (view === 'charts') { dash.draw('pcp'); dash.draw('top5'); dash.draw('scatter'); }
    else { dash.draw('rows'); dash.draw('more'); }
  };
  document.querySelectorAll('[data-view]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    show(a.getAttribute('data-view'));
  }));
  if (location.hash === '#charts') show('charts');
})();
