// popup.js: shows the active tab's export status (polled every 700 ms) and sends start/stop to content.js.
const $ = id => document.getElementById(id);
const BOOKMARKS_URL = 'https://x.com/i/bookmarks';
let tabId = null;

// Resolves null when no content script answers (not x.com, or the tab was opened before install).
function send(message) {
  return new Promise(resolve => {
    if (tabId === null) return resolve(null);
    chrome.tabs.sendMessage(tabId, message, reply => resolve(chrome.runtime.lastError ? null : reply || null));
  });
}

function render(s) {
  const running = !!s && s.state === 'running';
  const ready = !!s && s.onBookmarks;
  $('off').hidden = ready || running;
  $('start').disabled = !ready || running;
  $('stop').disabled = !running;
  for (const id of ['recency', 'since', 'max']) $(id).disabled = running;
  $('count').textContent = `seen ${s ? s.seen : 0}, kept ${s ? s.kept : 0}`;
  $('msg').textContent = !s ? '' : s.error || s.message ||
    (running ? 'Exporting. You can close this popup; the export keeps running in the tab.' : '');
  $('msg').classList.toggle('error', !!s && (!!s.error || s.state === 'error'));
}

$('recency').addEventListener('change', () => { $('since').hidden = $('recency').value !== 'since'; });
$('go').addEventListener('click', () => {
  if (tabId === null) chrome.tabs.create({ url: BOOKMARKS_URL });
  else chrome.tabs.update(tabId, { url: BOOKMARKS_URL });
  window.close();
});
$('form').addEventListener('submit', async e => {
  e.preventDefault();
  const options = { recency: $('recency').value, since: $('since').value, max: $('max').value };
  render(await send({ type: 'start', options }));
});
$('stop').addEventListener('click', async () => render(await send({ type: 'stop' })));

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  tabId = tabs[0] ? tabs[0].id : null;
  const poll = async () => render(await send({ type: 'status' }));
  poll();
  setInterval(poll, 700);
});
