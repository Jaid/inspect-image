const readU16 = (data: Uint8Array, offset: number, littleEndian: boolean) => {
  if (littleEndian) {
    return data[offset] | data[offset + 1] << 8
  }
  return data[offset] << 8 | data[offset + 1]
}
const readU32 = (data: Uint8Array, offset: number, littleEndian: boolean) => {
  if (littleEndian) {
    return (data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] << 24) >>> 0
  }
  return (data[offset] << 24 | data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3]) >>> 0
}
const orientationFromTiff = (data: Uint8Array, start: number) => {
  if (start + 8 > data.length) {
    return 1
  }
  const littleEndian = data[start] === 0x49 && data[start + 1] === 0x49
  const bigEndian = data[start] === 0x4D && data[start + 1] === 0x4D
  if (!littleEndian && !bigEndian || readU16(data, start + 2, littleEndian) !== 42) {
    return 1
  }
  const ifdStart = start + readU32(data, start + 4, littleEndian)
  if (ifdStart + 2 > data.length) {
    return 1
  }
  const entries = readU16(data, ifdStart, littleEndian)
  for (let index = 0; index < entries; index++) {
    const entry = ifdStart + 2 + index * 12
    if (entry + 12 > data.length) {
      break
    }
    if (readU16(data, entry, littleEndian) !== 0x01_12) {
      continue
    }
    const type = readU16(data, entry + 2, littleEndian)
    const count = readU32(data, entry + 4, littleEndian)
    if (count < 1) {
      return 1
    }
    let value = 1
    if (type === 3) {
      value = readU16(data, entry + 8, littleEndian)
    } else if (type === 4) {
      value = readU32(data, entry + 8, littleEndian)
    }
    return value >= 1 && value <= 8 ? value : 1
  }
  return 1
}

export const readJpegOrientation = (data: Uint8Array) => {
  if (data.length < 4 || data[0] !== 0xFF || data[1] !== 0xD8) {
    return 1
  }
  let offset = 2
  while (offset + 4 <= data.length) {
    while (offset < data.length && data[offset] === 0xFF) {
      offset++
    }
    const marker = data[offset]
    if (marker === 0xDA || marker === 0xD9) {
      break
    }
    if (offset + 2 >= data.length) {
      break
    }
    const size = data[offset + 1] << 8 | data[offset + 2]
    if (size < 2 || offset + size + 1 > data.length) {
      break
    }
    if (marker === 0xE1) {
      const start = offset + 3
      const exifHeader = data.subarray(start, start + 6)
      if (start + 6 <= data.length && Buffer.from(exifHeader).equals(Buffer.from('Exif\0\0'))) {
        return orientationFromTiff(data, start + 6)
      }
    }
    offset += size + 1
  }
  return 1
}

export const applyExifOrientation = (data: Uint8Array, width: number, height: number, channels: 3 | 4, orientation: number) => {
  if (orientation <= 1 || orientation > 8) {
    return {
      data,
      width,
      height,
    }
  }
  const swapped = orientation >= 5
  const targetWidth = swapped ? height : width
  const targetHeight = swapped ? width : height
  const target = new Uint8Array(targetWidth * targetHeight * channels)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let dx = x
      let dy = y
      switch (orientation) {
        case 2: {
          dx = width - 1 - x
          break
        }
        case 3: {
          dx = width - 1 - x
          dy = height - 1 - y
          break
        }
        case 4: {
          dy = height - 1 - y
          break
        }
        case 5: {
          dx = y
          dy = x
          break
        }
        case 6: {
          dx = height - 1 - y
          dy = x
          break
        }
        case 7: {
          dx = height - 1 - y
          dy = width - 1 - x
          break
        }
        case 8: {
          dx = y
          dy = width - 1 - x
          break
        }
      }
      const source = (y * width + x) * channels
      const destination = (dy * targetWidth + dx) * channels
      for (let channel = 0; channel < channels; channel++) {
        target[destination + channel] = data[source + channel]
      }
    }
  }
  return {
    data: target,
    width: targetWidth,
    height: targetHeight,
  }
}
