# zoo-mash-demo

Zoo Mash: a phone-first web demo, served by GitHub Pages at https://brocksivley.github.io/zoo-mash-demo/.

## What's in it
- **Title**: the zoo gate, a menu (Play / Zoopedia / Scores / Settings), with Settings as a menu item (no corner gear on the title). Three small pixel-art touches, all silent. Every move is a drawn pixel frame stepped at 6–8 fps; nothing is rotated or scaled when it's drawn:
  - **Penguin**: tap him and he waddles (about 0.6 s, a foot lifts on each step). Tap him more than 5 times within 2 s and he flails, topples backwards, bounces, lies feet-up kicking for about 1.5 s, then gets back up. Taps are ignored while he is falling. Frames: `img/title-penguin-v6.png` (8 × 240×156, made by `tools/title_penguin_v6.py`).
  - **Bear**: waves 5 s after the app opens, then every 15 s while the title is showing (about 1.5 s per wave). His own arm is redrawn per frame: half up, up, paw tilted left, paw tilted right. Frames: `img/title-bear-v6.png` (4 × 170×170).
  - **Monkey**: tap him and his own furry arm (shoulder, elbow, tan hand) comes up from behind the TICKETS sign gripping a curved banana, he grins and bobs it, then lowers it (about 1.5 s). Taps are ignored while he is moving. Frames: `img/title-monkey-v6.png` (4 × 120×120, drawn on the backdrop's 3-px cell by `tools/title_monkey_arm_v6.py`).
  - The bear and monkey frames are opaque patches of the backdrop region they cover, drawn 1:1 over it (`tools/title_patches_v6.py`).
  - Their tap areas sit above the menu, so tapping them never opens a menu item.
- **Biome map**: 8 islands along a winding cliff path (Forest, Ocean, Farm, Arctic, Oriental, Savannah, Jurassic, Space). Each has its sign. Locked islands use their locked art and cannot be selected. Tap an unlocked island to select it: it glows gold, its animal hops and its plants sway. The panel then shows that biome's best score and how many animals you've found. Play starts that biome.
- **Progression**: Forest is open from the start. **Reaching a biome's tier-11 animal (by merging two tier-10s) unlocks the next biome on the map.** A "… UNLOCKED!" toast appears when that happens.
- **All 8 biomes are playable**. They all use the same drop-and-merge game and the same physics (gravity 10, bounce 0.20, weight ×1.10) and scoring. Each biome has its own 11 animals, from tier 1 to tier 11. Merging two tier-11 animals clears both with a "ZOO MASH!" celebration and +250 points.
  - Each biome has its own pixel-art backdrop (pixelated scaling), themed side posts and a themed, textured evolution bar (`ui-themes/themes.css`, selected by `body[data-biome]`). The evolution bar shows that biome's animals, with "?" blocks for ones you have not found yet.
  - **Open-top play box** (v6): there is no top HUD bar. The backdrop runs to the top edge. SCORE, the NEXT badge, BEST, pause and settings float over the sky as pixel text and buttons with a hard black outline, below the safe-area inset. The side posts run from the top edge (small pixel cap) down into the floor, so the posts, floor and evolution bar read as a box with no lid.
  - **NEXT** is a compact badge in that floating row, between SCORE and BEST. It always sits above the largest held piece, so drops at the far left and far right are never covered.
  - **Floor**: one flat pixel slab in every biome: a dark outline, a 1-px highlight on top, a solid face and a darker bottom edge, tinted to match that biome's side posts. There are no tufts or texture. The physics floor is unchanged.
  - Each backdrop has 1–2 subtle ambient animations (`ambient.js`):

    | Biome | Animations |
    |---|---|
    | Forest | squirrel on a bough, fireflies |
    | Ocean | rising bubbles, a passing fish school |
    | Farm | drifting clouds, turning windmill, a crow that lands on a fence post |
    | Arctic | shimmering aurora, light snow |
    | Oriental | falling petals, waterfall sparkle |
    | Savannah | a flock of pixel birds, grass tufts leaning in a gust |
    | Jurassic | volcano smoke, a gliding pterodactyl |
    | Space | twinkling stars, an occasional comet |

    All of them are hard-edged pixel sprites stepped at a few fps (the fireflies keep their soft glow). The animations are drawn behind the animals on a separate canvas and have no effect on physics. They freeze when the game is paused, when it is over, or when the tab is hidden.
- **Zoopedia**: a field guide drawn as a real open hardcover book on the desk (thick leather cover with brass corners, curved aged pages with a deep spine valley, stacked page edges, cloth tabs and a ribbon).
  - There is one two-page spread per biome: 11 animals each, 88 in total.
  - Found animals are tipped-in plates with captions. Missing ones are plain blocks with a "?".
  - Entries are numbered No.01–No.88 across all biomes, ending with Space's Sun as No.88.
  - The whole book is preloaded and decoded at startup, so a spread is complete on its first frame. A page turn mounts the destination page under the leaf before it moves, so the page underneath is always right; taps during a turn are queued, not dropped.
  - Turn pages with the arrows, the dog-eared page corners, a swipe, or the arrow keys. The biome bookmark tabs jump to a spread.
  - Tap a found animal to open its fun-fact page.
  - An animal counts as found once it appears in gameplay, in any biome.
  - The "x/88 ANIMALS FOUND" count shows on a plank under the header and as a badge in the Zoopedia header bar.
- **Juice** (v6):
  - **Combos**: a merge within 1.5 s of the previous one extends the chain. The k-th merge of a chain (k ≥ 2) adds +10 × (k − 1) on top of its normal points.
  - **NEW ANIMAL! card**: the first time you make a tier in a biome, a card shows it (auto-dismisses; tap to dismiss).
  - **Danger line**: when a settled pile sits within about one small animal of the line for a moment, the line pulses red, faster the closer it is. An animal staying above the line still flashes the warning and then ends the game, as before.
  - **Screen shake**: small integer-pixel shakes on big merges and the ZOO MASH! clear. Off with prefers-reduced-motion.
  - **Low-end mode**: if a phone can't hold about 45 fps after warming up, effects are capped automatically. `?lowfx=1` forces it on.
- **Scores**: your best score for each unlocked biome. Each biome keeps its own best.
- **Settings** has a demo-only "Unlock all (demo)" toggle. It unlocks every biome on the map and marks all 88 Zoopedia animals as found.

## Deep links
`#map`, `#play` (Forest), `#play-<biome>` (e.g. `#play-ocean`, `#play-jurassic`, `#play-space`), `#zoopedia` (or `#zoo`), `#scores`

## Notes

- **Viewport** (v6): every screen is laid out in the box its `position:fixed;inset:0` element actually gets (`vp.js`), not `window.innerHeight`. On iPhone Safari (iOS 26, floating toolbar, `viewport-fit=cover`) the page runs under the toolbar, so the fixed box can be taller than innerHeight. Laying out in innerHeight left the map and Scores bunched at the top. Backdrops now fill the whole box, and anything pinned to the bottom (the map panel, the evolution bar, the Zoopedia arrows) is lifted by `--sb`. `--sb` is the larger of `safe-area-inset-bottom` and the part of the box hidden behind browser chrome.
- This is a static site with no build step. `.nojekyll` makes GitHub Pages serve the files as they are.
- Progress is saved in the browser's localStorage, per biome: `zoomash.<biome>.best` and `zoomash.<biome>.seen`.
- There is no sound yet. Audio will be added later.
- **Haptics**: the Vibration setting uses `navigator.vibrate`, which works on Android Chrome. iOS Safari has no Vibration API, so on iPhone it does nothing. Real iPhone haptics need a native wrapper (e.g. Capacitor/WKWebView calling `UIImpactFeedbackGenerator`); on Android a wrapper can use `Vibrator`/`HapticFeedbackConstants`.
- Physics uses Matter.js (MIT license, see `matter-LICENSE.txt`). The font is Silkscreen (OFL).
