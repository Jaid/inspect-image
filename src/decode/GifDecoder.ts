import type {DecodedImage} from '../types.ts'

import {GifReader} from 'omggif'

import {checkDimensions, hasPrefix, ImageDecoder, packChannels} from './base.ts'

const signature = [0x47, 0x49, 0x46, 0x38] as const
export class GifDecoder extends ImageDecoder {
  readonly format = 'gif' as const
  decode(data: Buffer, maxPixels: number): DecodedImage {
    if (data.length < 10) {
      throw new TypeError('Truncated GIF.')
    }
    const width = data.readUInt16LE(6)
    const height = data.readUInt16LE(8)
    checkDimensions(width, height, maxPixels)
    const reader = new GifReader(data)
    const rgba = new Uint8Array(width * height * 4)
    reader.decodeAndBlitFrameRGBA(0, rgba)
    const hasAlpha = reader.frameInfo(0).transparent_index !== null
    const channels: 3 | 4 = hasAlpha ? 4 : 3
    return {
      format: this.format,
      width,
      height,
      channels,
      data: packChannels(rgba, channels),
    }
  }
  matches(data: Uint8Array) {
    return hasPrefix(data, signature)
  }
}
