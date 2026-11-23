// Minimal stand-in for the Claude dashboard runtime, so the same page code runs as a plain web page.
(() => {
  const calcs = {};
  const draws = {};
  const onDataFns = [];
  const defaults = {shape: 'Elongated', maxPrice: 0, grit: 0, sort: 'firePct', untested: false, q: ''};
  const params = {...defaults};
  const sources = {paddles: {status: 'loading', data: []}};
  let version = 0;
  const memo = {};

  const dataOf = (id) => {
    if (sources[id]) return sources[id];
    const c = calcs[id];
    if (!c) return {status: 'missing', data: []};
    const ins = c.inputs.map(dataOf);
    const bad = ins.find((d) => d.status !== 'ok');
    if (bad) return {status: bad.status, data: []};
    if (memo[id] && memo[id].v === version) return memo[id].r;
    let r;
    try { r = {status: 'ok', data: c.fn(...ins.map((d) => d.data))}; }
    catch (e) { console.error(id, e); r = {status: 'error', data: [], message: String(e)}; }
    memo[id] = {v: version, r};
    return r;
  };

  const runDraw = (name) => {
    document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => {
      if (el.closest('[hidden]')) return;
      try { draws[name](el); } catch (e) { console.error('draw ' + name, e); }
    });
  };
  const redrawAll = () => {
    onDataFns.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    Object.keys(draws).forEach(runDraw);
  };

  window.dash = {
    calc(id, o) { calcs[id] = o; },
    loader() {},
    params() { return {...params}; },
    setParams(p) { Object.assign(params, p); version++; redrawAll(); },
    resetParams() { Object.assign(params, defaults); version++; redrawAll(); },
    setLink(name) { try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ } },
    data: dataOf,
    draw(name, fn) {
      if (fn) { draws[name] = typeof fn === 'function' ? fn : fn.update; return; }
      runDraw(name);
    },
    onData(fn) { onDataFns.push(fn); },
    refresh() {},
    colors: [],
  };

  window.__pfStart = () => {
    redrawAll();
    fetch('paddles.json', {cache: 'no-cache'})
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((j) => {
        sources.paddles = {status: 'ok', data: j.rows || []};
        const built = (j.meta || []).find((m) => m.label === 'Built');
        document.querySelectorAll('[data-updated]').forEach((el) => { el.textContent = built ? built.value : 'unknown'; });
      })
      .catch((e) => { console.error(e); sources.paddles = {status: 'error', data: [], message: String(e)}; })
      .finally(() => { version++; redrawAll(); });
    let t;
    let lastW = window.innerWidth;
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      clearTimeout(t);
      t = setTimeout(redrawAll, 150);
    });
  };
})();
