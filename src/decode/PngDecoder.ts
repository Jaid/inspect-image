import type {DecodedImage} from '../types.ts'

import {PNG} from 'pngjs'

import {checkDimensions, hasPrefix, ImageDecoder, packChannels} from './base.ts'

const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] as const

export class PngDecoder extends ImageDecoder {
  readonly format = 'png' as const
  decode(data: Buffer, maxPixels: number): DecodedImage {
    if (data.length < 24) {
      throw new TypeError('Truncated PNG.')
    }
    checkDimensions(data.readUInt32BE(16), data.readUInt32BE(20), maxPixels)
    const decoded = PNG.sync.read(data) as ReturnType<typeof PNG.sync.read> & {depth: number
      transColor?: Array<number>}
    if (decoded.transColor) {
      const source: Array<number> = decoded.transColor.length === 1 ? [decoded.transColor[0], decoded.transColor[0], decoded.transColor[0]] : decoded.transColor
      const rgb = source.map((value: number) => Math.round(value * 255 / (2 ** decoded.depth - 1)))
      for (let index = 0; index < decoded.data.length; index += 4) {
        if (decoded.data[index + 3] === 0) {
          decoded.data.set(rgb, index)
        }
      }
    }
    const channels: 3 | 4 = decoded.alpha ? 4 : 3
    return {
      format: this.format,
      width: decoded.width,
      height: decoded.height,
      channels,
      data: packChannels(decoded.data, channels),
    }
  }
  matches(data: Uint8Array) {
    return hasPrefix(data, signature)
  }
}
