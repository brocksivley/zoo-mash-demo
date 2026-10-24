# zoo-mash-demo

Zoo Mash: a phone-first web demo, served by GitHub Pages at https://brocksivley.github.io/zoo-mash-demo/.

## What's in it
- **Title**: the zoo gate, a menu (Play / Zoopedia / Scores / Settings), and the gear in the top-right corner.
- **Biome map**: 8 islands along a winding cliff path. Forest is playable and the other 7 are locked.
- **Forest level**: the drop-and-merge game, with 11 tiers from ladybug to bear.
- **Zoopedia**: a book with one spread per biome covering all 88 animals, each with a fun fact. An animal is recorded as found once it appears in gameplay.
- **Scores**: your best score for each biome.
- **Settings** has a demo-only "Unlock all (demo)" toggle that marks every Zoopedia animal as found.

## Deep links
`#map`, `#play`, `#zoopedia` (or `#zoo`), `#scores`

## Notes
- This is a static site with no build step. `.nojekyll` makes GitHub Pages serve the files as they are.
- Progress (best score and found animals) is saved in the browser's localStorage.
- There is no sound yet. Audio will be added later.
- Physics uses Matter.js (MIT license, see `matter-LICENSE.txt`). The font is Silkscreen (OFL).
