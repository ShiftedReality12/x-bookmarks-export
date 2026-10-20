# x-bookmarks-export

A tiny, privacy-first Chrome extension (Manifest V3) that saves your X (Twitter) bookmarks to a Markdown
file. It reads the bookmarks page that X already shows you and nothing else: no network requests,
no storage, no credentials, no build step, no dependencies.

> **Status: not tested live on a real account.** The parser and the scroll loop are tested against a
> hand-written fixture that imitates X's page (see [Tests](#tests)). Until someone runs it on a real
> bookmarks page, treat the first export as a check of the `SELECTORS` in `parser.js`.

## What it does

<!-- TODO: add a screenshot of the popup, e.g. docs/popup.png -->

On your bookmarks page (`https://x.com/i/bookmarks`, or on newer X the **Bookmarks** tab of
`https://x.com/i/history`) it scrolls the page, reads each post X renders (`<article>` elements),
and saves `bookmarks-YYYY-MM-DD.md` (local date) through a normal page download. Each entry has the
author, post date, canonical URL (`https://x.com/<handle>/status/<id>`), the text as a blockquote,
links (with the expanded URL or card title), media counts, the quoted post and the X article title
when present. Entries are deduplicated by status ID and sorted newest first by post date.

## Requirements

- Google Chrome, or another Chromium-based browser that supports Manifest V3 extensions and
  **Load unpacked** (for example Edge or Brave). Firefox and Safari are not supported.
- An X account that is logged in on `x.com` in that browser.
- Nothing else: no Node, no build step, no dependencies.

## Install (Load unpacked)

1. Download or clone this repository:
   `git clone https://github.com/ShiftedReality12/x-bookmarks-export.git`
   (or **Code → Download ZIP** on GitHub and unzip it).
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the repository folder. Then reload any x.com tab that was
   already open, because Chrome injects the content script only into pages loaded after install.

## Usage

1. Open your bookmarks: `https://x.com/i/bookmarks`, or on newer X the **Bookmarks** tab of
   `https://x.com/i/history` (that page also has a **Likes** tab, which is refused so likes are never
   exported as bookmarks). On any other page the popup is disabled and shows **Go to Bookmarks**,
   which opens `x.com/i/bookmarks` in the current tab.
2. Click the extension icon, pick **Recency** (Last 24h, 7 days, 30 days, All, or Since a date) and
   **Max posts** (50, 100, 500, All), then click **Start**.
3. Watch the counter (`seen N, kept M`) in the popup or in the small box at the bottom right of the
   page. Closing the popup does not stop the run. **Stop** (in either place) saves what was
   collected so far, and the file header says it was stopped.
4. The file goes to your normal download location.

Keep the X tab in front while it runs: Chrome slows timers in background tabs, and X may not
load more posts in a hidden tab.

**Bookmark folders:** `/i/bookmarks/<folderId>` counts as a bookmarks page, so you can export one
folder. The file's `Page:` line says which list was exported. Folders have not been tested.

## Permissions, line by line

| Manifest entry | Why |
| --- | --- |
| `"permissions"` | None. |
| `content_scripts.matches: ["https://x.com/*"]` | Needed to read the bookmarks page. It matches all of x.com because X is a single-page app: when you click Bookmarks from Home, the page does not reload, so a script matched only to `/i/bookmarks` would not be there. The script is idle until the popup asks, and refuses to start unless `location.pathname` is `/i/bookmarks` (or a folder), or `/i/history` with its Bookmarks tab selected (`[role="tab"][aria-selected="true"]` reads "Bookmarks"). Switching tab or page mid-run stops the run. Chrome shows this as "Read and change your data on x.com". |
| `content_scripts.js: ["parser.js", "content.js"]`, `run_at: "document_idle"` | `parser.js` holds the pure parsing code; `content.js` runs the scroll loop, the in-page counter and the save. |
| `action.default_popup: "popup.html"` | The popup with the filters, Start/Stop and the counter. |
| `content_security_policy.extension_pages` | `default-src 'none'; script-src 'self'; ...`: the popup can run only its own bundled script, cannot load remote code, and cannot connect anywhere. `style-src 'unsafe-inline'` allows only the popup's inline `<style>` block. |
| No `tabs` | `chrome.tabs.query`, `chrome.tabs.sendMessage` and `chrome.tabs.update(tabId, {url})` work without it. The popup never reads tab URLs; it asks the content script for status. |
| No `downloads` | The file is saved with a `Blob` and a temporary `<a download>` in the page, like any web page download. |
| No `storage`, no `host_permissions`, no background service worker | Not needed. Filters reset each time the popup opens. |

