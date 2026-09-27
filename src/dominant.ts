import type {ColorConverter} from './color.ts'
import type {DominantColorAlgorithm, HslColor} from './types.ts'

type Lab = [number, number, number]
type Bucket = {
  alphaSum: number
  blueSum: number
  count: number
  greenSum: number
  redSum: number
}
type Point = {
  count: number
  index: number
  lab: Lab
  opacity?: number
}

const srgbToLinear = (value: number) => {
  const normalized = value / 255
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}
const linearToSrgb = (value: number) => {
  const normalized = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, normalized * 255))
}
const rgbToOklab = (red: number, green: number, blue: number): Lab => {
  const r = srgbToLinear(red)
  const g = srgbToLinear(green)
  const b = srgbToLinear(blue)
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const lRoot = Math.cbrt(l)
  const mRoot = Math.cbrt(m)
  const sRoot = Math.cbrt(s)
  return [
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  ]
}
const oklabToRgb = ([lightness, a, b]: Lab): [number, number, number] => {
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b
  const l = lRoot ** 3
  const m = mRoot ** 3
  const s = sRoot ** 3
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
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
      if (!(score > bestScore)) {
        continue
      }
      best = index
      bestScore = score
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
        if (!(candidate < bestDistance)) {
          continue
        }
        best = center
        bestDistance = candidate
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

type Box = {
  axis: 0 | 1 | 2
  first: number
  indices: Array<number>
  range: number
}
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
    if (!(maximum - minimum > widest)) {
      continue
    }
    widest = maximum - minimum
    axis = candidate
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
      if (!(candidate < imbalance)) {
        continue
      }
      imbalance = candidate
      split = index
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
      if (!(population > winnerPopulation)) {
        continue
      }
      winner = group
      winnerPopulation = population
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
