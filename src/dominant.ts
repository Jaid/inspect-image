import type {ColorConverter} from './color.ts'
import type {DominantColorAlgorithm, HslColor} from './types.ts'

type Lab = [number, number, number]
type Bucket = {alphaSum: number
  blueSum: number
  count: number
  greenSum: number
  redSum: number}
type Point = {count: number
  index: number
  lab: Lab
  opacity?: number}

const srgbToLinear = (value: number) => {
  const normalized = value / 255
  return normalized <= 0.040_45 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}
const linearToSrgb = (value: number) => {
  const normalized = value <= 0.003_130_8 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, normalized * 255))
}
const rgbToOklab = (red: number, green: number, blue: number): Lab => {
  const r = srgbToLinear(red)
  const g = srgbToLinear(green)
  const b = srgbToLinear(blue)
  const l = 0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b
  const m = 0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b
  const s = 0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b
  const lRoot = Math.cbrt(l)
  const mRoot = Math.cbrt(m)
  const sRoot = Math.cbrt(s)
  return [
    0.210_454_255_3 * lRoot + 0.793_617_785 * mRoot - 0.004_072_046_8 * sRoot,
    1.977_998_495_1 * lRoot - 2.428_592_205 * mRoot + 0.450_593_709_9 * sRoot,
    0.025_904_037_1 * lRoot + 0.782_771_766_2 * mRoot - 0.808_675_766 * sRoot,
  ]
}
const oklabToRgb = ([lightness, a, b]: Lab): [number, number, number] => {
  const lRoot = lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b
  const mRoot = lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b
  const sRoot = lightness - 0.089_484_177_5 * a - 1.291_485_548 * b
  const l = lRoot ** 3
  const m = mRoot ** 3
  const s = sRoot ** 3
  const r = 4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s
  const g = -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s
  const blue = -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(blue)]
}
const distance = (left: Lab, right: Lab) => (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2 + (left[2] - right[2]) ** 2
const weightedMean = (points: Array<Point>, indices: Array<number>): Lab => {
  let total = 0
  const mean: Lab = [0, 0, 0]
  for (const index of indices) {
    const point = points[index]
    total += point.count
    const ratio = point.count / total
    mean[0] += (point.lab[0] - mean[0]) * ratio
    mean[1] += (point.lab[1] - mean[1]) * ratio
    mean[2] += (point.lab[2] - mean[2]) * ratio
  }
  return mean
}
const clusterOpacity = (points: Array<Point>, indices: Array<number>) => {
  let weighted = 0
  let total = 0
  for (const index of indices) {
    const point = points[index]
    if (point.opacity === undefined) {
      continue
    }
    weighted += point.opacity * point.count
    total += point.count
  }
  return total ? weighted / total : undefined
}
const kMeans = (points: Array<Point>, clusterCount: number) => {
  let first = 0
  for (let index = 1; index < points.length; index++) {
    if (points[index].count > points[first].count) {
      first = index
    }
  }
  const centers: Array<Lab> = [points[first].lab]
  const seeded = new Set([first])
  while (centers.length < Math.min(clusterCount, points.length)) {
    let best = -1
    let bestScore = -1
    for (const [index, point] of points.entries()) {
      if (seeded.has(index)) {
        continue
      }
      let nearest = Infinity
      for (const center of centers) {
        nearest = Math.min(nearest, distance(point.lab, center))
      }
      const score = nearest * point.count
      if (score > bestScore) {
        best = index
        bestScore = score
      }
    }
    if (best < 0 || bestScore <= 0) {
      break
    }
    seeded.add(best)
    centers.push(points[best].lab)
  }
  const assignments = new Int16Array(points.length).fill(-1)
  for (let iteration = 0; iteration < 32; iteration++) {
    let changed = false
    const sums = centers.map(() => ({
      weight: 0,
      lab: [0, 0, 0] as Lab,
    }))
    for (const [index, point] of points.entries()) {
      let best = 0
      let bestDistance = distance(point.lab, centers[0])
      for (let center = 1; center < centers.length; center++) {
        const candidate = distance(point.lab, centers[center])
        if (candidate < bestDistance) {
          best = center
          bestDistance = candidate
        }
      }
      if (assignments[index] !== best) {
        assignments[index] = best
        changed = true
      }
      const target = sums[best]
      const nextWeight = target.weight + point.count
      const ratio = point.count / nextWeight
      target.lab[0] += (point.lab[0] - target.lab[0]) * ratio
      target.lab[1] += (point.lab[1] - target.lab[1]) * ratio
      target.lab[2] += (point.lab[2] - target.lab[2]) * ratio
      target.weight = nextWeight
    }
    for (let center = 0; center < centers.length; center++) {
      if (sums[center].weight) {
        centers[center] = sums[center].lab
      }
    }
    if (!changed) {
      break
    }
  }
  const clusters = centers.map((): Array<number> => [])
  for (const [index, assignment] of assignments.entries()) {
    clusters[assignment].push(index)
  }
  return clusters.filter(cluster => cluster.length)
}

type Box = {axis: 0 | 1 | 2
  first: number
  indices: Array<number>
  range: number}
const makeBox = (points: Array<Point>, indices: Array<number>): Box => {
  let axis: 0 | 1 | 2 = 0
  let widest = -1
  for (const candidate of [0, 1, 2] as const) {
    let minimum = Infinity
    let maximum = -Infinity
    for (const index of indices) {
      minimum = Math.min(minimum, points[index].lab[candidate])
      maximum = Math.max(maximum, points[index].lab[candidate])
    }
    if (maximum - minimum > widest) {
      widest = maximum - minimum
      axis = candidate
    }
  }
  return {
    indices,
    axis,
    range: widest,
    first: Math.min(...indices.map(index => points[index].index)),
  }
}
const medianCut = (points: Array<Point>, clusterCount: number) => {
  const boxes = [makeBox(points, points.map((_, index) => index))]
  while (boxes.length < Math.min(clusterCount, points.length)) {
    let best = -1
    for (let index = 0; index < boxes.length; index++) {
      if (boxes[index].indices.length < 2 || boxes[index].range <= 0) {
        continue
      }
      if (best < 0 || boxes[index].range > boxes[best].range || boxes[index].range === boxes[best].range && boxes[index].first < boxes[best].first) {
        best = index
      }
    }
    if (best < 0) {
      break
    }
    const box = boxes[best]
    const sorted = box.indices.toSorted((left, right) => points[left].lab[box.axis] - points[right].lab[box.axis] || points[left].index - points[right].index)
    const total = sorted.reduce((sum, index) => sum + points[index].count, 0)
    let cumulative = 0
    let split = 1
    let imbalance = Infinity
    for (let index = 1; index < sorted.length; index++) {
      cumulative += points[sorted[index - 1]].count
      if (points[sorted[index - 1]].lab[box.axis] === points[sorted[index]].lab[box.axis]) {
        continue
      }
      const candidate = Math.abs(cumulative - total / 2)
      if (candidate < imbalance) {
        imbalance = candidate
        split = index
      }
    }
    boxes.splice(best, 1, makeBox(points, sorted.slice(0, split)), makeBox(points, sorted.slice(split)))
  }
  return boxes.map(box => box.indices)
}

export class DominantAccumulator {
  private readonly buckets = new Map<number, Bucket>
  constructor(private readonly hasAlpha: boolean) {}

  add(red: number, green: number, blue: number, alpha = 255) {
    const key = red >> 3 << 10 | green >> 3 << 5 | blue >> 3
    const bucket = this.buckets.get(key)
    if (bucket) {
      bucket.count++
      bucket.redSum += red
      bucket.greenSum += green
      bucket.blueSum += blue
      bucket.alphaSum += alpha
    } else {
      this.buckets.set(key, {
        count: 1,
        redSum: red,
        greenSum: green,
        blueSum: blue,
        alphaSum: alpha,
      })
    }
  }

  finish(algorithm: Exclude<DominantColorAlgorithm, false>, clusters: number, converter: ColorConverter): HslColor | undefined {
    if (!this.buckets.size) {
      return undefined
    }
    const points: Array<Point> = [...this.buckets.values()].map((bucket, index) => {
      const red = bucket.redSum / bucket.count
      const green = bucket.greenSum / bucket.count
      const blue = bucket.blueSum / bucket.count
      return {
        lab: rgbToOklab(red, green, blue),
        count: bucket.count,
        index,
        ...this.hasAlpha ? {opacity: bucket.alphaSum * 100 / (255 * bucket.count)} : {},
      }
    })
    const groups = algorithm === 'k_means' ? kMeans(points, clusters) : medianCut(points, clusters)
    let winner = groups[0]
    let winnerPopulation = winner.reduce((sum, index) => sum + points[index].count, 0)
    for (const group of groups.slice(1)) {
      const population = group.reduce((sum, index) => sum + points[index].count, 0)
      if (population > winnerPopulation) {
        winner = group
        winnerPopulation = population
      }
    }
    const center = weightedMean(points, winner)
    const [red, green, blue] = oklabToRgb(center)
    const result = {...converter.convert(red, green, blue).color}
    const opacity = clusterOpacity(points, winner)
    if (opacity !== undefined) {
      result.opacity = opacity
    }
    return result
  }
}
