# zoo-mash-demo

Zoo Mash: a phone-first web demo, served by GitHub Pages at https://brocksivley.github.io/zoo-mash-demo/.

## What's in it
- **Title**: the zoo gate, a menu (Play / Zoopedia / Scores / Settings), with Settings as a menu item (no corner gear on the title). Three small pixel-art touches, all silent. Every move is a drawn pixel frame stepped at 6–8 fps; nothing is rotated or scaled when it's drawn:
  - **Penguin**: tap him and he waddles (about 0.6 s, a foot lifts on each step). Tap him more than 5 times within 2 s and he flails, topples backwards, bounces, lies feet-up kicking for about 1.5 s, then gets back up. Taps are ignored while he is falling. Frames: `img/title-penguin-v6.png` (8 × 240×156, made by `tools/title_penguin_v6.py`).
  - **Bear** (v7): asleep the whole time. His eyes are shut (curved dark-brown lid lines) and chunky pixel Zs (cream with a dark outline, small → big) keep floating up and drifting right from above his head, frame-stepped at 6 fps with stepped fades, looping. Tap him and he startles awake for about 1 s (his normal open eyes, the Zs vanish, a pixel "!" pops above his head). Then he yawns: eyes squint shut and his mouth opens into a dark oval with a pink tongue inside his muzzle, held about 0.8 s. Then his eyes go sleepy and half-open, close, and he is asleep again 3–5 s (random) after the tap, with the Zs back. Taps are ignored while he is awake, and no timer ever wakes him. Only his eye pixels (and the mouth, for the yawn) change; the rest of him is the backdrop's own pixels. Frames: `img/title-bear-sleep-v7.png` (4 × 57×57 face patches: closed, half, yawn-opening, yawn), made by `tools/title_bear_sleep_v7.py`; the Zs and "!" are 3-px-cell glyphs drawn in `ui.js`.
  - **Monkey**: tap him and his own furry arm (shoulder, elbow, tan hand) comes up from behind the TICKETS sign gripping a curved banana, he grins and bobs it, then lowers it (about 1.5 s). Taps are ignored while he is moving. Frames: `img/title-monkey-v6.png` (4 × 120×120, drawn on the backdrop's 3-px cell by `tools/title_monkey_arm_v6.py`).
  - The bear face and monkey frames are opaque patches of the backdrop region they cover, drawn 1:1 over it (monkey: `tools/title_patches_v6.py`).
  - Their tap areas sit above the menu, so tapping them never opens a menu item.
- **Biome map**: (v7: the island path is compressed vertically by 18% and centred between the header and the panel.) 8 islands along a winding cliff path (Forest, Ocean, Farm, Arctic, Oriental, Savannah, Jurassic, Space). Each has its sign. Locked islands use their locked art and cannot be selected. Tap an unlocked island to select it: it glows gold, its animal hops and its plants sway. The panel then shows that biome's best score and how many animals you've found. Play starts that biome.
- **Progression**: Forest is open from the start. **Reaching a biome's tier-11 animal (by merging two tier-10s) unlocks the next biome on the map.**
  - **BIOME COMPLETE!** (v7): the first time that happens in a biome, the game pauses for a celebration: chunky pixel confetti and fireworks stepped at 12 fps, a banner with the tier-11 animal, its No., and "<NEXT> UNLOCKED!". **KEEP PLAYING** closes it and carries on. **NEXT BIOME** goes to the map, where the new island plays an unlock animation (shake, pop, sparkles, a stepped camera push-in) and ends up selected, ready to play. It shows once per biome (`zoomash.<biome>.celebrated`). It never shows in Unlock-all mode or for Space, the last biome; a later tier-11 there just gets the old "… UNLOCKED!" toast.
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
    | Space | twinkling stars, an occasional comet (v7: the two painted planets were removed from the backdrop) |

    All of them are hard-edged pixel sprites stepped at a few fps (the fireflies keep their soft glow). The animations are drawn behind the animals on a separate canvas and have no effect on physics. They freeze when the game is paused, when it is over, or when the tab is hidden.
- **Zoopedia**: (v7: the book is sized to fit inside the safe area on every phone, every animal name uses one font size, and the No. labels are all the same style and position.) A field guide drawn as a real open hardcover book on the desk (thick leather cover with brass corners, curved aged pages with a deep spine valley, stacked page edges, cloth tabs and a ribbon).
  - There is one two-page spread per biome: 11 animals each, 88 in total.
  - Found animals are tipped-in plates with captions. Missing ones are plain blocks with a "?".
  - Entries are numbered No.01–No.88 across all biomes, ending with Space's Sun as No.88.
  - The whole book is preloaded and decoded at startup, so a spread is complete on its first frame. A page turn mounts the destination page under the leaf before it moves, so the page underneath is always right; taps during a turn are queued, not dropped.
  - Turn pages with the arrows, the dog-eared page corners, a swipe, or the arrow keys. The biome bookmark tabs jump to a spread.
  - Tap a found animal to open its fun-fact page.
  - An animal counts as found once it appears in gameplay, in any biome.
  - The "x/88 ANIMALS FOUND" count shows on a plank under the header and as a badge in the Zoopedia header bar.
- **Zoopedia locked biomes** (v7): a biome that isn't unlocked yet is never revealed, the same as on the map. Its tab is grey with the map's padlock, and its accessible name is "Locked". Its pages show "???" as the title and the grey padlock badge where the sign would be, and all 11 slots are grey "?" blocks named "???" (the No. numbers stay). You can still browse to these pages with the arrows, swipes and tabs. Unlocked biomes keep their themed tab, and their animals appear one at a time as you find them. Unlock-all reveals everything. On each biome's first page, the sign (or the locked padlock plate, which is the same size as the "?" plates) is centred vertically on the tier-1 animal's picture plate. The biome signs no longer have tape strips. The header no longer shows an x/88 badge; the "x/88 ANIMALS FOUND" plank above the book is the only count.
- **Gameplay HUD + box** (v7): SCORE, NEXT, BEST, pause and settings are spaced with space-evenly, so all the gaps and both side margins are equal. The stat font is fitted once for each viewport width, using 6-digit numbers as the worst case: 10.5 px at 375 px wide, 11.5 px at 393, 14 px at 440, and 15 px at most. It doesn't change as the score grows. The play box (danger line to floor) is now 1.12–1.30× the inner width (it was up to 1.45×). On tall phones the extra height becomes sky above the held animal, and the floor and evolution bar stay at the bottom.
- **Pause menu** (v7): Resume, Restart, **CHANGE BIOME** (ends the round and opens the map with the current biome pre-selected), Zoopedia, Main menu.
- **Juice** (v6):
  - **Combos**: a merge within 1.5 s of the previous one extends the chain. The k-th merge of a chain (k ≥ 2) adds +10 × (k − 1) on top of its normal points. Only merges after the round's first drop count (v7), and resuming from pause starts a new chain.
  - **NEW ANIMAL! card**: the first time you make a tier in a biome, a card shows it (auto-dismisses; tap to dismiss).
  - **Danger line**: when a settled pile sits within about one small animal of the line for a moment, the line pulses red, faster the closer it is. **v7.4:** the game only ends when something has sat on or above the line for 3 s in a row (one clock for "any animal over the line"; it keeps counting if another animal takes over with no gap and resets to 0 when nothing is over). A just-dropped animal is ignored for its first 1 s, an animal must be calm (barely moving for 0.2 s) to count, so one bouncing through doesn't, and pausing freezes the clock. While it counts, the line blinks red with a glow, faster as time runs out (about 2 Hz up to 9 Hz), and the animal(s) over the line get a red tint and a small shake. No text. (Before v7.4: each animal had its own clock and the game ended after 2 s; the warning started at 0.5 s.)
  - **Screen shake**: small integer-pixel shakes on big merges and the ZOO MASH! clear. Off with prefers-reduced-motion.
  - **Low-end mode**: if a phone can't hold about 45 fps after warming up, effects are capped automatically. `?lowfx=1` forces it on.
- **Scores**: your best score for each unlocked biome. Each biome keeps its own best. The rows are spread evenly over the board (v7).
- **Settings** has a demo-only "Unlock all (demo)" toggle. It unlocks every biome on the map and marks all 88 Zoopedia animals as found.

## Deep links
`#map`, `#play` (Forest), `#play-<biome>` (e.g. `#play-ocean`, `#play-jurassic`, `#play-space`), `#zoopedia` (or `#zoo`), `#scores`

## Notes

- **v7 combo bug (fixed)**: the stale "COMBO x2! +10" or "ZOO MASH!" banner replayed at the start of a new round. **Root cause**: the banners are CSS animations with `animation-fill-mode: forwards`, triggered by an `on` class on `#combo` / `#mash`. That class was never removed. Leaving a round hides `#app` (`display:none`), and when `#app` was shown again for the next round the browser restarted every animation on it, so the last banner played again at round start. **Fix**: `clearJuice()` removes the classes and resets the chain on every round enter, leave and reset, and on `animationend`. Resume also resets the chain, and `combo()` only counts once the round has a drop (`dropsTotal > 0`).
- **Safe areas** (v7): `viewport-fit=cover`, and every edge uses `env(safe-area-inset-*)` with `max()` fallbacks (`--st` = max(inset-top, 12px), `--sb` = max(inset-bottom, 8px)). Nothing interactive sits under the notch, Dynamic Island or home indicator. For testing, `?insets=top,bottom` simulates insets (e.g. `?insets=59,34`).
- **Tests** (v7): `tools/test_v7.mjs` (Playwright; `BR=webkit|chromium SZ=WxHxTopxBottom STARTS=5 node tools/test_v7.mjs`). It covers the combo bug (8 biomes × 5 ways of starting a round, no banner within 3 s), CHANGE BIOME, the celebration and unlock, the sleepy bear, a safe-area audit of every screen, Zoopedia fonts and labels, even score rows, the map squeeze, Space without planets, and the kept rules (physics, numbering, +250, x/88).

- **Viewport** (v6): every screen is laid out in the box its `position:fixed;inset:0` element actually gets (`vp.js`), not `window.innerHeight`. On iPhone Safari (iOS 26, floating toolbar, `viewport-fit=cover`) the page runs under the toolbar, so the fixed box can be taller than innerHeight. Laying out in innerHeight left the map and Scores bunched at the top. Backdrops now fill the whole box, and anything pinned to the bottom (the map panel, the evolution bar, the Zoopedia arrows) is lifted by `--sb`. `--sb` is the larger of `safe-area-inset-bottom` and the part of the box hidden behind browser chrome.
- This is a static site with no build step. `.nojekyll` makes GitHub Pages serve the files as they are.
- Progress is saved in the browser's localStorage, per biome: `zoomash.<biome>.best` and `zoomash.<biome>.seen`.
- There is no sound yet. Audio will be added later.
- **Haptics**: the Vibration setting uses `navigator.vibrate`, which works on Android Chrome. iOS Safari has no Vibration API, so on iPhone it does nothing. Real iPhone haptics need a native wrapper (e.g. Capacitor/WKWebView calling `UIImpactFeedbackGenerator`); on Android a wrapper can use `Vibrator`/`HapticFeedbackConstants`.
- Physics uses Matter.js (MIT license, see `matter-LICENSE.txt`). The font is Silkscreen (OFL).
