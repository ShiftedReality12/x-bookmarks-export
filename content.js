// content.js: injected on every x.com page (X is a single-page app, so the page is checked on each request).
// Exports only what X has already rendered on the bookmarks page; it makes no requests of its own.
(() => {
  const STEP = 0.8;                      // scroll this share of the viewport per step
  const WAIT_MS = [1200, 2000];          // polite, jittered pause between steps
  const IDLE_STEPS = 6;                  // no new posts and no page growth this many times in a row = end of list
  const CAP_POSTS = 5000, CAP_MS = 30 * 60 * 1000;
  const HEALTH_MIN_SEEN = 20;            // mid-run layout check waits for a sample; the final check always runs

  let run = { state: 'idle', seen: 0, kept: 0, message: '' };
  let overlay = null;

  const onBookmarks = () => XBE.isBookmarksPage(location.pathname, XBE.selectedTab(document));
  const hint = () => (XBE.isHistoryPath(location.pathname) && !onBookmarks() ? 'Select the Bookmarks tab on this page (not Likes).' : '');
  const status = () => ({ onBookmarks: onBookmarks(), hint: hint(), state: run.state, seen: run.seen, kept: run.kept, message: run.message });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'start') {
      if (!onBookmarks()) return reply({ ...status(), error: 'Open your X bookmarks page to export' });
      if (run.state !== 'running') start(msg.options || {});
    } else if (msg.type === 'stop') {
      requestStop();
    }
    reply(status());
  });

  function requestStop() {
    if (run.state !== 'running') return;
    run.stopRequested = true;
    if (run.wake) run.wake();
  }

  function start(opts) {
    let cutoff;
    try { cutoff = XBE.cutoffFor(opts.recency, opts.since, new Date()); } catch (err) {
      run = { state: 'error', seen: 0, kept: 0, message: err.message };
      return;
    }
    const max = Number(opts.max) > 0 ? Math.floor(Number(opts.max)) : Infinity;
    const r = run = { state: 'running', seen: 0, kept: 0, message: '', stopRequested: false };
    showOverlay(r);
    collect(r, cutoff, max)
      .then(res => finish(r, res, opts, cutoff, max))
      .catch(err => end(r, 'error', err.message));
  }

  async function collect(r, cutoff, max) {
    const posts = new Map(), failed = new Set(), t0 = Date.now();
    const isKept = p => !cutoff || new Date(p.datetime) >= cutoff;
    let oldStreak = 0, idle = 0, height = 0;
    window.scrollTo(0, 0);               // X drops rows scrolled past, so start from the most recent save
    await sleep(r, WAIT_MS[0]);
    for (;;) {
      const page = XBE.parseDocument(document);
      let fresh = 0;
      for (const p of page.posts) {
        if (posts.has(p.id)) continue;
        posts.set(p.id, p);
        fresh++;
        oldStreak = isKept(p) ? 0 : oldStreak + 1;
      }
      for (const key of page.failedKeys) if (!failed.has(key)) { failed.add(key); fresh++; }
      const kept = [...posts.values()].filter(isKept).slice(0, max);
      r.seen = posts.size + failed.size;
      r.kept = kept.length;
      setOverlay(`Exporting X bookmarks: seen ${r.seen}, kept ${r.kept}`);
      const health = XBE.checkHealth(r.seen, posts.size);
      if (r.seen >= HEALTH_MIN_SEEN && !health.ok) throw new Error(health.message);

      const h = document.documentElement.scrollHeight;
      idle = fresh || h > height ? 0 : idle + 1;
      height = Math.max(height, h);
      const reason =
        r.stopRequested ? 'stopped by user (partial export of what was collected)' :
        !onBookmarks() ? 'left the bookmarks page (partial export of what was collected)' :
        kept.length >= max ? `max reached (${max})` :
        cutoff && oldStreak >= XBE.OLD_STREAK ? `recency cutoff (${XBE.OLD_STREAK} posts in a row older than the cutoff)` :
        posts.size >= CAP_POSTS ? `safety cap (${CAP_POSTS} posts)` :
        Date.now() - t0 >= CAP_MS ? 'safety cap (30 minutes)' :
        idle >= IDLE_STEPS ? 'end of list' : '';
      if (reason) return { reason, seen: r.seen, parsed: posts.size, kept };
      window.scrollBy(0, Math.round(innerHeight * STEP));
      await sleep(r, WAIT_MS[0] + Math.random() * (WAIT_MS[1] - WAIT_MS[0]));
    }
  }

  function finish(r, res, opts, cutoff, max) {
    const health = XBE.checkHealth(res.seen, res.parsed);
    if (!health.ok) return end(r, 'error', health.message);
    const now = new Date();
    const name = XBE.fileName(now);
    save(name, XBE.toMarkdown(res.kept, {
      exportedAt: now, cutoff, seen: res.seen, stopReason: res.reason,
      page: XBE.isHistoryPath(location.pathname) ? `${location.pathname} (${XBE.selectedTab(document)} tab)` : location.pathname,
      recency: XBE.recencyLabel(opts.recency, opts.since), max: max === Infinity ? 'All' : String(max),
    }));
    end(r, 'done', `Saved ${name}: exported ${res.kept.length} of ${res.seen} posts seen (${res.reason}).`);
  }

  function end(r, state, message) {
    r.state = state;
    r.message = message;
    if (!overlay) return;
    overlay.text.textContent = message;
    overlay.button.textContent = 'Close';
    const box = overlay.box;
    if (state === 'done') setTimeout(() => box.remove(), 6000);   // errors stay until closed
  }

  function showOverlay(r) {
    if (overlay) overlay.box.remove();
    const box = document.createElement('div');
    const text = document.createElement('span');
    const button = document.createElement('button');
    box.id = 'xbe-overlay';
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;gap:12px;' +
      'align-items:center;max-width:360px;padding:10px 14px;border-radius:12px;background:#0f1419;color:#fff;' +
      'font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.4)';
    button.style.cssText = 'flex:none;padding:4px 12px;border:1px solid #fff;border-radius:999px;' +
      'background:transparent;color:#fff;font:inherit;cursor:pointer';
    text.textContent = 'Starting export…';
    button.textContent = 'Stop';
    button.addEventListener('click', () => (r.state === 'running' ? requestStop() : box.remove()));
    box.append(text, button);
    document.body.append(box);
    overlay = { box, text, button };
  }
  const setOverlay = msg => { if (overlay) overlay.text.textContent = msg; };

  // Blob + temporary <a download>: a normal page download, so no "downloads" permission is needed.
  function save(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  const sleep = (r, ms) => new Promise(done => {
    const t = setTimeout(done, ms);
    r.wake = () => { clearTimeout(t); done(); };
  });
})();