## Privacy

- The extension makes zero network requests of its own. There is no `fetch`, `XMLHttpRequest`,
  `WebSocket`, `sendBeacon`, `eval` or `new Function` in the code (see the grep in [Tests](#tests)).
- It never reads cookies, request headers or tokens, and never calls X's API. It reads only the
  page content X has already rendered for you.
- No storage, no analytics, no remote code. The Markdown file stays on your computer until you share it.
- Post text in the file is third-party content. The file header says to treat it as data, not instructions.

## Recency filter caveat

X lists bookmarks in the order you **saved** them, not by post date. The recency filter checks the
**post** date, and scrolling stops early only after 15 newly seen posts in a row are older than the
cutoff. So:

- an old post that you saved recently is left out, and
- a recent post that you saved before a run of 15 or more older saves can be missed.

If you need everything, use **All** with a max count. The same caveat is printed in every file header.

## When it stops

- **Max reached:** the kept count hits the max.
- **Recency cutoff:** 15 newly seen posts in a row are older than the cutoff.
- **End of list:** no new posts and no page growth for 6 steps.
- **Stop** in the popup or the page box, or leaving the bookmarks page: a partial export, and the header says so.
- **Safety caps:** 5000 posts or 30 minutes.

## Fails loudly

If posts are on the page but none parse, or more than 20% of the posts seen fail to parse (no
permalink or no time), the export is aborted and **no file is written**. The popup and the page box
show: `X's page layout changed: parsed A of B posts. Export aborted to avoid a partial file. Update
SELECTORS in parser.js.` The check runs during the scroll once 20 posts are seen, and always at the end.
Promoted posts (no permalink, plus a `placementTracking` marker or an "Ad" label) are skipped and
not counted. Empty bookmarks give a file that says `0 bookmarks.`

## Limits

- **DOM changes:** it depends on X's page structure. When X changes it, update `SELECTORS` in
  `parser.js` (compare them with a post in DevTools), adjust `test/fixture-bookmarks.html` to match,
  and run the tests.
- **Speed:** each step scrolls about 0.8 of a screen and waits 1.2 to 2.0 s (about 1.5 s on average).
  At roughly 5 to 10 posts per step, 1000 posts take a few minutes. Hard cap: 5000 posts or 30 minutes.
- **Virtualized list:** X keeps only the posts near the screen in the page, so the extension must
  scroll. It scrolls to the top first, so the newest saves are read first.
- **Long posts:** text over 280 characters becomes its first line plus ` …(truncated)`. X itself shows
  only part of long posts in the timeline.
- **Quoted posts:** X often does not put a link to the quoted post in the page. Then the file says
  `@handle (post link not shown on the page)`.
- **Links:** these are the `t.co` URLs that X puts in the page, titled with the expanded text or card title.
- **Folders:** accepted (see Usage) but not tested. x.com only (twitter.com redirects there).
- **Not tested live on a real account** yet.

## Tests

`test/run.html` loads `test/fixture-bookmarks.html` (hand-written to imitate X's bookmarks DOM, not
captured from a live page), `parser.js`, `content.js` (with a small stand-in for `chrome.runtime`) and
`test/tests.js`, and writes PASS/FAIL lines and the generated Markdown into the page. It covers the
parser (counts, dedupe, URLs, handles, dates, emoji, links, media, quotes, ads, malformed posts),
the Markdown output, `checkHealth`, the page gating, and the real `content.js` scroll loop (live
counter, max, recency, Stop from the popup and the page box, leaving the page, layout-change abort
with no file, empty bookmarks).

Run everything in headless Chrome (macOS path shown; on Linux use `google-chrome`, adding
`--no-sandbox` if you run as root):

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --user-data-dir=/tmp/xbe-chrome-1 --allow-file-access-from-files --virtual-time-budget=300000 \
  --dump-dom "file://$PWD/test/run.html" | grep -E "SUMMARY|FAIL"
```

- `--allow-file-access-from-files` lets the test page read the fixture file.
- `--virtual-time-budget` fast-forwards the scroll loop's real timers. Without it, `--dump-dom`
  captures the page at load and shows only the synchronous tests (parser and gating), and says so.
- In a visible Chrome window started with `--allow-file-access-from-files`, the run-loop tests take
  about a minute in real time.

The no-network check:

```sh
grep -nE "fetch\(|XMLHttpRequest|WebSocket|sendBeacon|document\.cookie|chrome\.cookies|webRequest|eval\(|new Function" *.js
```

It should print nothing.

## License

MIT, see [LICENSE](LICENSE).
