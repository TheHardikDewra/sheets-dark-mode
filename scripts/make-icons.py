"""Draws the pixel-moon icon at every size the extension and the site use. Usage: python3 scripts/make-icons.py

Every edge lands on a whole pixel, so nothing is scaled: 128 and 48 and 32 get the 9x9 cell grid
(8/3/2 px cells), 16 gets the moon as 1-pixel art, and the site gets SVG masters plus PNG favicons."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
INK, EMPTY, MOON = (0x14, 0x14, 0x14, 255), (0x1F, 0x1F, 0x1F, 255), (0xF2, 0xC1, 0x4E, 255)
# the moon, lit side bottom-left, one character per cell
MOON_BITMAP = [
    "...X.....",
    ".XX......",
    ".XX......",
    "XXX......",
    "XXXX.....",
    "XXXXX...X",
    "XXXXXXXXX",
    ".XXXXXXX.",
    "..XXXXX..",
]


def gridded(size, tile, cell, gap, bleed=False):
    """Dark tile holding the 9x9 cell grid: lit cells gold, the rest a step lighter than the tile."""
    im = Image.new('RGBA', (size, size), INK if bleed else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    t0 = 0 if bleed else (size - tile) // 2
    if not bleed:
        d.rectangle([t0, t0, t0 + tile - 1, t0 + tile - 1], fill=INK)
    span = 9 * cell + 8 * gap
    g0 = (size - span) // 2 if bleed else t0 + (tile - span) // 2
    for i, row in enumerate(MOON_BITMAP):
        for j, ch in enumerate(row):
            x, y = g0 + j * (cell + gap), g0 + i * (cell + gap)
            d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=MOON if ch == 'X' else EMPTY)
    return im


def pixel16():
    """16 px: the grid would blur, so the moon is drawn as 1-pixel art on a 14 px tile."""
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([1, 1, 14, 14], fill=INK)
    for i, row in enumerate(MOON_BITMAP):
        for j, ch in enumerate(row):
            if ch == 'X':
                d.point((4 + j, 3 + i), fill=MOON)
    return im


def svg(units, tile0, tile, grid0, cell, gap):
    cells = ''.join(
        f'<rect x="{grid0 + j * (cell + gap)}" y="{grid0 + i * (cell + gap)}" width="{cell}" height="{cell}" '
        f'fill="{"#F2C14E" if ch == "X" else "#1F1F1F"}"/>'
        for i, row in enumerate(MOON_BITMAP) for j, ch in enumerate(row))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {units} {units}" shape-rendering="crispEdges">'
            f'<rect x="{tile0}" y="{tile0}" width="{tile}" height="{tile}" fill="#141414"/>{cells}</svg>\n')


icons = ROOT / 'extension/icons'
gridded(128, 96, 8, 2).save(icons / 'icon128.png')  # 96 px artwork, 16 px transparent padding (store guideline)
gridded(48, 39, 3, 1).save(icons / 'icon48.png')
gridded(32, 28, 2, 1).save(icons / 'icon32.png')
pixel16().save(icons / 'icon16.png')

img = ROOT / 'site/img'
gridded(128, 96, 8, 2).save(img / 'icon128.png')
gridded(32, 28, 2, 1).save(img / 'icon32.png')
pixel16().save(img / 'icon16.png')
gridded(180, 180, 12, 3, bleed=True).convert('RGB').save(img / 'apple-touch-icon.png')  # iOS wants it opaque
(img / 'icon.svg').write_text(svg(32, 2, 28, 3, 2, 1))  # nav mark, shown at 32 px so cells stay whole

(ROOT / 'design/icon.svg').write_text(svg(128, 16, 96, 20, 8, 2))
(ROOT / 'design/icon-small.svg').write_text(svg(32, 2, 28, 3, 2, 1))
print('icons written')
