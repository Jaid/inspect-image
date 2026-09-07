import type {ColorConverter} from './color.ts'
import type {CropRectangle, RawImage} from './types.ts'

import {colorFromKey} from './color.ts'

const pixelKey = (image: RawImage, converter: ColorConverter, x: number, y: number) => {
  const offset = (y * image.width + x) * image.channels
  return converter.convert(image.data[offset], image.data[offset + 1], image.data[offset + 2]).key
}
const edgeKey = (image: RawImage, converter: ColorConverter, edge: 'bottom' | 'left' | 'right' | 'top') => {
  let first: number | undefined
  const consider = (x: number, y: number) => {
    const key = pixelKey(image, converter, x, y)
    if (first === undefined) {
      first = key
    }
    return key === first
  }
  if (edge === 'top' || edge === 'bottom') {
    const y = edge === 'top' ? 0 : image.height - 1
    for (let x = 0; x < image.width; x++) {
      if (!consider(x, y)) {
        return
      }
    }
  } else {
    const x = edge === 'left' ? 0 : image.width - 1
    for (let y = 0; y < image.height; y++) {
      if (!consider(x, y)) {
        return
      }
    }
  }
  return first
}

export const findPossibleCrop = (image: RawImage, converter: ColorConverter): CropRectangle | undefined => {
  if (image.width < 2 || image.height < 2) {
    return undefined
  }
  const edges = {
    top: edgeKey(image, converter, 'top'),
    bottom: edgeKey(image, converter, 'bottom'),
    left: edgeKey(image, converter, 'left'),
    right: edgeKey(image, converter, 'right'),
  }
  let target: number | undefined
  for (const [first, second] of [['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']] as const) {
    if (edges[first] !== undefined && edges[first] === edges[second]) {
      target = edges[first]
      break
    }
  }
  if (target === undefined) {
    return undefined
  }
  const rowMatches = (y: number) => {
    for (let x = 0; x < image.width; x++) {
      if (pixelKey(image, converter, x, y) !== target) {
        return false
      }
    }
    return true
  }
  const columnMatches = (x: number) => {
    for (let y = 0; y < image.height; y++) {
      if (pixelKey(image, converter, x, y) !== target) {
        return false
      }
    }
    return true
  }
  let top = 0
  let bottom = image.height - 1
  let left = 0
  let right = image.width - 1
  while (top <= bottom && rowMatches(top)) {
    top++
  }
  while (bottom >= top && rowMatches(bottom)) {
    bottom--
  }
  while (left <= right && columnMatches(left)) {
    left++
  }
  while (right >= left && columnMatches(right)) {
    right--
  }
  if (top > bottom || left > right) {
    return undefined
  }
  if (top === 0 && bottom === image.height - 1 && left === 0 && right === image.width - 1) {
    return undefined
  }
  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
    color: colorFromKey(target),
  }
}
