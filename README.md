# zoo-mash-demo

Zoo Mash: a phone-first web demo, served by GitHub Pages at https://brocksivley.github.io/zoo-mash-demo/.

## What's in it
- **Title**: the zoo gate, a menu (Play / Zoopedia / Scores / Settings), with Settings as a menu item (no corner gear on the title).
- **Biome map**: 8 islands along a winding cliff path. Forest is playable and the other 7 are locked.
- **Forest level**: the drop-and-merge game, with 11 tiers from ladybug to bear.
- **Zoopedia**: a field guide drawn as a real open hardcover book on the desk (thick leather cover with brass corners, curved aged pages with a deep spine valley, stacked page edges, cloth tabs and a ribbon), one two-page spread per biome (11 animals each, 88 total). Found animals are tipped-in plates with captions; missing ones are plain blocks with a "?"; entries are numbered No.01-No.88 across all biomes. Turn pages with the arrows, the dog-eared page corners, a swipe, or the arrow keys; biome bookmark tabs jump to a spread. Tap a found animal for its fun-fact page. An animal is recorded as found once it appears in gameplay.
- **Scores**: your best score for each biome.
- **Settings** has a demo-only "Unlock all (demo)" toggle that marks every Zoopedia animal as found.

## Deep links
`#map`, `#play`, `#zoopedia` (or `#zoo`), `#scores`

## Notes
- This is a static site with no build step. `.nojekyll` makes GitHub Pages serve the files as they are.
- Progress (best score and found animals) is saved in the browser's localStorage.
- There is no sound yet. Audio will be added later.
- Physics uses Matter.js (MIT license, see `matter-LICENSE.txt`). The font is Silkscreen (OFL).
