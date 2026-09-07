import type {BaseResult, ImageInput, Options, RawImage, ResolvedOptions, Result, SingleOptions, SingleResult, Tile, TileResult} from './types.ts'

import {ColorConverter, colorFromKey} from './color.ts'
import {findPossibleCrop} from './crop.ts'
import {decodeImage} from './decode/index.ts'
import {DominantAccumulator} from './dominant.ts'
import {HueProbeAccumulator, ProbeAccumulator} from './probe.ts'

const validateInteger = (value: number, name: string, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be a safe integer from ${minimum} to ${maximum}.`)
  }
}
const resolveOptions = (options: Options = {}): ResolvedOptions => {
  const rawColorSpace: unknown = options.colorSpace ?? 'okhsl'
  const rawDominantColorAlgorithm: unknown = options.dominantColorAlgorithm ?? 'k_means'
  if (rawColorSpace !== 'okhsl' && rawColorSpace !== 'hsl') {
    throw new RangeError('colorSpace must be okhsl or hsl.')
  }
  if (rawDominantColorAlgorithm !== false && rawDominantColorAlgorithm !== 'k_means' && rawDominantColorAlgorithm !== 'median_cut') {
    throw new RangeError('dominantColorAlgorithm must be k_means, median_cut or false.')
  }
  const resolved: ResolvedOptions = {
    frequentColorsCount: options.frequentColorsCount ?? 10,
    colorSpace: rawColorSpace,
    rows: options.rows ?? 1,
    columns: options.columns ?? 1,
    dominantColorAlgorithm: rawDominantColorAlgorithm,
    dominantColorClusters: options.dominantColorClusters ?? 5,
    maxPixels: options.maxPixels ?? 40_000_000,
  }
  validateInteger(resolved.frequentColorsCount, 'frequentColorsCount', 0, 100_000)
  validateInteger(resolved.rows, 'rows')
  validateInteger(resolved.columns, 'columns')
  validateInteger(resolved.dominantColorClusters, 'dominantColorClusters', 1, 16)
  validateInteger(resolved.maxPixels, 'maxPixels')
  return resolved
}
const isRawImage = (value: unknown): value is RawImage => typeof value === 'object' && value !== null && 'data' in value && 'width' in value && 'height' in value && 'channels' in value
const validateRawImage = (image: RawImage, maxPixels: number) => {
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1 || image.width > maxPixels / image.height) {
    throw new RangeError('Raw image dimensions exceed maxPixels or are invalid.')
  }
  const channels = Number(image.channels)
  if (channels !== 3 && channels !== 4) {
    throw new RangeError('Raw image channels must be 3 or 4.')
  }
  if (!(image.data instanceof Uint8Array) || image.data.byteLength !== image.width * image.height * image.channels) {
    throw new RangeError('Raw image data length must equal width \u00D7 height \u00D7 channels.')
  }
}
const encodedBytes = (input: Exclude<ImageInput, RawImage>) => {
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  }
  if (input instanceof ArrayBuffer || typeof SharedArrayBuffer !== 'undefined' && input instanceof SharedArrayBuffer) {
    return new Uint8Array(input)
  }
  throw new TypeError('Expected encoded bytes or a raw RGB/RGBA image.')
}

type ColorCount = {alphaSum: number
  count: number}

const analyzeTile = (image: RawImage, options: ResolvedOptions, converter: ColorConverter, x0: number, y0: number, x1: number, y1: number): TileResult => {
  const lightness = new ProbeAccumulator(100, 100)
  const red = new ProbeAccumulator(255, 1)
  const green = new ProbeAccumulator(255, 1)
  const blue = new ProbeAccumulator(255, 1)
  const hue = new HueProbeAccumulator
  const saturation = new ProbeAccumulator(100, 100)
  const opacity = image.channels === 4 ? new ProbeAccumulator(100, 100) : undefined
  const frequencies = options.frequentColorsCount > 0 ? new Map<number, ColorCount> : undefined
  const dominant = options.dominantColorAlgorithm === false ? undefined : new DominantAccumulator(image.channels === 4)
  for (let y = y0; y < y1; y++) {
    let offset = (y * image.width + x0) * image.channels
    for (let x = x0; x < x1; x++, offset += image.channels) {
      const r = image.data[offset]
      const g = image.data[offset + 1]
      const b = image.data[offset + 2]
      const alpha = image.channels === 4 ? image.data[offset + 3] : 255
      const converted = converter.convert(r, g, b)
      red.add(r)
      green.add(g)
      blue.add(b)
      hue.add(converted.color.hue)
      saturation.add(converted.color.saturation)
      lightness.add(converted.color.lightness)
      if (opacity) {
        opacity.add(alpha * 100 / 255)
      }
      if (frequencies) {
        const current = frequencies.get(converted.key)
        if (current) {
          current.count++
          current.alphaSum += alpha
        } else {
          frequencies.set(converted.key, {
            count: 1,
            alphaSum: alpha,
          })
        }
      }
      dominant?.add(r, g, b, alpha)
    }
  }
  const frequentColors = frequencies ? [...frequencies]
    .toSorted((left, right) => right[1].count - left[1].count || left[0] - right[0])
    .slice(0, options.frequentColorsCount)
    .map(([key, entry]) => ({
      color: {
        ...colorFromKey(key),
        ...image.channels === 4 ? {opacity: entry.alphaSum * 100 / (255 * entry.count)} : {},
      },
      count: entry.count,
    })) : []
  const result: TileResult = {
    probes: {
      lightness: lightness.finalize(),
      red: red.finalize(),
      green: green.finalize(),
      blue: blue.finalize(),
      hue: hue.finalize(),
      saturation: saturation.finalize(),
      ...opacity ? {opacity: opacity.finalize()} : {},
    },
    frequentColors,
  }
  if (dominant) {
    result.dominantColor = dominant.finish(options.dominantColorAlgorithm as 'k_means' | 'median_cut', options.dominantColorClusters, converter)
  }
  return result
}
function inspectImage(input: ImageInput, options?: SingleOptions): SingleResult
function inspectImage(input: ImageInput, options: Options): Result
function inspectImage(input: ImageInput, options: Options = {}): Result {
  const resolved = resolveOptions(options)
  let image: RawImage
  let fileSize: number | undefined
  if (isRawImage(input)) {
    validateRawImage(input, resolved.maxPixels)
    image = input
  } else {
    const bytes = encodedBytes(input)
    fileSize = bytes.byteLength
    image = decodeImage(bytes, resolved.maxPixels)
  }
  if (resolved.rows > image.height || resolved.columns > image.width) {
    throw new RangeError('rows/columns must not create empty tiles.')
  }
  const converter = new ColorConverter(resolved.colorSpace)
  const possibleCrop = findPossibleCrop(image, converter)
  const base: BaseResult = {
    width: image.width,
    height: image.height,
    channels: image.channels,
    bufferSize: image.data.byteLength,
    ...fileSize === undefined ? {} : {fileSize},
    ...possibleCrop ? {possibleCrop} : {},
  }
  if (resolved.rows === 1 && resolved.columns === 1) {
    return {
      ...base,
      ...analyzeTile(image, resolved, converter, 0, 0, image.width, image.height),
    }
  }
  const tiles: Array<Tile> = []
  for (let row = 0; row < resolved.rows; row++) {
    for (let column = 0; column < resolved.columns; column++) {
      const x0 = Math.floor(column * image.width / resolved.columns)
      const y0 = Math.floor(row * image.height / resolved.rows)
      const x1 = Math.floor((column + 1) * image.width / resolved.columns)
      const y1 = Math.floor((row + 1) * image.height / resolved.rows)
      tiles.push({
        row,
        column,
        ...analyzeTile(image, resolved, converter, x0, y0, x1, y1),
      })
    }
  }
  return {
    ...base,
    tiles,
  }
}

export default inspectImage
