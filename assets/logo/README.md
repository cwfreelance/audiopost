# audiopost logo — Scallop stamp

This is the final logo: the scallop-edged stamp with the level-meter mark, and an "AUDIOPOST" wordmark in Londrina Solid. The settings are the ones chosen in the design canvas:

- **Stamp roughness:** 5
- **Wordmark:** Londrina Solid Regular (400), uppercase, no wordmark roughness
- **Lockup:** horizontal

## Colors

| Role | Hex | RGB |
|---|---|---|
| Stamp | `#d6336c` | 214, 51, 108 |
| Level-meter bars (inside the stamp) | `#f0f0f0` | 240, 240, 240 |
| Light background | `#f0f0f0` | 240, 240, 240 |
| "AUDIO" on light | `#000000` | 0, 0, 0 |
| "POST" on light | `#d6336c` | 214, 51, 108 |
| Dark background | `#000000` | 0, 0, 0 |
| "AUDIO" on dark | `#f0f0f0` | 240, 240, 240 |
| "POST" on dark | `#d6336c` | 214, 51, 108 |
| App-icon tile | `#d6336c` | 214, 51, 108 |
| Stamp on the app-icon tile | `#f0f0f0` | 240, 240, 240 |
| Meter bars on the app-icon tile | `#d6336c` | 214, 51, 108 |

The same values are in `tokens.json` (for tools) and in `audiopost-brand.css` (as CSS variables).

## Typography and lockup

- **Font:** Londrina Solid Regular (400). It's free under the SIL Open Font License, which allows use in logos (see `fonts/OFL.txt`).
- **Wordmark text:** AUDIOPOST, uppercase, with letter-spacing 0 and line-height 1. "AUDIO" and "POST" sit right next to each other in two colors, with no space between them.
- **Horizontal lockup at the mockup size:**
  - Mark box: 108 × 108 px
  - Gap from mark to text: 14 px
  - Font size: 70 px
  - The text's line box is centered vertically on the mark box.
  - Overall size: 406.56 × 108 px. The text starts 122 px from the left, and its baseline is 78 px from the top.
- **Scaling:** scale everything together. Font size = 0.648 × the mark box, and the gap = 0.13 × the mark box.
- **Mark box padding:** the mark sits in a 100 × 100 box (`viewBox="0 0 100 100"`) with built-in padding. The stamp itself covers about x 14–86 and y 8–92. Keep the box as it is, so spacing stays consistent with the lockup.

## What's in here

```
audiopost-logo/
├─ README.md                 this file
├─ tokens.json               colors, type and lockup measurements as data
├─ audiopost-brand.css       @font-face for Londrina Solid + color variables + .ap-wordmark
├─ mockup/index.html         the design mockup exactly as on the canvas; open it in any browser (font embedded)
├─ fonts/                    Londrina Solid Thin/Light/Regular/Black as .ttf and .woff2, plus OFL.txt
├─ svg/
│  ├─ audiopost-lockup-on-light.svg   full logo for light backgrounds (transparent background)
│  ├─ audiopost-lockup-on-dark.svg    full logo for dark backgrounds (transparent background)
│  ├─ audiopost-mark.svg              stamp + meter only
│  ├─ audiopost-mark-clean.svg        same mark without the roughness (the clean master shape)
│  ├─ audiopost-app-icon.svg          pink rounded tile with the light stamp
│  └─ favicon.svg                     browser-tab icon (the bare mark)
├─ png/
│  ├─ audiopost-lockup-on-light@4x.png / @1x.png   transparent background
│  ├─ audiopost-lockup-on-dark@4x.png / @1x.png    transparent background
│  ├─ audiopost-mark-1024.png         transparent background
│  ├─ audiopost-app-icon-1024.png     rounded tile, transparent corners
│  ├─ apple-touch-icon.png            180 × 180, square and opaque (iOS rounds the corners itself)
│  ├─ favicon-32.png, favicon-16.png
│  └─ mockup@2x.png                   screenshot of the full mockup
└─ photoshop/audiopost-lockup-layers.psd
```

The SVGs are pure vector. The text is converted to outlines, so the logo looks the same on devices without the font installed. The stamp's roughness is built into the shapes, so the SVGs don't rely on browser filter effects.

## Editing in Photoshop

- **Layered file:** open `photoshop/audiopost-lockup-layers.psd`. It's 2011 × 816 px, 4× the mockup size, with these layers:
  - Light background `#f0f0f0`
  - Dark background `#000000`, hidden
  - **Mark** group: Stamp `#d6336c` and Level meter `#f0f0f0` as separate layers
  - **Wordmark** group: AUDIO (on light), AUDIO (on dark, hidden) and POST as separate layers
- **Swapping to the dark version:** show "Dark background" and "AUDIO (on dark)", and hide "AUDIO (on light)".
- **Recoloring:** each part is its own layer. Lock the layer's transparent pixels and fill it with a new color.
- **Editing the text:** the letters are pixel layers, not live text. To retype them, install `fonts/LondrinaSolid-Regular.ttf`, then type AUDIOPOST at 280 px in the 4× file (70 px × 4; that's 280 pt at 72 ppi), with tracking 0.
- **Vector version:** for sharp edges at any size, use File › Place Embedded with one of the SVGs from `svg/`. It comes in as a Smart Object you can scale freely.

## Using it on the website (notes for Claude Code)

Copy this folder into the site, for example as `public/brand/audiopost-logo/`, then:

1. **Header logo.** Use the SVG as an image. Don't rebuild it from text, because the SVG is the exact artwork.
   ```html
   <img src="/brand/audiopost-logo/svg/audiopost-lockup-on-light.svg" alt="audiopost" height="40">
   ```
   On dark sections, use `audiopost-lockup-on-dark.svg`. Set only the height; the width follows from the 406.56:108 ratio.
2. **Favicons** go in `<head>`:
   ```html
   <link rel="icon" href="/brand/audiopost-logo/svg/favicon.svg" type="image/svg+xml">
   <link rel="icon" href="/brand/audiopost-logo/png/favicon-32.png" sizes="32x32" type="image/png">
   <link rel="apple-touch-icon" href="/brand/audiopost-logo/png/apple-touch-icon.png">
   ```
3. **Colors and font.** Link `audiopost-brand.css`, or copy its `:root` variables and `@font-face` rules into the site's CSS. Fix the font paths if you move the files. Use `var(--ap-stamp)` and the other variables instead of hard-coding hex values.
4. **Live text in the wordmark style** (for a hero heading, for example): use the `.ap-wordmark` class with two touching spans.
   ```html
   <span class="ap-wordmark"><span class="ap-audio">audio</span><span class="ap-post">post</span></span>
   ```
5. **Reference.** `mockup/index.html` shows how the logo should look on light and dark backgrounds, at small sizes and as an app tile.

## Notes

- **Roughness:** in the mockup page, the stamp's roughness is a live SVG filter, just as on the canvas. In the files under `svg/`, `png/` and `photoshop/`, it's converted into fixed shapes that match it closely. If you ever want the smooth version, start from `svg/audiopost-mark-clean.svg`.
- **Font license:** Londrina Solid © 2011 The Londrina Solid Authors, licensed under the SIL Open Font License 1.1. You can use it freely, including commercially, but you can't sell the font files on their own.
