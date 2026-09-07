import type {ColorSpace, HslColor} from './types.ts'

import {fromRgb as rgbToOkhsl} from 'okhsl'

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))
const wrapHue = (value: number) => (value % 360 + 360) % 360
const rgbToHsl = (red: number, green: number, blue: number): HslColor => {
  const r = clamp(red, 0, 255) / 255
  const g = clamp(green, 0, 255) / 255
  const b = clamp(blue, 0, 255) / 255
  const maximum = Math.max(r, g, b)
  const minimum = Math.min(r, g, b)
  const delta = maximum - minimum
  const lightness = (maximum + minimum) / 2
  if (delta < 1e-12) {
    return {
      hue: 0,
      saturation: 0,
      lightness: lightness * 100,
    }
  }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue: number
  if (maximum === r) {
    hue = 60 * ((g - b) / delta % 6)
  } else if (maximum === g) {
    hue = 60 * ((b - r) / delta + 2)
  } else {
    hue = 60 * ((r - g) / delta + 4)
  }
  return {
    hue: wrapHue(hue),
    saturation: saturation * 100,
    lightness: lightness * 100,
  }
}

export const integerColor = (color: HslColor): HslColor => ({
  hue: Math.round(wrapHue(color.hue)) % 360,
  saturation: clamp(Math.round(color.saturation), 0, 100),
  lightness: clamp(Math.round(color.lightness), 0, 100),
})

export const colorKey = (color: HslColor) => {
  const rounded = integerColor(color)
  return (rounded.hue * 101 + rounded.saturation) * 101 + rounded.lightness
}

export const colorFromKey = (key: number): HslColor => ({
  hue: Math.floor(key / 10_201),
  saturation: Math.floor(key / 101) % 101,
  lightness: key % 101,
})

type CachedColor = {color: HslColor
  integer: HslColor
  key: number}

export class ColorConverter {
  private readonly cache = new Map<number, CachedColor>
  constructor(readonly space: ColorSpace) {}

  convert(red: number, green: number, blue: number): CachedColor {
    const r = clamp(Math.round(red), 0, 255)
    const g = clamp(Math.round(green), 0, 255)
    const b = clamp(Math.round(blue), 0, 255)
    const rgbKey = r << 16 | g << 8 | b
    const cached = this.cache.get(rgbKey)
    if (cached) {
      return cached
    }
    let color: HslColor
    if (this.space === 'okhsl') {
      const [hue, saturation, lightness] = rgbToOkhsl(r, g, b)
      color = {
        hue,
        saturation,
        lightness,
      }
    } else {
      color = rgbToHsl(r, g, b)
    }
    const rounded = integerColor(color)
    const result = {
      color,
      integer: rounded,
      key: colorKey(rounded),
    }
    // Preserve excellent low-palette performance without letting arbitrary photographs
    // turn a memoization optimization into hundreds of MB of Map overhead.
    if (this.cache.size >= 65_536) {
      this.cache.clear()
    }
    this.cache.set(rgbKey, result)
    return result
  }
}
