# zoo-mash-demo

Zoo Mash: a phone-first web demo, served by GitHub Pages at https://brocksivley.github.io/zoo-mash-demo/.

## What's in it
- **Title**: the zoo gate, a menu (Play / Zoopedia / Scores / Settings), with Settings as a menu item (no corner gear on the title). Three small pixel-art touches, all silent:
  - **Penguin**: tap him and he waddles (about 0.6 s). Tap him more than 5 times within 2 s and he tips over backwards, bounces, lies feet-up for about 1.5 s, then gets back up. Taps are ignored while he is falling.
  - **Bear**: waves 5 s after the app opens, then every 15 s while the title is showing (about 1.5 s per wave).
  - **Monkey**: tap him and he raises a banana over his head, then lowers it (about 1.5 s). Taps are ignored while he is moving.
  - Their tap areas sit above the menu, so tapping them never opens a menu item.
- **Biome map**: 8 islands along a winding cliff path (Forest, Ocean, Farm, Arctic, Oriental, Savannah, Jurassic, Space). Each has its sign. Locked islands use their locked art and cannot be selected. Tap an unlocked island to select it: it glows gold, its animal hops and its plants sway. The panel then shows that biome's best score and how many animals you've found. Play starts that biome.
- **Progression**: Forest is open from the start. **Reaching a biome's tier-11 animal (by merging two tier-10s) unlocks the next biome on the map.** A "… UNLOCKED!" toast appears when that happens.
- **All 8 biomes are playable**. They all use the same drop-and-merge game and the same physics (gravity 10, bounce 0.20, weight ×1.10) and scoring. Each biome has its own 11 animals, from tier 1 to tier 11. Merging two tier-11 animals clears both with a "ZOO MASH!" celebration and +250 points.
  - Each biome has its own pixel-art backdrop (pixelated scaling) and a themed HUD, NEXT frame and evolution bar (`ui-themes/themes.css`, selected by `body[data-biome]`). The evolution bar shows that biome's animals, with "?" for ones you haven't found yet.
  - Each backdrop has 1–2 subtle ambient animations (`ambient.js`):

    | Biome | Animations |
    |---|---|
    | Forest | squirrel on a bough, fireflies |
    | Ocean | rising bubbles, a passing fish school |
    | Farm | drifting clouds, turning windmill |
    | Arctic | shimmering aurora, light snow |
    | Oriental | falling petals, waterfall sparkle |
    | Savannah | a flock of birds, swaying grass |
    | Jurassic | volcano smoke, a gliding pterodactyl |
    | Space | twinkling stars, an occasional comet |

    The animations are drawn behind the animals on a separate canvas and have no effect on physics. They freeze when the game is paused, when it is over, or when the tab is hidden.
- **Zoopedia**: a field guide drawn as a real open hardcover book on the desk (thick leather cover with brass corners, curved aged pages with a deep spine valley, stacked page edges, cloth tabs and a ribbon).
  - There is one two-page spread per biome: 11 animals each, 88 in total.
  - Found animals are tipped-in plates with captions. Missing ones are plain blocks with a "?".
  - Entries are numbered No.01–No.88 across all biomes, ending with Space's Sun as No.88.
  - Turn pages with the arrows, the dog-eared page corners, a swipe, or the arrow keys. The biome bookmark tabs jump to a spread.
  - Tap a found animal to open its fun-fact page.
  - An animal counts as found once it appears in gameplay, in any biome.
- **Scores**: your best score for each unlocked biome. Each biome keeps its own best.
- **Settings** has a demo-only "Unlock all (demo)" toggle. It unlocks every biome on the map and marks all 88 Zoopedia animals as found.

## Deep links
`#map`, `#play` (Forest), `#play-<biome>` (e.g. `#play-ocean`, `#play-jurassic`, `#play-space`), `#zoopedia` (or `#zoo`), `#scores`

## Notes
- This is a static site with no build step. `.nojekyll` makes GitHub Pages serve the files as they are.
- Progress is saved in the browser's localStorage, per biome: `zoomash.<biome>.best` and `zoomash.<biome>.seen`.
- There is no sound yet. Audio will be added later.
- Physics uses Matter.js (MIT license, see `matter-LICENSE.txt`). The font is Silkscreen (OFL).
