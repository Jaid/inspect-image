import type {DecodedImage} from '../types.ts'

import UTIF from 'utif2'

import {checkDimensions, ImageDecoder, packChannels} from './base.ts'

const numberTag = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return value
  }
  if (value instanceof Uint8Array) {
    return value[0]
  }
  if (Array.isArray(value)) {
    return typeof value[0] === 'number' ? value[0] : Number.parseInt(String(value[0]), 10)
  }
  return undefined
}
const isTiff = (data: Uint8Array) => data.length >= 4 && (data[0] === 0x49 && data[1] === 0x49 && data[2] === 0x2A && data[3] === 0 || data[0] === 0x4D && data[1] === 0x4D && data[2] === 0 && data[3] === 0x2A)

export class TiffDecoder extends ImageDecoder {
  readonly format = 'tiff' as const
  decode(data: Buffer, maxPixels: number): DecodedImage {
    const pages = UTIF.decode(data)
    const page = pages.at(0)
    if (!page) {
      throw new TypeError('TIFF contains no image page.')
    }
    const width = numberTag(page.t256) ?? (typeof page.width === 'number' ? page.width : undefined)
    const height = numberTag(page.t257) ?? (typeof page.height === 'number' ? page.height : undefined)
    if (width === undefined || height === undefined) {
      throw new TypeError('TIFF page is missing dimensions.')
    }
    checkDimensions(width, height, maxPixels)
    UTIF.decodeImage(data, page)
    const rgba = UTIF.toRGBA8(page)
    const samples = numberTag(page.t277) ?? 3
    const extra = numberTag(page.t338)
    const channels: 3 | 4 = samples === 2 || samples >= 4 || extra !== undefined ? 4 : 3
    return {
      format: this.format,
      width,
      height,
      channels,
      data: packChannels(rgba, channels),
    }
  }
  matches(data: Uint8Array) {
    return isTiff(data)
  }
}
