# Chrome Web Store listing: Nightcell

Everything the Developer Dashboard asks for, ready to paste. The upload is
`dist/nightcell-1.0.0.zip` (run `zsh scripts/build-zip.sh` first; it also refreshes the copy the
site serves at `/nightcell.zip`).

## Package

| Field | Value |
|---|---|
| Name (from the manifest) | Nightcell: Dark Mode for Google Sheets |
| Summary (manifest `description`, 114 of 132 characters) | A real dark mode for Google Sheets. Cells, charts, menus and dialogs go dark, and your cell colours stay readable. |
| Version | 1.0.0 |
| Upload | `dist/nightcell-1.0.0.zip` |

## Store listing tab

**Description** (plain text, paste as is):

```
Google Sheets on the web still has no dark mode. Many dark-mode extensions invert the page, so a red total turns cyan, a green row turns purple and charts go photo-negative.

Nightcell repaints the grid as Sheets draws it. Each colour keeps its hue and moves into the dark: a pastel yellow row becomes deep amber, red negatives stay red, and text is lifted until it reads on whatever cell it sits on. All 180 fill and text pairs in our test suite read at 5:1 contrast or better, in every theme.

WHAT GOES DARK
• The cell grid: fills, conditional formatting, banding, checkboxes, dropdown chips and sparklines
• Charts: backgrounds and labels go dark, your series colours stay as you chose them
• Menus, toolbar, formula bar, sheet tabs, dialogs, sidebars, tooltips and comments
• New Google pop-ups: a safety net darkens light panels the stylesheet has not seen yet

YOUR CALL
• Four themes: Graphite, Midnight (blue-black), OLED (true black) and Dim (soft grey)
• Alt+Shift+D turns dark mode on or off without a reload
• Keep one sheet light while the rest go dark, or follow your computer's appearance

NOTHING ELSE CHANGES
Your file is untouched. Collaborators see the normal sheet, colour pickers show the real colours, and printing or PDF export stays light.

PRIVATE BY DESIGN
No servers, no analytics, no network requests. Nightcell never reads, stores or sends what is in your cells. It runs only on docs.google.com/spreadsheets and asks for one permission, storage, to remember your settings.

Free and open source (MIT): https://github.com/TheHardikDewra/sheets-dark-mode
```

| Field | Value |
|---|---|
| Category | Productivity > Tools (where the Sheets dark-mode listings sit). Alternative: Make Chrome Yours > Functionality & UI |
| Language | English |
| Store icon (128x128) | `extension/icons/icon128.png` (96x96 artwork, 16px transparent padding, per Google's image guidelines) |
| Screenshot 1 (1280x800) | `store/screenshot-1-grid.png`: the demo budget sheet in Graphite |
| Screenshot 2 (1280x800) | `store/screenshot-2-light-vs-dark.png`: light and dark, side by side |
| Small promo tile (440x280) | `store/promo-small-440x280.png` |
| Marquee promo tile (1400x560) | not made (optional) |
| Homepage URL | https://nightcell-sheets.vercel.app |
| Support URL | https://github.com/TheHardikDewra/sheets-dark-mode/issues |
| Mature content | No |

Every screenshot comes from the fake-data demo sheet built by `test/demo-sheet.gs`.

## Privacy practices tab

**Single purpose:**

```
Nightcell gives Google Sheets a dark theme: it recolours the spreadsheet grid, charts and the Sheets interface so they are comfortable to read in the dark.
```

**Permission justifications:**

| Permission | Justification (paste) |
|---|---|
| `storage` | Saves the user's own settings (on or off, theme, chart colour mode, follow system appearance, and the list of sheets kept light or dark) with chrome.storage.sync. Nothing else is stored. |
| Host permission `https://docs.google.com/spreadsheets/*` | The content scripts that apply the dark theme run only on Google Sheets pages. They recolour what Sheets draws and style the Sheets interface. No other site is accessed. |

**Remote code:** No, I am not using remote code. Every script ships inside the package.

**Data usage:** tick none of the data types. Nightcell collects no user data. Then tick all three
certifications:

- I do not sell or transfer user data to third parties, apart from the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://nightcell-sheets.vercel.app/privacy

## Distribution tab

| Field | Value |
|---|---|
| Payments | Free |
| Visibility | Public |
| Regions | All regions |

## Test instructions (optional field for reviewers)

```
No account or setup needed beyond any Google account. Open any Google Sheet (for example https://sheets.new). The sheet loads dark. Alt+Shift+D turns dark mode off and on. The toolbar popup switches between the four themes and can keep the current sheet light.
```

## Hardik's steps (the parts only you can do)

1. Open https://chrome.google.com/webstore/devconsole with the Google account you want as the
   publisher, accept the developer agreement and pay the one-time $5 registration fee.
2. Fill in the account details. Google asks whether you are a trader under EU law: if you
   declare as a trader, your verified contact details are shown on the listing. That call is
   yours.
3. Click **New item**, upload `dist/nightcell-1.0.0.zip`.
4. Paste the store listing, privacy and distribution fields above, upload the icon and images.
5. Click **Submit for review**. Google reviews it before it goes live, and the review time varies.
6. When it is live, swap the site's download buttons for the store link and update the
   "Not on the Chrome Web Store yet" line in `site/index.html`.
