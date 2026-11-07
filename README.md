# FreeCell (ja / ko)

Dependency-free FreeCell for the web. Based on FreecellJS by Brent Ely (MIT).

## Layout (GitHub Pages: one folder per page, all siblings)
| Folder | Language | URL |
|---|---|---|
| `freecell-game/` | Japanese (default, x-default) + **all shared assets** (`css/`, `js/`, `img/`, `sounds/`) | /freecell-game/ |
| `freecell-ko/` | Korean | /freecell-ko/ |
| `freecell-classic/` | English | /freecell-classic/ |
| `freecell-gratuit/` | French | /freecell-gratuit/ |
| `freecell-kostenlos-spielen/` | German | /freecell-kostenlos-spielen/ |
| `freecell-solitaire/`, `freecell/` | redirect stubs for the two old URLs | |

Every page links the shared assets from `../freecell-game/`, so keep the folders side by side.

`css/game.css` and `js/game.js` are the readable sources; the pages load the minified `*.min.*` files
(`npx esbuild js/game.js --minify --target=es2017 --outfile=js/game.min.js`, same for the CSS).

## Notes
- No jQuery, no web fonts, no ads/third-party scripts, no external requests.
- Progress, options and background are saved in `localStorage` (`fc.*` keys).
- Deal numbers are this game's own (not Microsoft-compatible); you can start any deal 1–1000000 from the New game dialog.
- Table backgrounds are generated SVGs (`img/bg-*.svg`), also used as the option thumbnails.

Sounds: freesound.org (f4ngy, deathpie), soundbible.com (crowd cheer).

## License
MIT – Copyright (c) 2015-2016 Brent Ely (FreecellJS); modifications 2026.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
