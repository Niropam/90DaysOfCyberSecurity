# 📄 PDF Studio — Reader & Editor

A self-contained, offline PDF reader and editor that runs entirely in the
browser. No server, no uploads — documents never leave your machine.

## Features

All tools live in the **sidebar navigation menu**:

- **👁️ Read** — continuous scrolling viewer with page navigation, zoom and
  fit-to-width.
- **✏️ Edit Text** — click anywhere on a page to add a text box (font size and
  color configurable). Turn on *Whiteout background* and place a box over
  existing text to replace it — the white box covers the original when saved.
- **✍️ Insert Signature** — draw a signature with mouse/finger, type it in a
  script font, or upload an image. Then click on the page to place it; drag to
  move, use the corner handle to resize. Multiple signatures can be kept and
  reused.
- **🗂️ Rearrange Pages** — drag page thumbnails to reorder, remove pages (with
  restore), all applied on save.
- **💾 Download PDF** — produces an edited copy (`<name>-edited.pdf`) with all
  text, signatures, page order and deletions baked in.

## Running it

The app uses ES modules, so it needs to be served over HTTP (opening
`index.html` directly from the filesystem won't work):

```bash
cd pdf-reader
python3 -m http.server 8080
# open http://localhost:8080
```

Any static file server works. Everything is bundled — it also works fully
offline.

## Tech

| Piece | Library |
|-------|---------|
| Rendering / reading | [pdf.js](https://mozilla.github.io/pdf.js/) (vendored in `vendor/`) |
| Writing the edited PDF | [pdf-lib](https://pdf-lib.js.org/) (vendored in `vendor/`) |
| UI | Plain HTML/CSS/JS, no framework |

## Notes & limitations

- Text editing works by overlaying new text (optionally on a whiteout box) —
  the original PDF text stream is not reflowed.
- Added text uses the standard Helvetica font; characters outside the
  Latin-1 range are replaced when saving.
- Pages that carry embedded rotation metadata (some scanned documents) may
  need overlay positions adjusted manually.

## Android

See [`../pdf-reader-android`](../pdf-reader-android) for the Android app that
wraps this exact web app in a WebView.
