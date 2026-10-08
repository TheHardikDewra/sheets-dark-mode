# Nightcell privacy policy

Last updated: 8 October 2026

Nightcell is a browser extension that changes how Google Sheets looks. It is built to know
as little about you as possible.

## What Nightcell collects

Nothing. Nightcell has no servers, no analytics, no crash reporting and no tracking. It makes
no network requests of any kind.

## What Nightcell stores

Your settings, and only your settings, in your browser's own extension storage
(`chrome.storage.sync`): whether dark mode is on, which theme you picked, whether to follow your
computer's appearance, how charts are treated, and a list of sheet IDs you chose to keep light or
dark. If you use Chrome sync, Chrome syncs these settings between your own browsers. Nightcell
also mirrors the on/off state and theme into the Google Sheets page's local storage under the key
`nightcell:state:v1`, so a sheet opens dark without a flash of white. Nothing else is stored.

## What Nightcell can see

Nightcell runs only on `docs.google.com/spreadsheets`. To recolour the grid it changes the colours
Google Sheets passes to the drawing canvas; it does not read, copy, store or send the text or
numbers in your cells, and it never sees your Google account details.

## Permissions

- `storage`: to save your settings.
- Access to `https://docs.google.com/spreadsheets/*`: to apply the theme there.

## Changes and contact

If this policy ever changes, the new version will be published here with a new date.
Questions: open an issue at https://github.com/TheHardikDewra/sheets-dark-mode/issues
