# Subtitle Correction & Translation — Step 1

A local browser-based SRT editor made with HTML, CSS and vanilla JavaScript.

## Included in Step 1

- Sticky top navigation
- Upload `.srt`
- Parse and visually display subtitle blocks
- Timestamp displayed with each subtitle
- ✏️ Edit button for every subtitle
- Save/cancel inline editing
- ✅ Apply changes button, disabled by default
- Download edited SRT with `_Edited.srt`
- Translate button opens separate English and Russian browser windows
- Translation windows have a loading state
- Responsive layout

## Intentionally not implemented yet

- AI analysis
- AI mistake detection
- Red/yellow/blue highlighting
- AI correction generation
- Actual English/Russian translation
- Word-order validation
- Translation downloads

These are reserved for later steps.

## Run locally

No server is required for Step 1.

1. Extract the folder.
2. Open `index.html` in a browser.

For a localhost server, from this folder run for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.
