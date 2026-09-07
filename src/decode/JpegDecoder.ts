import type {DecodedImage} from '../types.ts'

import {decode as decodeJpeg} from 'jpeg-js'

import {checkDimensions, hasPrefix, ImageDecoder} from './base.ts'
import {applyExifOrientation, readJpegOrientation} from './exif.ts'

const signature = [0xFF, 0xD8, 0xFF] as const

export class JpegDecoder extends ImageDecoder {
  readonly format = 'jpeg' as const
  decode(data: Buffer, maxPixels: number): DecodedImage {
    const decoded = decodeJpeg(data, {
      useTArray: true,
      formatAsRGBA: false,
      tolerantDecoding: false,
      maxResolutionInMP: maxPixels / 1e6,
      maxMemoryUsageInMB: 1024,
    })
    checkDimensions(decoded.width, decoded.height, maxPixels)
    const oriented = applyExifOrientation(decoded.data, decoded.width, decoded.height, 3, readJpegOrientation(data))
    return {
      format: this.format,
      width: oriented.width,
      height: oriented.height,
      channels: 3,
      data: oriented.data,
    }
  }
  matches(data: Uint8Array) {
    return hasPrefix(data, signature)
  }
}
