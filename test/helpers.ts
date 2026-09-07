import {encode as encodeBmp} from 'bmp-ts'
import {encode as encodeJpeg} from 'jpeg-js'
import {GifWriter} from 'omggif'
import {PNG} from 'pngjs'
import UTIF from 'utif2'

export const rgbaFill = (width: number, height: number, red: number, green: number, blue: number, alpha = 255) => {
  const data = new Uint8Array(width * height * 4)
  for (let index = 0; index < data.length; index += 4) {
    data[index] = red
    data[index + 1] = green
    data[index + 2] = blue
    data[index + 3] = alpha
  }
  return data
}

export const encodePng = (width: number, height: number, data: Uint8Array, colorType: 0 | 2 | 4 | 6 = 6) => {
  const image = new PNG({
    width,
    height,
    colorType,
  })
  image.data = Buffer.from(data)
  return PNG.sync.write(image, {
    colorType,
    inputHasAlpha: true,
  })
}

export const encodeJpegBuffer = (width: number, height: number, data: Uint8Array) => encodeJpeg({
  width,
  height,
  data: Buffer.from(data),
}, 100).data

export const encodeGifBuffer = (width: number, height: number, data: Uint8Array, transparentIndex?: number) => {
  const palette: Array<number> = []
  const indexByColor = new Map<number, number>
  const indexed = Array.from({length: width * height}, () => 0)
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = pixel * 4
    const key = data[offset + 3] === 0 ? -1 : data[offset] << 16 | data[offset + 1] << 8 | data[offset + 2]
    let index = indexByColor.get(key)
    if (index === undefined) {
      index = palette.length
      palette.push(key === -1 ? 0 : key)
      indexByColor.set(key, index)
    }
    indexed[pixel] = index
  }
  while (palette.length < 2 || (palette.length & palette.length - 1) !== 0) {
    palette.push(0)
  }
  const buffer = Buffer.alloc(1024 + width * height)
  const writer = new GifWriter(buffer, width, height, {
    palette,
    loop: 0,
  })
  writer.addFrame(0, 0, width, height, indexed, {
    transparent: transparentIndex,
    delay: 0,
    disposal: 0,
  })
  return buffer.subarray(0, writer.end())
}

export const encodeBmpBuffer = (width: number, height: number, data: Uint8Array) => {
  const bgra = Buffer.alloc(width * height * 4)
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = pixel * 4
    bgra[offset] = data[offset + 3]
    bgra[offset + 1] = data[offset + 2]
    bgra[offset + 2] = data[offset + 1]
    bgra[offset + 3] = data[offset]
  }
  return encodeBmp({
    width,
    height,
    data: bgra,
    bitPP: 32,
  }).data
}

export const encodeTiffBuffer = (width: number, height: number, data: Uint8Array) => Buffer.from(UTIF.encodeImage(data, width, height))

export const withExifOrientation = (jpeg: Uint8Array, orientation: number) => {
  const tiff = Buffer.alloc(26)
  tiff.write('II', 0, 'ascii')
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4)
  tiff.writeUInt16LE(1, 8)
  tiff.writeUInt16LE(0x01_12, 10)
  tiff.writeUInt16LE(3, 12)
  tiff.writeUInt32LE(1, 14)
  tiff.writeUInt16LE(orientation, 18)
  tiff.writeUInt32LE(0, 22)
  const payload = Buffer.concat([Buffer.from('Exif\0\0'), tiff])
  const header = Buffer.alloc(4)
  header[0] = 0xFF
  header[1] = 0xE1
  header.writeUInt16BE(payload.length + 2, 2)
  return Buffer.concat([Buffer.from(jpeg.subarray(0, 2)), header, payload, Buffer.from(jpeg.subarray(2))])
}

export const raw = (width: number, height: number, pixels: Array<Array<number>>, channels: 3 | 4 = 3) => ({
  width,
  height,
  channels,
  data: new Uint8Array(pixels.flat()),
})
