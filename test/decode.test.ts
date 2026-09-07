import {expect, test} from 'bun:test'

import inspectImage from '#src/main.ts'

import {encodeBmpBuffer, encodeGifBuffer, encodeJpegBuffer, encodePng, encodeTiffBuffer, rgbaFill, withExifOrientation} from './helpers.ts'

test('decodes PNG RGB and explicit RGBA distinctly', () => {
  for (const colorType of [2, 6] as const) {
    const bytes = encodePng(2, 1, rgbaFill(2, 1, 255, 0, 0), colorType)
    const result = inspectImage(bytes)
    expect(result).toMatchObject({
      width: 2,
      height: 1,
      channels: colorType === 2 ? 3 : 4,
      fileSize: bytes.length,
      bufferSize: colorType === 2 ? 6 : 8,
    })
    expect(Boolean(result.probes.opacity)).toBe(colorType === 6)
  }
})
test('decodes JPEG and applies EXIF orientation', () => {
  const rgba = new Uint8Array([
    255,
    0,
    0,
    255,
    0,
    255,
    0,
    255,
    0,
    0,
    255,
    255,
    255,
    255,
    0,
    255,
    255,
    0,
    255,
    255,
    0,
    255,
    255,
    255,
  ])
  const base = encodeJpegBuffer(2, 3, rgba)
  const plain = inspectImage(base)
  const rotated = inspectImage(withExifOrientation(base, 6))
  expect(plain).toMatchObject({
    width: 2,
    height: 3,
    channels: 3,
  })
  expect(rotated).toMatchObject({
    width: 3,
    height: 2,
    channels: 3,
  })
})
test('decodes GIF', () => {
  const bytes = encodeGifBuffer(5, 4, rgbaFill(5, 4, 0, 255, 0))
  const result = inspectImage(bytes)
  expect(result).toMatchObject({
    width: 5,
    height: 4,
    channels: 3,
  })
  expect(result.probes.green.minimum).toBe(255)
})
test('preserves GIF transparency as alpha metadata', () => {
  const data = rgbaFill(2, 1, 255, 0, 0)
  data[3] = 0
  const bytes = encodeGifBuffer(2, 1, data, 0)
  const result = inspectImage(bytes)
  expect(result.channels).toBe(4)
  expect(result.probes.opacity).toBeDefined()
})
test('decodes BMP', () => {
  const bytes = encodeBmpBuffer(4, 3, rgbaFill(4, 3, 0, 0, 255))
  const result = inspectImage(bytes)
  expect(result).toMatchObject({
    width: 4,
    height: 3,
  })
  expect(result.probes.blue.minimum).toBe(255)
})
test('decodes TIFF', () => {
  const bytes = encodeTiffBuffer(3, 3, rgbaFill(3, 3, 255, 255, 0))
  const result = inspectImage(bytes)
  expect(result).toMatchObject({
    width: 3,
    height: 3,
  })
  expect(result.probes.red.minimum).toBe(255)
  expect(result.probes.green.minimum).toBe(255)
})
test('honors maxPixels before expensive analysis', () => {
  const bytes = encodePng(20, 20, rgbaFill(20, 20, 1, 2, 3))
  expect(() => inspectImage(bytes, {maxPixels: 399})).toThrow()
})
