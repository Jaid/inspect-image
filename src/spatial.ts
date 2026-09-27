import type {Probe, RawImage} from './types.ts'

import {ProbeAccumulator} from './probe.ts'

const lumaRedWeight = 2126
const lumaGreenWeight = 7152
const lumaBlueWeight = 722
const lumaScale = 10_000
const lumaMaximum = 255 * lumaScale

type SpatialRow = {
  luma: Uint32Array
  maximum1: Uint32Array
  maximum2: Uint32Array
  minimum1: Uint32Array
  minimum2: Uint32Array
}

const createSpatialRow = (image: RawImage, y: number, x0: number, x1: number): SpatialRow => {
  const extendedX0 = Math.max(0, x0 - 2)
  const extendedX1 = Math.min(image.width, x1 + 2)
  const luma = new Uint32Array(extendedX1 - extendedX0)
  let offset = (y * image.width + extendedX0) * image.channels
  for (let x = extendedX0; x < extendedX1; x++, offset += image.channels) {
    luma[x - extendedX0] = image.data[offset] * lumaRedWeight
      + image.data[offset + 1] * lumaGreenWeight
      + image.data[offset + 2] * lumaBlueWeight
  }
  const width = x1 - x0
  const minimum1 = new Uint32Array(width)
  const maximum1 = new Uint32Array(width)
  const minimum2 = new Uint32Array(width)
  const maximum2 = new Uint32Array(width)
  for (let x = x0; x < x1; x++) {
    const index = x - x0
    let min1 = lumaMaximum
    let max1 = 0
    let min2 = lumaMaximum
    let max2 = 0
    for (let nearbyX = Math.max(0, x - 2); nearbyX <= Math.min(image.width - 1, x + 2); nearbyX++) {
      const value = luma[nearbyX - extendedX0]
      min2 = Math.min(min2, value)
      max2 = Math.max(max2, value)
      if (!(Math.abs(nearbyX - x) <= 1)) {
        continue
      }
      min1 = Math.min(min1, value)
      max1 = Math.max(max1, value)
    }
    minimum1[index] = min1
    maximum1[index] = max1
    minimum2[index] = min2
    maximum2[index] = max2
  }
  return {
    luma,
    maximum1,
    maximum2,
    minimum1,
    minimum2,
  }
}

export const analyzeSpatialTile = (image: RawImage, x0: number, y0: number, x1: number, y1: number): {
  activity: Probe
  acutance: Probe
} => {
  const acutance = new ProbeAccumulator(100, 100)
  const activity = new ProbeAccumulator(100, 100)
  const extendedX0 = Math.max(0, x0 - 2)
  const rows = new Map<number, SpatialRow>
  const getRow = (y: number) => {
    if (y < 0 || y >= image.height) {
      return
    }
    let row = rows.get(y)
    if (!row) {
      row = createSpatialRow(image, y, x0, x1)
      rows.set(y, row)
    }
    return row
  }
  for (let y = y0; y < y1; y++) {
    const row = getRow(y) as SpatialRow
    const nearbyRows2: Array<SpatialRow> = []
    const nearbyRows1: Array<SpatialRow> = []
    for (let nearbyY = Math.max(0, y - 2); nearbyY <= Math.min(image.height - 1, y + 2); nearbyY++) {
      const nearbyRow = getRow(nearbyY) as SpatialRow
      nearbyRows2.push(nearbyRow)
      if (Math.abs(nearbyY - y) <= 1) {
        nearbyRows1.push(nearbyRow)
      }
    }
    for (let x = x0; x < x1; x++) {
      const index = x - x0
      let minimum1 = lumaMaximum
      let maximum1 = 0
      let minimum2 = lumaMaximum
      let maximum2 = 0
      for (const nearbyRow of nearbyRows2) {
        minimum2 = Math.min(minimum2, nearbyRow.minimum2[index])
        maximum2 = Math.max(maximum2, nearbyRow.maximum2[index])
      }
      for (const nearbyRow of nearbyRows1) {
        minimum1 = Math.min(minimum1, nearbyRow.minimum1[index])
        maximum1 = Math.max(maximum1, nearbyRow.maximum1[index])
      }
      const range2 = maximum2 - minimum2
      if (range2 > 0) {
        acutance.add((maximum1 - minimum1) * 100 / range2)
      }
      const center = row.luma[x - extendedX0]
      let activitySum = 0
      let neighborCount = 0
      if (x > 0) {
        activitySum += Math.abs(center - row.luma[x - 1 - extendedX0])
        neighborCount++
      }
      if (x + 1 < image.width) {
        activitySum += Math.abs(center - row.luma[x + 1 - extendedX0])
        neighborCount++
      }
      const above = getRow(y - 1)
      if (above) {
        activitySum += Math.abs(center - above.luma[x - extendedX0])
        neighborCount++
      }
      const below = getRow(y + 1)
      if (below) {
        activitySum += Math.abs(center - below.luma[x - extendedX0])
        neighborCount++
      }
      activity.add(neighborCount ? activitySum * 100 / (neighborCount * lumaMaximum) : 0)
    }
    rows.delete(y - 2)
  }
  return {
    acutance: acutance.finalize(),
    activity: activity.finalize(),
  }
}
