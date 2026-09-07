import type {DecodedImage} from '../types.ts'

export const checkDimensions = (width: number, height: number, maxPixels: number) => {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > maxPixels / height) {
    throw new RangeError('Image dimensions must be positive integers within maxPixels.')
  }
}

export const hasPrefix = (data: Uint8Array, signature: ReadonlyArray<number>) => signature.every((byte, index) => data[index] === byte)

export const packChannels = (rgba: Uint8Array, channels: 3 | 4) => {
  if (channels === 4) {
    return rgba instanceof Uint8Array ? new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength) : Uint8Array.from(rgba)
  }
  const rgb = new Uint8Array(rgba.length / 4 * 3)
  for (let source = 0, target = 0; source < rgba.length; source += 4) {
    rgb[target++] = rgba[source]
    rgb[target++] = rgba[source + 1]
    rgb[target++] = rgba[source + 2]
  }
  return rgb
}

export abstract class ImageDecoder {
  abstract readonly format: DecodedImage['format']
  abstract decode(data: Buffer, maxPixels: number): DecodedImage
  abstract matches(data: Uint8Array): boolean
}
