import {describe, expect, test} from 'bun:test'

import {fromRgb as rgbToOkhsl} from 'okhsl'

import inspectImage from '#src/main.ts'

import {raw} from './helpers.ts'

const black = [0, 0, 0]
const white = [255, 255, 255]
const red = [255, 0, 0]
const solid = (width = 2, height = 2, color = red) => raw(width, height, Array.from({length: width * height}, () => color), color.length as 3 | 4)
describe('public API and statistics', () => {
  test('exports only the default function', async () => {
    expect(Object.keys(await import('#src/main.ts'))).toEqual(['default'])
  })
  test('dimensions, decoded size, exact RGB statistics and defaults', () => {
    const result = inspectImage(raw(2, 2, [black, white, black, white]))
    expect(result).toMatchObject({
      width: 2,
      height: 2,
      channels: 3,
      bufferSize: 12,
    })
    expect(result.fileSize).toBeUndefined()
    expect(result.probes.opacity).toBeUndefined()
    expect(result.probes.red).toMatchObject({
      minimum: 0,
      maximum: 255,
      average: 127.5,
      median: 127.5,
    })
    expect(result.probes.lightness).toMatchObject({
      minimum: 0,
      maximum: 100,
      average: 50,
      median: 50,
    })
    expect(result.probes.red.brackets).toHaveLength(13)
    expect(result.probes.red.brackets.reduce((sum, bracket) => sum + bracket.count, 0)).toBe(4)
    expect(result.frequentColors.map(entry => entry.count)).toEqual([2, 2])
    expect(result.dominantColor).toBeDefined()
  })
  test('uses the external okhsl package as canonical inverse conversion', () => {
    const [hue, saturation, lightness] = rgbToOkhsl(255, 0, 0)
    const result = inspectImage(solid())
    expect(result.frequentColors[0].color).toMatchObject({
      hue,
      saturation,
      lightness,
    })
    expect(result.probes.hue.average).toBe(hue)
    expect(result.probes.saturation.average).toBe(saturation)
    expect(result.probes.lightness.average).toBe(lightness)
  })
  test('standard HSL mode stays independent of OkHSL', () => {
    const result = inspectImage(solid(), {colorSpace: 'hsl'})
    expect(result.frequentColors[0].color).toMatchObject({
      hue: 0,
      saturation: 100,
      lightness: 50,
    })
    expect(result.probes.lightness.average).toBe(50)
  })
  test('alpha is probed but does not split color groups', () => {
    const result = inspectImage(raw(2, 1, [[255, 0, 0, 0], [255, 0, 0, 255]], 4), {colorSpace: 'hsl'})
    expect(result.probes.opacity).toMatchObject({
      minimum: 0,
      maximum: 100,
      average: 50,
      median: 50,
    })
    expect(result.frequentColors).toEqual([
      {
        color: {
          hue: 0,
          saturation: 100,
          lightness: 50,
          opacity: 50,
        },
        count: 2,
      },
    ])
    expect(result.dominantColor?.opacity).toBeCloseTo(50)
  })
  test('dominant color algorithms are deterministic and independent of frequency reporting', () => {
    const image = raw(5, 1, [red, red, red, white, black])
    for (const algorithm of ['k_means', 'median_cut'] as const) {
      const result = inspectImage(image, {
        dominantColorAlgorithm: algorithm,
        frequentColorsCount: 0,
      })
      expect(result.frequentColors).toEqual([])
      expect(result.dominantColor).toBeDefined()
      expect(result).toEqual(inspectImage(image, {
        dominantColorAlgorithm: algorithm,
        frequentColorsCount: 0,
      }))
    }
    expect(inspectImage(image, {dominantColorAlgorithm: false})).not.toHaveProperty('dominantColor')
  })
  test('top colors use deterministic ordering and requested limit', () => {
    const image = raw(20, 1, Array.from({length: 20}, (_, index) => [index * 12, index * 12, index * 12]))
    const result = inspectImage(image)
    expect(result.frequentColors).toHaveLength(10)
    expect(inspectImage(image, {frequentColorsCount: 1}).frequentColors).toHaveLength(1)
    expect(inspectImage(image, {frequentColorsCount: 0}).frequentColors).toEqual([])
  })
  test('uneven grids cover every pixel once in row-major order', () => {
    const image = raw(5, 3, Array.from({length: 15}, (_, index) => {
      if (index % 5 < 2) {
        return black
      }
      return white
    }))
    const result = inspectImage(image, {
      rows: 2,
      columns: 2,
      frequentColorsCount: 100,
    })
    if (!('tiles' in result)) {
      throw new Error('Expected split result.')
    }
    expect(result.tiles.map(tile => [tile.row, tile.column])).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]])
    const total = result.tiles.reduce((sum, tile) => sum + tile.frequentColors.reduce((inner, entry) => inner + entry.count, 0), 0)
    expect(total).toBe(15)
    expect(result).not.toHaveProperty('probes')
  })
  test('does not mutate raw input', () => {
    const image = solid()
    const copy = Uint8Array.from(image.data)
    inspectImage(image)
    expect(image.data).toEqual(copy)
  })
})
describe('crop semantics', () => {
  test('finds a uniform frame', () => {
    const image = raw(5, 4, Array.from({length: 20}, (_, index) => {
      if ([6, 7, 11, 12].includes(index)) {
        return red
      }
      return white
    }))
    expect(inspectImage(image).possibleCrop).toEqual({
      x: 1,
      y: 1,
      width: 2,
      height: 2,
      color: {
        hue: 0,
        saturation: 0,
        lightness: 100,
      },
    })
  })
  test('accepts every adjacent pair', () => {
    for (const right of [false, true]) {
      for (const bottom of [false, true]) {
        const image = raw(3, 3, Array.from({length: 9}, (_, index) => {
          const x = index % 3
          const y = Math.floor(index / 3)
          return (right ? x === 2 : x === 0) || (bottom ? y === 2 : y === 0) ? white : red
        }))
        expect(inspectImage(image).possibleCrop).toMatchObject({
          x: right ? 0 : 1,
          y: bottom ? 0 : 1,
          width: 2,
          height: 2,
        })
      }
    }
  })
  test('rejects opposite-only edges and uniform images', () => {
    expect(inspectImage(raw(3, 3, [white, white, white, red, red, red, white, white, white])).possibleCrop).toBeUndefined()
    expect(inspectImage(solid()).possibleCrop).toBeUndefined()
  })
  test('crop equality ignores alpha', () => {
    const image = raw(3, 3, [
      [255, 255, 255, 0],
      [255, 255, 255, 50],
      [255, 255, 255, 100],
      [255, 255, 255, 150],
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [255, 255, 255, 200],
      [255, 0, 0, 255],
      [255, 0, 0, 255],
    ], 4)
    expect(inspectImage(image).possibleCrop).toMatchObject({
      x: 1,
      y: 1,
      width: 2,
      height: 2,
    })
  })
})
describe('validation', () => {
  test('rejects malformed inputs and invalid options before work', () => {
    const image = solid()
    for (const options of [{rows: 0}, {columns: 3}, {rows: 1.5}, {frequentColorsCount: -1}, {maxPixels: Number.NaN}, {dominantColorClusters: 17}, {colorSpace: 'lab'}, {dominantColorAlgorithm: true}]) {
      expect(() => inspectImage(image, options as never)).toThrow()
    }
    expect(() => inspectImage(Buffer.from('not an image'))).toThrow()
    expect(() => inspectImage({
      ...image,
      data: new Uint8Array(1),
    })).toThrow()
  })
})
