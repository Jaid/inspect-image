import type {DecodedImage} from '../types.ts'

import {decode as decodeBmp} from 'bmp-ts'

import {checkDimensions, hasPrefix, ImageDecoder, packChannels} from './base.ts'

const signature = [0x42, 0x4D] as const
export class BmpDecoder extends ImageDecoder {
  readonly format = 'bmp' as const
  decode(data: Buffer, maxPixels: number): DecodedImage {
    if (data.length < 26) {
      throw new TypeError('Truncated BMP.')
    }
    checkDimensions(Math.abs(data.readInt32LE(18)), Math.abs(data.readInt32LE(22)), maxPixels)
    const decoded = decodeBmp(data, {toRGBA: true})
    const channels: 3 | 4 = decoded.bitPP === 32 ? 4 : 3
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
