export type HslColor = {
  hue: number
  lightness: number
  opacity?: number
  saturation: number
}

export type BracketRange = {
  ceiling: number
  ceilingInclusive: boolean
  floor: number
  floorInclusive: boolean
}

export type Bracket = {
  count: number
  value: BracketRange | number
}

export type Probe = {
  average: number
  brackets: Array<Bracket>
  maximum: number
  median: number
  minimum: number
}

export type FrequentColor = {
  color: HslColor
  count: number
}

export type TileResult = {
  dominantColor?: HslColor
  frequentColors: Array<FrequentColor>
  probes: {
    blue: Probe
    green: Probe
    hue: Probe
    lightness: Probe
    opacity?: Probe
    red: Probe
    saturation: Probe
  }
}

export type Tile = {column: number
  row: number} & TileResult

export type CropRectangle = {
  color: HslColor
  height: number
  width: number
  x: number
  y: number
}

export type BaseResult = {
  /** Byte length of the normalized decoded RGB/RGBA pixel buffer. */
  bufferSize: number
  /** Normalized decoded channels: RGB=3 or RGBA=4. */
  channels: 3 | 4
  /** Encoded byte length. Undefined only for direct raw-pixel input. */
  fileSize?: number
  height: number
  possibleCrop?: CropRectangle
  width: number
}

export type SingleResult = BaseResult & TileResult
export type SplitResult = BaseResult & {tiles: Array<Tile>}
export type Result = SingleResult | SplitResult

export type RawImage = {
  channels: 3 | 4
  data: Uint8Array
  height: number
  width: number
}

export type ImageInput = ArrayBuffer | ArrayBufferView | RawImage | SharedArrayBuffer
export type ColorSpace = 'hsl' | 'okhsl'
export type DominantColorAlgorithm = 'k_means' | 'median_cut' | false

export type Options = {
  /** Applied to HSL probes, grouping, crop comparison and returned colors. @default 'okhsl' */
  colorSpace?: ColorSpace
  /** @default 1 */
  columns?: number
  /** @default 'k_means' */
  dominantColorAlgorithm?: DominantColorAlgorithm
  /** Number of dominant-color clusters / median-cut boxes. @default 5 */
  dominantColorClusters?: number
  /** @default 10 */
  frequentColorsCount?: number
  /** Reject larger decoded images before pixel analysis. @default 40000000 */
  maxPixels?: number
  /** @default 1 */
  rows?: number
}

export type ResolvedOptions = Required<Options>
export type SingleOptions = Options & {columns?: 1
  rows?: 1}

export type DecodedImage = RawImage & {format: 'bmp' | 'gif' | 'jpeg' | 'png' | 'tiff'}
