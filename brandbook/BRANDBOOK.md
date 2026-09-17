# MacroBrief — Brandbook

## The mark

MacroBrief is a Macro brand, so it inherits the family's isometric **M** on the
family canvas `0 0 1000 698.86`, and it seats its object in the M's notch on the
same band the sibling marks put their rhombus tiles on — but, unlike them, it
draws the object **behind** the M.

What sits in the notch is what differs, and it is the one thing that carries
meaning:

| Brand | In the notch | Says |
|---|---|---|
| MacroPrimer | three tiles, scattered | dispersed knowledge |
| MacroAccount | four tiles, one block | accounts resolving into one position |
| MacroKB | one tile, cut in strata | one body of knowledge in layers |
| **MacroBrief** | **a globe, rising behind the M** | **the whole world, and the M in front of it selecting what reaches you** |

The globe is the news icon everyone already reads, and it is drawn the way
those icons are: a disc with its **equator and one meridian** knocked out, plus
the horizon line. It is large — the mark's subject, not an ornament — and seated
low, so the M's V cuts its lower third and its whole bottom arc is hidden. The
world is behind; the M, in front, is the thing that decides what gets through.

```
globe      centre (500, 290)   radius 275   — top at y = 15, bottom arc hidden
graticule  equator  rx 275 · ry 104.5  (foreshorten 0.38)
           meridian rx 104.5 · ry 275
           horizon  y = 290
           knock-out width 18
gap        the M's outline, knocked out at 18 on the globe's side
```

Geometry is derived. Do not nudge these numbers.

### The graticule and the gap

The equator, meridian and horizon are **knocked out as transparent lines** in
**every** variant, not only the single-ink ones. Filled solid, the globe is a
plain disc — a coin, a period — and the idea is gone. They are structural, not a
reduction trick, and they must be transparent rather than painted: verified on
dark and mid-grey grounds, where a painted line would show.

The same knock-out runs along the **M's top edge**, one seam wide, on the
globe's side. Without it the one-ink variants fuse globe and M into a single
blob, and the "behind" reading — which is the mark — is lost.

Below about `14` the knock-out closes at small sizes; above about `22` the globe
reads as a wireframe. `18` is the width that survives 24px and still reads as a
solid object.

## Files

| File | Use |
|---|---|
| `logos/isotype.svg` | Ink M, signal globe. Light backgrounds. Default. |
| `logos/isotype-dark-bg.svg` | Signal M, white globe. Dark backgrounds. |
| `logos/isotype-black.svg` / `-white.svg` | One ink, with the knock-out graticule. |
| `logos/imagotipo.svg` | Mark + wordmark, horizontal. |
| `logos/imagotipo-dark-bg.svg` | The same, on dark. |
| `logos/imagotipo-black.svg` / `-white.svg` | One-ink lockups. |
| `logos/favicon.svg` | Square canvas, mark's true bbox centred, dark-ground colours. |
| `tokens.css` | The palette as custom properties. |

`brandbook/build.py` **generates every SVG here** from one set of constants,
plus `brandbook.html`; `--pdf` prints `brandbook-MacroBrief.pdf` through Chrome.
Edit the constants and re-run it; never hand-edit the files.

The Sakamoto Labs portfolio carries a copy of `isotype-dark-bg.svg` at
`repos/sakamotolabs/client/public/portfolio-logos/macrobrief.svg`. Re-copy it
when the mark changes.

### Lockup metrics

The family's, unchanged: isotype at `scale(0.72)` translated `(0, 97.8)`;
wordmark in **Open Sans Bold** at `440` with `-10` tracking, baseline `y = 512`,
set from `x = 880`.

The canvas is `0 0 3249 698.86` — the `880` offset plus the wordmark's
**measured** extent of `2368.89` (fontTools against Open Sans Bold; the same
method reproduces MacroAccount's recorded value within 4 units).

`Macro` is set in ink and `Brief` in the signal colour, the family's division:
the prefix carries the family, the suffix carries the brand.

## Colour

| Token | Value | Where it comes from |
|---|---|---|
| `--mb-ink` | `#14161f` | Text ink, pulled slightly toward the signal hue so the two sit together. |
| `--mb-signal` | `#1d4ed8` | The brand colour. A royal blue. |
| `--mb-paper` | `#f4f5f8` | Paper. |
| `--mb-paper-dark` | `#0f1117` | The same, inverted. |

**Why blue.** A news product has to be believed before it is read, and blue is
the colour the whole briefing genre — Morning Brew, Axios, 1440, the Guardian,
the BBC — has settled on for exactly that. It says *information* without saying
*alarm*.

It is not unclaimed in the family: MacroAccount is a muted ledger blue
(`#2f6fb0`) and MacroSkill a periwinkle (`#5c5cff`). This one is deeper and more
saturated than either, and the collision was accepted knowingly — credibility
with a first-time reader matters more than distance from a sibling. An earlier
draft used fuchsia, which was distinct in the family and wrong for news.

## Type

**Open Sans Bold** for the wordmark — the family's face, and the reason the
lockup reads as a sibling. Interface and marketing type are the product's
decision, not the brand's; when the product exists, record the pairing here.

## Clear space and minimum size

Clear space on all sides is **half the globe's radius (137.5 units, ~14% of
the mark's width)**. Nothing sets inside it.

Minimum size is **24px** tall. Below about 20px the graticule closes and the
globe becomes a disc. Use `favicon.svg` at 16px — it is centred on the mark's
true bounding box precisely because a 16px tab cannot spare the height.

## Never

- Stretch the mark to fill a square. It is wider than it is tall; letterbox it.
- Fill the graticule. Solid, the globe is a coin.
- Put the globe in front of the M, or lift it clear of it. Behind is the point.
- Add a dot, pin or badge to the globe. The M already does the selecting.
- Redraw the M. It is shared with every other Macro brand and is not ours to change.
- Hand-edit the SVGs. Change the constants and re-run `build.py`.
