import {expect, test} from 'bun:test'
import {crc32, deflateSync} from 'node:zlib'

import inspectImage from '#src/main.ts'

const chunk = (type: string, data: Uint8Array) => {
  const bytes = Buffer.concat([Buffer.from(type), data])
  const result = Buffer.alloc(bytes.length + 8)
  result.writeUInt32BE(data.length)
  bytes.copy(result, 4)
  result.writeUInt32BE(crc32(bytes), result.length - 4)
  return result
}
const png = (type: number, depth: number, samples: Array<number>, extras: Array<Buffer> = []) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = depth
  ihdr[9] = type
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    ...extras,
    chunk('IDAT', deflateSync(Buffer.from([0, ...samples]))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
test('PNG tRNS preserves the transparent color-key RGB and exposes alpha', () => {
  const result = inspectImage(png(2, 8, [255, 0, 0], [chunk('tRNS', Buffer.from([0, 255, 0, 0, 0, 0]))]))
  expect(result.channels).toBe(4)
  expect(result.probes.opacity?.average).toBe(0)
  expect(result.probes.red.average).toBe(255)
})
test('PNG grayscale and grayscale-alpha normalize to RGB/RGBA', () => {
  expect(inspectImage(png(0, 1, [128]))).toMatchObject({
    channels: 3,
    bufferSize: 3,
    probes: {red: {average: 255}},
  })
  expect(inspectImage(png(0, 16, [128, 0]))).toMatchObject({
    channels: 3,
    bufferSize: 3,
    probes: {red: {average: 128}},
  })
  expect(inspectImage(png(4, 8, [99, 255]))).toMatchObject({
    channels: 4,
    bufferSize: 4,
    probes: {
      red: {average: 99},
      opacity: {average: 100},
    },
  })
})
test('PNG indexed transparency remains structural even when opaque', () => {
  const result = inspectImage(png(3, 8, [0], [chunk('PLTE', Buffer.from([255, 0, 0])), chunk('tRNS', Buffer.from([255]))]))
  expect(result.channels).toBe(4)
  expect(result.probes.red.average).toBe(255)
  expect(result.probes.opacity?.average).toBe(100)
})
