import type {DecodedImage} from '../types.ts'

import {BmpDecoder} from './BmpDecoder.ts'
import {GifDecoder} from './GifDecoder.ts'
import {JpegDecoder} from './JpegDecoder.ts'
import {PngDecoder} from './PngDecoder.ts'
import {TiffDecoder} from './TiffDecoder.ts'

const decoders = [new PngDecoder, new JpegDecoder, new GifDecoder, new BmpDecoder, new TiffDecoder]

export const decodeImage = (input: Uint8Array, maxPixels: number): DecodedImage => {
  const data = Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  const decoder = decoders.find(candidate => candidate.matches(data))
  if (!decoder) {
    throw new TypeError('Unsupported encoded image. Supported formats: PNG, JPEG, GIF, BMP and TIFF.')
  }
  return decoder.decode(data, maxPixels)
}

export {BmpDecoder} from './BmpDecoder.ts'

export {applyExifOrientation, readJpegOrientation} from './exif.ts'
export {GifDecoder} from './GifDecoder.ts'
export {JpegDecoder} from './JpegDecoder.ts'
export {PngDecoder} from './PngDecoder.ts'
export {TiffDecoder} from './TiffDecoder.ts'
