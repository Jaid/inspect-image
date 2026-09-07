# inspect-image

Synchronous, deterministic image color analysis for Bun and Node-compatible runtimes.

`inspect-image` reports dimensions, encoded/decoded byte sizes, RGB + HSL/OkHSL distributions, frequent integer colors, dominant color, alpha statistics, tiled analyses, and conservative crop suggestions.

## Install

```sh
bun add inspect-image
```

## Usage

```ts
import inspectImage, {inspectImageFile} from 'inspect-image'

const result = inspectImage(encodedBytes)
const fromDisk = await inspectImageFile('photo.png')
```

The named aliases `analyzeImage` and `analyzeImageFile` are also exported for compatibility with the original fixture API.

## Inputs

`inspectImage()` accepts encoded PNG, JPEG, GIF, BMP and TIFF bytes synchronously, or tightly packed raw RGB/RGBA pixels:

```ts
inspectImage({
  width: 2,
  height: 1,
  channels: 4,
  data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]),
})
```

JPEG EXIF orientation is applied before analysis. GIF analysis uses the first frame. TIFF analysis uses the first page. ICC/profile conversion and animation aggregation are intentionally outside the synchronous core.

## Result semantics

- `channels` is the normalized decoded layout: 3 for RGB and 4 when the source structurally carries alpha. A fully opaque RGBA PNG therefore remains 4-channel and includes an opacity probe.
- `fileSize` is the encoded byte count. It is absent only for direct raw-pixel input.
- `bufferSize` is the normalized decoded RGB/RGBA byte count.
- PNG `tRNS` color-key RGB is preserved instead of being replaced with black by the decoder.
- Frequent colors count every pixel after rounding the selected HSL space to integer hue/saturation/lightness. Alpha never splits a color group; returned opacity is the group mean.
- Crop comparison deliberately ignores alpha and requires at least one pair of **adjacent/touching** full outer edges with the same rounded color.
- Hue average and median are circular rather than treating 359° and 1° as far apart.

OkHSL conversion is provided by the dependency-free `okhsl` package. Its RGB inverse intentionally returns integer OkHSL channels, which exactly matches this library’s grouping and crop semantics.

## Options

```ts
type Options = {
  frequentColorsCount?: number
  colorSpace?: 'okhsl' | 'hsl'
  rows?: number
  columns?: number
  dominantColorAlgorithm?: 'k_means' | 'median_cut' | false
  dominantColorClusters?: number
  maxPixels?: number
}
```

Defaults:

- `frequentColorsCount: 10` (`0` disables frequency collection)
- `colorSpace: 'okhsl'`
- `rows: 1`, `columns: 1`
- `dominantColorAlgorithm: 'k_means'`
- `dominantColorClusters: 5` (accepted range 1–16)
- `maxPixels: 40_000_000`

When rows/columns are both 1, probes and colors are returned at the top level. Otherwise base metadata is returned with a row-major `tiles` array. Uneven dimensions are split with floor boundaries so every pixel belongs to exactly one tile.

## Distribution probes

Each probe contains `minimum`, `maximum`, `average`, `median`, and 13 non-overlapping brackets:

`0%`, `>0% <1%`, `≥1% <3%`, `≥3% <8%`, `≥8% <15%`, `≥15% <30%`, `≥30% <70%`, `≥70% <85%`, `≥85% <92%`, `≥92% <97%`, `≥97% <99%`, `≥99% <100%`, `100%`.

RGB uses 255 as 100%; hue uses 360; saturation/lightness/opacity use 100. RGB medians are exact. Continuous HSL/opacity medians use 0.01-unit histograms; default OkHSL inverse values are integers by definition of the `okhsl` dependency.

## Frequent colors

Every pixel contributes. The selected HSL values are rounded to:

- hue: 0–359
- saturation: 0–100
- lightness: 0–100

Ties are deterministic and sorted by the packed integer color key. Opacity is averaged per integer color when alpha exists.

## Dominant color

Dominant analysis is deterministic and bounded:

1. Every pixel contributes to a 5-bit-per-channel RGB population histogram (at most 32,768 buckets).
2. Each non-empty bucket is represented by its population-weighted mean RGB and converted to Oklab.
3. Deterministic weighted k-means or weighted median-cut operates on those buckets.
4. The largest population cluster is represented by its weighted Oklab mean and converted back to the requested HSL space.

This avoids both random sampling bias and the unbounded high-entropy clustering cost seen in exhaustive per-color implementations. Alpha does not affect cluster assignment but is population-averaged for the winning cluster.

## Crop suggestions

A crop is returned only when at least one adjacent edge pair (top+left, top+right, bottom+left, bottom+right) is entirely the same rounded color. Opposite-only borders do not qualify. Once qualified, only fully uniform rows/columns of that same color are stripped, making the suggestion conservative rather than blindly bounding every non-border-colored pixel.

## Decoder behavior

- PNG: RGB/RGBA, grayscale, grayscale-alpha, indexed transparency, color-key `tRNS`, 8/16-bit normalization through pngjs.
- JPEG: synchronous jpeg-js decode plus EXIF orientations 1–8.
- GIF: first frame through omggif, preserving transparent-index alpha semantics.
- BMP: bmp-ts decode, including 32-bit alpha layout.
- TIFF: first page through utif2, with alpha inferred from samples/extra-sample metadata.

Encoded dimensions are checked against `maxPixels` as early as each codec permits. The limit is an application guard, not a security sandbox; isolate untrusted decoders with process-level resource limits when needed.

## Development

```sh
bun run validate
```

That runs strict TypeScript checking, ESLint, the complete test suite, and the production build.
