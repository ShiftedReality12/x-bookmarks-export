// tests.js: zero-dependency tests for parser.js and content.js, loaded by test/run.html.
// Synchronous tests (parser + page gating) run on page load. The content.js run-loop tests wait on the
// real 1.2-2.0 s scroll timers, so they finish only when headless Chrome gets virtual time (see README).
(() => {
  const $ = id => document.getElementById(id);
  const lines = [];
  let pass = 0, total = 0;

  function check(name, actual, expected) {
    total++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) pass++;
    lines.push(ok ? `PASS ${name}` : `FAIL ${name}\n     expected ${JSON.stringify(expected)}\n     actual   ${JSON.stringify(actual)}`);
    $('results').textContent = lines.join('\n');
  }
  const showMarkdown = (source, text) => { $('markdown-source').textContent = source; $('markdown').textContent = text; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(cond, ms) {
    const t0 = Date.now();
    while (!cond()) { if (Date.now() - t0 > ms) return false; await sleep(100); }
    return true;
  }

  const id = n => '18460000000000000' + String(n).padStart(2, '0');
  const sv = iso => new Date(iso).toLocaleString('sv-SE').slice(0, 16); // independent "YYYY-MM-DD HH:MM" oracle
  const headings = md => md.split('\n').filter(l => l.startsWith('## '));
  const findArticle = text => [...$('stage').querySelectorAll('article')].find(a => a.textContent.includes(text));
  const DATES = {
    1: '2026-10-17T15:04:00.000Z', 2: '2026-10-12T09:30:00.000Z', 3: '2026-10-16T20:15:00.000Z', 4: '2026-10-15T20:00:00.000Z',
    5: '2026-10-14T06:00:00.000Z', 6: '2026-10-13T12:00:00.000Z', 7: '2026-10-17T07:20:00.000Z', 11: '2026-10-11T16:00:00.000Z',
  };
  const HANDLES = { 1: 'alice_dev', 2: 'carol_writes', 3: 'dan_emoji', 4: 'erin_links', 5: 'frank_photos', 6: 'gina_video', 7: 'hana_quotes', 11: 'jules_longform' };
  const NAMES = { 1: 'Alice Example', 2: 'Carol Writer', 3: 'Dan 🚀', 4: 'Erin Links', 5: 'Frank Photos', 6: 'Gina Video', 7: 'Hana Quotes', 11: 'Jules Longform' };
  const heading = (i, n) => `## ${i}. ${NAMES[n]} (@${HANDLES[n]}) — ${sv(DATES[n])}`;
  const DOM_ORDER = [1, 2, 3, 4, 5, 6, 7, 11];
  const NEWEST_FIRST = [1, 7, 3, 4, 5, 6, 2, 11];
  const LAYOUT_MSG = (a, b) => `X's page layout changed: parsed ${a} of ${b} posts. Export aborted to avoid a partial file. Update SELECTORS in parser.js.`;
  const ERIN_LINKS = '- Links: [https://example.org/notes/local-first](https://t.co/aaa111), [developer.chrome.com Stay secure | Chrome Extensions](https://t.co/bbb222)';

  function testParser() {
    const doc = XBE.parseDocument($('stage'));
    const p = Object.fromEntries(doc.posts.map(x => [x.id, x]));
    const post = n => p[id(n)] || {};
    check('parseDocument: unique posts', doc.posts.length, 8);
    check('parseDocument: seen = unique posts + failures', doc.seen, 9);
    check('parseDocument: malformed article (no time) counted as failure', doc.failures, 1);
    check('parseDocument: promoted cell skipped as ad', doc.ads, 1);
    check('dedupe by status id, page order kept', doc.posts.map(x => x.id), DOM_ORDER.map(id));
    check('canonical URLs', doc.posts.map(x => x.url), DOM_ORDER.map(n => `https://x.com/${HANDLES[n]}/status/${id(n)}`));
    check('handles', doc.posts.map(x => x.handle), DOM_ORDER.map(n => HANDLES[n]));
    check('display names (emoji img kept)', doc.posts.map(x => x.name), DOM_ORDER.map(n => NAMES[n]));
    check('ISO datetimes from time[datetime]', doc.posts.map(x => x.datetime), DOM_ORDER.map(n => DATES[n]));
    check('plain post: line break, mention, hashtag kept in text', post(1).text,
      'Shipping a tiny tool today.\nNo build step, no dependencies. Thanks @bob_builds for the review #buildinpublic');
    check('plain post: mention/hashtag links dropped; no media/quote/article', [post(1).links, post(1).images, post(1).videos, post(1).quoted, post(1).article], [[], 0, 0, '', null]);
    check('>280-char post: first line + truncated marker', post(2).text, 'Thread on why local-first tools matter: …(truncated)');
    check('emoji post: <img alt> kept in text', post(3).text, 'Launch day 🚀 going well 🎉');
    check('link post: t.co text link shown expanded', post(4).text, 'Notes worth reading: https://example.org/notes/local-first');
    check('link post: links from text + card (card title)', post(4).links, [
      { title: 'https://example.org/notes/local-first', url: 'https://t.co/aaa111' },
      { title: 'developer.chrome.com Stay secure | Chrome Extensions', url: 'https://t.co/bbb222' }]);
    check('2-photo post: 2 images, 0 videos', [post(5).images, post(5).videos], [2, 0]);
    check('video post: 1 video, its tweetPhoto wrapper not an image, not an ad', [post(6).images, post(6).videos], [0, 1]);
    check('quoted post: quoted URL with /photo/1 stripped', post(7).quoted, 'https://x.com/ivan_original/status/1845000000000000999');
    check('quoted post: own text only, quoted media not counted', [post(7).text, post(7).images], ['This is the right default 👇', 0]);
    check('X article post: title + canonical URL', post(11).article, { title: 'Why I export my bookmarks every day', url: 'https://x.com/i/article/1844000000000000111' });
    check('parseArticle(promoted) -> {ad: true}', XBE.parseArticle(findArticle('@brand_ads')), { ad: true });
    check('parseArticle(malformed) -> null', XBE.parseArticle(findArticle('@kim_broken')), null);

    check('statusUrl strips /photo/N', XBE.statusUrl('/a_b/status/123/photo/2'), 'https://x.com/a_b/status/123');
    check('statusUrl strips /analytics', XBE.statusUrl('/a_b/status/123/analytics'), 'https://x.com/a_b/status/123');
    check('statusUrl strips query, maps twitter.com to x.com', XBE.statusUrl('https://twitter.com/a_b/status/123?s=20&t=x'), 'https://x.com/a_b/status/123');
    check('statusUrl rejects other hosts', XBE.statusUrl('https://example.com/a_b/status/123'), '');

    const page = ([path, tab]) => XBE.isBookmarksPage(path, tab);
    const yes = [['/i/bookmarks', ''], ['/i/bookmarks/', ''], ['/i/bookmarks/1790000000000000000', ''], ['/i/bookmarks/1790000000000000000/', ''],
      ['/i/history', 'Bookmarks'], ['/i/history/', 'Bookmarks']];
    const no = [['/home', 'Bookmarks'], ['/i/bookmarksx', ''], ['/i/bookmarks/a/b', ''], ['/alice_dev/status/1', ''], ['/i/lists/123', ''], ['', ''],
      ['/i/history', 'Likes'], ['/i/history', ''], ['/i/historyx', 'Bookmarks'], ['/i/history/likes', 'Bookmarks']];
    check('isBookmarksPage accepts list, folder, and History with Bookmarks tab', yes.map(page), yes.map(() => true));
    check('isBookmarksPage rejects other pages and the History Likes tab', no.map(page), no.map(() => false));
    check('isHistoryPath', ['/i/history', '/i/history/', '/i/bookmarks', '/i/history/x'].map(XBE.isHistoryPath), [true, true, false, false]);
    const likes = document.createElement('div');
    likes.innerHTML = '<a role="tab" aria-selected="false"><span>Bookmarks</span></a><a role="tab" aria-selected="true"><span>Likes</span></a>';
    check('selectedTab reads the selected History tab', [XBE.selectedTab($('stage')), XBE.selectedTab(likes), XBE.selectedTab(document.createElement('div'))], ['Bookmarks', 'Likes', '']);

    const h = (s, k) => XBE.checkHealth(s, k).ok;
    check('checkHealth: 0 seen is ok (empty bookmarks)', h(0, 0), true);
    check('checkHealth: articles but 0 parsed fails', [h(1, 0), h(10, 0)], [false, false]);
    check('checkHealth: exactly 20% failures ok', [h(10, 8), h(5, 4)], [true, true]);
    check('checkHealth: over 20% failures fails', [h(10, 7), h(100, 79)], [false, false]);
    check('checkHealth: 1 of 9 failed ok', h(9, 8), true);
    check('checkHealth: message text', XBE.checkHealth(10, 7).message, LAYOUT_MSG(7, 10));

    const now = new Date(2026, 9, 18, 12, 0, 0), DAY = 86400000;
    check('cutoffFor 24h / 7d / 30d / all', ['24h', '7d', '30d', 'all'].map(r => { const c = XBE.cutoffFor(r, '', now); return c && now - c; }), [DAY, 7 * DAY, 30 * DAY, null]);
    check('cutoffFor since = local midnight', XBE.cutoffFor('since', '2026-10-15', now).getTime(), new Date(2026, 9, 15).getTime());
    let err = '';
    try { XBE.cutoffFor('since', '', now); } catch (e) { err = e.message; }
    check('cutoffFor since without a date throws', err, 'Pick a start date for "Since".');
    check('recencyLabel', [XBE.recencyLabel('24h'), XBE.recencyLabel('7d'), XBE.recencyLabel('all'), XBE.recencyLabel('since', '2026-10-15')], ['Last 24h', 'Last 7 days', 'All', 'Since 2026-10-15']);
    check('localDateTime', XBE.localDateTime(new Date(2026, 0, 5, 7, 3)), '2026-01-05 07:03');
    check('fileName uses the local date', XBE.fileName(new Date(2026, 0, 5, 23, 59)), 'bookmarks-2026-01-05.md');
    const t = new Date(2026, 9, 18, 9, 30, 15), iso = XBE.localIso(t);
    check('localIso: local time with offset, same instant', [/^2026-10-18T09:30:15[+-]\d\d:\d\d$/.test(iso), Date.parse(iso) === t.getTime()], [true, true]);
    return doc.posts;
  }

  function testMarkdown(posts) {
    const meta = { exportedAt: new Date(2026, 9, 18, 9, 30, 15), page: '/i/bookmarks', recency: 'All', cutoff: null, max: 'All', seen: 9, stopReason: 'end of list' };
    const md = XBE.toMarkdown(posts, meta);
    const L = md.split('\n');
    showMarkdown('Source: parser.toMarkdown called directly on the fixture (run-loop output replaces this when it finishes).', md);
    check('header: title', L[0], '# X bookmarks export');
    check('header: fields', [
      L.includes(`- Exported: ${XBE.localIso(meta.exportedAt)}`), L.includes('- Page: /i/bookmarks'),
      L.includes('- Filter: recency = All; max = All'), L.includes('- Posts seen while scrolling: 9; exported: 8'),
      L.includes('- Stop reason: end of list')], [true, true, true, true, true]);
    const order = L.find(l => l.startsWith('- Order: ')) || '';
    check('header: ordering + recency caveat', [order.startsWith('- Order: newest first by post date.'), order.includes('in the order you saved them'), order.includes('15 posts in a row older than the cutoff')], [true, true, true]);
    check('entries newest first by post date, local "YYYY-MM-DD HH:MM"', headings(md), NEWEST_FIRST.map((n, i) => heading(i + 1, n)));
    check('entry: heading, URL, blockquote lines, empty lines omitted', md.includes(
      `${heading(1, 1)}\n\nhttps://x.com/alice_dev/status/${id(1)}\n\n> Shipping a tiny tool today.\n` +
      `> No build step, no dependencies. Thanks @bob_builds for the review #buildinpublic\n\n${heading(2, 7)}\n`), true);
    check('entry lines: links, media, quoted, article, truncated text', [
      L.includes(ERIN_LINKS), L.includes('- Media: 2 images'), L.includes('- Media: 1 video'),
      L.includes('- Quoted: https://x.com/ivan_original/status/1845000000000000999'),
      L.includes('- Article: [Why I export my bookmarks every day](https://x.com/i/article/1844000000000000111)'),
      L.includes('> Thread on why local-first tools matter: …(truncated)')], [true, true, true, true, true, true]);
    check('toMarkdown dedupes by id', headings(XBE.toMarkdown([...posts, posts[0]], meta)).length, 8);
    const empty = XBE.toMarkdown([], { ...meta, seen: 0 }).split('\n');
    check('empty bookmarks: file says 0 bookmarks', [empty.includes('- Posts seen while scrolling: 0; exported: 0'), empty.includes('0 bookmarks.')], [true, true]);
    check('nothing matched the filter', XBE.toMarkdown([], meta).split('\n').includes('0 bookmarks matched the filter.'), true);
    check('header: cutoff shown for date filters', XBE.toMarkdown(posts, { ...meta, recency: 'Since 2026-10-15', cutoff: new Date(2026, 9, 15), max: '100' })
      .split('\n').includes('- Filter: recency = Since 2026-10-15 (posts dated on/after 2026-10-15 00:00); max = 100'), true);
    const odd = { ...posts[0], links: [{ title: 'a [b]', url: 'https://e.com/x_(y)' }], images: 1, videos: 2 };
    const oddLines = XBE.toMarkdown([odd], meta).split('\n');
    check('markdown escaping + singular/plural media', [oddLines.includes('- Links: [a \\[b\\]](https://e.com/x_%28y%29)'), oddLines.includes('- Media: 1 image, 2 videos')], [true, true]);
  }

  function send(msg) {
    let reply;
    chrome.runtime.onMessage.listeners[0](msg, {}, r => { reply = r; });
    return reply;
  }

  function testGating() {
    check('content.js registered one message listener', chrome.runtime.onMessage.listeners.length, 1);
    check('status off the bookmarks page (this file:// page)', send({ type: 'status' }), { onBookmarks: false, hint: '', state: 'idle', seen: 0, kept: 0, message: '' });
    const refused = send({ type: 'start', options: { recency: 'all', max: 'all' } });
    check('start refused off the bookmarks page', [refused.error, refused.state], ['Open your X bookmarks page to export', 'idle']);
    check('no overlay after a refused start', !!$('xbe-overlay'), false);

    const real = { isHistoryPath: XBE.isHistoryPath, isBookmarksPage: XBE.isBookmarksPage };
    Object.assign(XBE, { isHistoryPath: () => true, isBookmarksPage: () => false }); // pretend: /i/history, Likes tab
    const onLikes = send({ type: 'start', options: { recency: 'all', max: 'all' } });
    check('History page, Likes tab: start refused with a Bookmarks-tab hint', [onLikes.error, onLikes.onBookmarks, onLikes.hint, onLikes.state],
      ['Open your X bookmarks page to export', false, 'Select the Bookmarks tab on this page (not Likes).', 'idle']);
    XBE.isBookmarksPage = () => true; // ...and the Bookmarks tab
    check('History page, Bookmarks tab: ready, no hint', [send({ type: 'status' }).onBookmarks, send({ type: 'status' }).hint], [true, '']);
    Object.assign(XBE, real);
  }

  async function testRunLoop(fixtureNodes) {
    // Capture saved files synchronously: under virtual time, awaiting blob I/O lets pending timers jump ahead.
    const files = [];
    window.Blob = class extends Blob {
      constructor(parts, opts) { super(parts, opts); files.push({ text: parts.join(''), name: null }); }
    };
    addEventListener('click', e => {
      const a = e.target instanceof Element && e.target.closest('a[download]');
      if (!a) return;
      e.preventDefault(); // never let the test page download anything
      if (files.length) files[files.length - 1].name = a.download;
    }, true);
    const restoreStage = () => $('stage').replaceChildren(...fixtureNodes.map(n => n.cloneNode(true)));
    const realPage = XBE.isBookmarksPage;
    XBE.isBookmarksPage = () => true; // pretend this file:// page is x.com/i/bookmarks

    async function exportRun(options, during) {
      const before = files.length;
      send({ type: 'start', options });
      if (during) await during();
      await waitFor(() => send({ type: 'status' }).state !== 'running', 120000);
      const file = files.length > before ? files[files.length - 1] : null;
      const text = file ? file.text : '';
      return { st: send({ type: 'status' }), file, text, lines: text.split('\n') };
    }

    let live = '';
    const all = await exportRun({ recency: 'all', max: 'all' }, async () => {
      await waitFor(() => send({ type: 'status' }).seen > 0, 10000);
      live = $('xbe-overlay') ? $('xbe-overlay').firstChild.textContent : '';
    });
    const name = XBE.fileName(new Date());
    check('run: overlay shows live count', live, 'Exporting X bookmarks: seen 9, kept 8');
    check('run: finished, final counts', [all.st.state, all.st.seen, all.st.kept], ['done', 9, 8]);
    check('run: saved via <a download> with local-date file name', all.file && all.file.name, name);
    check('run: stop reason end of list, header counts', [all.lines.includes('- Stop reason: end of list'), all.lines.includes('- Posts seen while scrolling: 9; exported: 8')], [true, true]);
    check('run: saved file has entries newest first', headings(all.text), NEWEST_FIRST.map((n, i) => heading(i + 1, n)));
    check('run: status message for the popup', all.st.message, `Saved ${name}: exported 8 of 9 posts seen (end of list).`);
    check('run: overlay shows the result, then is removed', [$('xbe-overlay') && $('xbe-overlay').firstChild.textContent, await sleep(6500).then(() => !$('xbe-overlay'))], [all.st.message, true]);
    if (all.text) showMarkdown('Source: the file content.js saved in the end-to-end run on the fixture (recency All, max All). "Page" is this test file because tests run from file://.', all.text);

    const realHistory = XBE.isHistoryPath;
    XBE.isHistoryPath = () => true; // this run pretends to be on /i/history (Bookmarks tab selected in the fixture)
    const max3 = await exportRun({ recency: 'all', max: '3' });
    XBE.isHistoryPath = realHistory;
    check('run: header names the History tab that was exported', (max3.lines.find(l => l.startsWith('- Page: ')) || '').endsWith(' (Bookmarks tab)'), true);
    check('run: max reached stops and keeps the first 3 saves', [max3.lines.includes('- Stop reason: max reached (3)'), max3.lines.includes('- Filter: recency = All; max = 3'), headings(max3.text)],
      [true, true, [heading(1, 1), heading(2, 3), heading(3, 2)]]);

    const since = await exportRun({ recency: 'since', since: '2026-10-15', max: 'all' });
    check('run: recency filters by post date', [since.st.kept, since.lines.includes('- Filter: recency = Since 2026-10-15 (posts dated on/after 2026-10-15 00:00); max = All'), headings(since.text)],
      [4, true, [heading(1, 1), heading(2, 7), heading(3, 3), heading(4, 4)]]);

    const stopped = await exportRun({ recency: 'all', max: 'all' }, () => send({ type: 'stop' }));
    check('run: popup Stop exports what was collected, header says so', [stopped.lines.includes('- Stop reason: stopped by user (partial export of what was collected)'), headings(stopped.text).length], [true, 8]);

    const overlayStop = await exportRun({ recency: 'all', max: 'all' }, () => $('xbe-overlay').lastChild.click());
    check('run: overlay Stop button stops the run', overlayStop.lines.includes('- Stop reason: stopped by user (partial export of what was collected)'), true);

    const left = await exportRun({ recency: 'all', max: 'all' }, () => { XBE.isBookmarksPage = () => false; });
    XBE.isBookmarksPage = () => true;
    check('run: leaving the bookmarks page stops the run', left.lines.includes('- Stop reason: left the bookmarks page (partial export of what was collected)'), true);

    for (const t of [...$('stage').querySelectorAll('time')]) t.replaceWith(Object.assign(document.createElement('span'), { textContent: t.textContent }));
    const broken = await exportRun({ recency: 'all', max: 'all' });
    check('run: layout change aborts loudly and writes no file', [broken.st.state, broken.st.message, broken.file], ['error', LAYOUT_MSG(0, 8), null]);
    check('run: abort message stays in the overlay', await sleep(7000).then(() => $('xbe-overlay') && $('xbe-overlay').firstChild.textContent), LAYOUT_MSG(0, 8));
    $('xbe-overlay').lastChild.click();
    check('run: overlay Close removes it', !!$('xbe-overlay'), false);

    $('stage').replaceChildren();
    const empty = await exportRun({ recency: 'all', max: 'all' });
    check('run: empty bookmarks writes a file saying 0 bookmarks', [empty.st.state, empty.lines.includes('- Posts seen while scrolling: 0; exported: 0'), empty.lines.includes('0 bookmarks.')], ['done', true, true]);

    restoreStage();
    XBE.isBookmarksPage = realPage;
  }

  addEventListener('load', () => {
    $('env').textContent = `Time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}, local now: ${XBE.localIso(new Date())}`;
    const doc = $('fixture').contentDocument;
    if (!doc || !doc.querySelector('article')) {
      $('summary').textContent = 'SUMMARY: FAIL cannot read fixture-bookmarks.html (run Chrome with --allow-file-access-from-files)';
      return;
    }
    const fixtureNodes = [...doc.body.childNodes].map(n => document.importNode(n, true));
    $('stage').replaceChildren(...fixtureNodes.map(n => n.cloneNode(true)));
    testMarkdown(testParser());
    testGating();
    const syncPass = pass, syncTotal = total;
    $('summary').textContent = `SUMMARY: ${syncPass === syncTotal ? 'PASS' : 'FAIL'} ${syncPass}/${syncTotal} synchronous tests (parser + gating). ` +
      'content.js run-loop tests: NOT RUN in this dump (they need --virtual-time-budget=300000; see README).';
    testRunLoop(fixtureNodes)
      .catch(e => check('run-loop tests finished without throwing', String(e), 'no error'))
      .then(() => { $('summary').textContent = `SUMMARY: ${pass === total ? 'PASS' : 'FAIL'} ${pass}/${total} (all tests, including the content.js run loop)`; });
  });
})();
