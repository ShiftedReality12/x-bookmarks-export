# Changelog

Versions follow [Semantic Versioning](https://semver.org/). The version lives in `manifest.json`;
each release is tagged `vX.Y.Z`.

## 0.1.1 — 2026-10-18

### Fixed
- X now shows bookmarks at `https://x.com/i/history` (Bookmarks and Likes tabs), so the popup stayed
  disabled there. That page now counts as the bookmarks page when its **Bookmarks** tab is selected.
  The Likes tab is refused with the hint "Select the Bookmarks tab on this page (not Likes).", and
  switching tabs mid-run stops the run so likes are never exported as bookmarks.
- The file header's `Page:` line names the History tab that was exported.

### Not yet verified
- Tab detection (`[role="tab"][aria-selected="true"]` reading "Bookmarks") is tested against the
  fixture only, not yet on a live X page.

## 0.1.0 — 2026-10-18

- First release: MV3 extension that exports the X bookmarks page to `bookmarks-YYYY-MM-DD.md` by
  reading the rendered page only (no network requests, no storage, no credentials).
