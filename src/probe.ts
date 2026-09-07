import type {Bracket, Probe} from './types.ts'

const percentages = [0, 1, 3, 8, 15, 30, 70, 85, 92, 97, 99, 100] as const

export const createBrackets = (maximum: number): Array<Bracket> => {
  const boundaries = percentages.map(value => value * maximum / 100)
  return [
    {
      value: 0,
      count: 0,
    },
    ...boundaries.slice(0, -1).map((floor, index) => ({
      value: {
        floor,
        floorInclusive: index !== 0,
        ceiling: boundaries[index + 1],
        ceilingInclusive: false,
      },
      count: 0,
    })),
    {
      value: maximum,
      count: 0,
    },
  ]
}

const bracketIndex = (value: number, maximum: number) => {
  if (value <= 0) {
    return 0
  }
  if (value >= maximum) {
    return 12
  }
  const percentage = value * 100 / maximum
  if (percentage < 1) {
    return 1
  }
  if (percentage < 3) {
    return 2
  }
  if (percentage < 8) {
    return 3
  }
  if (percentage < 15) {
    return 4
  }
  if (percentage < 30) {
    return 5
  }
  if (percentage < 70) {
    return 6
  }
  if (percentage < 85) {
    return 7
  }
  if (percentage < 92) {
    return 8
  }
  if (percentage < 97) {
    return 9
  }
  if (percentage < 99) {
    return 10
  }
  return 11
}

export class ProbeAccumulator {
  protected readonly bracketCounts = new Uint32Array(13)
  protected count = 0
  protected readonly histogram: Uint32Array
  protected maximumSeen = -Infinity
  protected minimum = Infinity
  protected sum = 0

  constructor(readonly rangeMaximum: number, readonly resolution: number) {
    this.histogram = new Uint32Array(Math.round(rangeMaximum * resolution) + 1)
  }

  add(rawValue: number) {
    const value = Math.max(0, Math.min(this.rangeMaximum, rawValue))
    this.minimum = Math.min(this.minimum, value)
    this.maximumSeen = Math.max(this.maximumSeen, value)
    this.sum += value
    this.count++
    this.bracketCounts[bracketIndex(value, this.rangeMaximum)]++
    const bin = Math.max(0, Math.min(this.histogram.length - 1, Math.round(value * this.resolution)))
    this.histogram[bin]++
  }

  protected average() {
    return this.count ? this.sum / this.count : 0
  }

  finalize(): Probe {
    const brackets = createBrackets(this.rangeMaximum)
    for (const [index, bracket] of brackets.entries()) {
      bracket.count = this.bracketCounts[index]
    }
    return {
      minimum: this.count ? this.minimum : 0,
      maximum: this.count ? this.maximumSeen : 0,
      average: this.average(),
      median: this.median(),
      brackets,
    }
  }

  protected median() {
    if (!this.count) {
      return 0
    }
    const left = Math.floor((this.count - 1) / 2)
    const right = Math.floor(this.count / 2)
    return (this.valueAtRank(left) + this.valueAtRank(right)) / 2
  }

  protected valueAtRank(rank: number) {
    let cumulative = 0
    for (let index = 0; index < this.histogram.length; index++) {
      cumulative += this.histogram[index]
      if (cumulative > rank) {
        return index / this.resolution
      }
    }
    return this.rangeMaximum
  }
}

export class HueProbeAccumulator extends ProbeAccumulator {
  private sumCos = 0
  private sumSin = 0

  constructor() {
    super(360, 100)
  }

  override add(value: number) {
    const normalized = (value % 360 + 360) % 360
    super.add(normalized)
    const radians = normalized * Math.PI / 180
    this.sumSin += Math.sin(radians)
    this.sumCos += Math.cos(radians)
  }

  protected override average() {
    if (!this.count) {
      return 0
    }
    if (Math.abs(this.sumSin) < 1e-12 && Math.abs(this.sumCos) < 1e-12) {
      return 0
    }
    const degrees = Math.atan2(this.sumSin, this.sumCos) * 180 / Math.PI
    return degrees < 0 ? degrees + 360 : degrees
  }

  protected override median() {
    if (!this.count) {
      return 0
    }
    const center = this.average()
    const start = Math.round(((center - 180) % 360 + 360) % 360 * this.resolution) % this.histogram.length
    const left = Math.floor((this.count - 1) / 2)
    const right = Math.floor(this.count / 2)
    let cumulative = 0
    let leftValue = 0
    let rightValue = 0
    for (let step = 0; step < this.histogram.length; step++) {
      const index = (start + step) % this.histogram.length
      const amount = this.histogram[index]
      if (!amount) {
        continue
      }
      const next = cumulative + amount
      if (cumulative <= left && left < next) {
        leftValue = index / this.resolution
      }
      if (cumulative <= right && right < next) {
        rightValue = index / this.resolution
        break
      }
      cumulative = next
    }
    const a = leftValue * Math.PI / 180
    const b = rightValue * Math.PI / 180
    const x = Math.cos(a) + Math.cos(b)
    const y = Math.sin(a) + Math.sin(b)
    if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) {
      return leftValue
    }
    const result = Math.atan2(y, x) * 180 / Math.PI
    return result < 0 ? result + 360 : result
  }
}

export const createProbe = (values: Array<{count: number
  value: number}>, maximum: number): Probe => {
  const probe = new ProbeAccumulator(maximum, 100)
  for (const {value, count} of values) {
    for (let index = 0; index < count; index++) {
      probe.add(value)
    }
  }
  return probe.finalize()
}
