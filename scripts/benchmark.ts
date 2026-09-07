import {PNG} from 'pngjs'

import inspectImage from '../src/main.ts'

const width = 512
const height = 512
const makePng = (kind: 'entropy' | 'palette') => {
  const data = Buffer.alloc(width * height * 4)
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4
    if (kind === 'entropy') {
      data[offset] = index & 255
      data[offset + 1] = index >> 8 & 255
      data[offset + 2] = Math.imul(index, 1_103_515_245) >>> 16 & 255
    } else {
      const value = index % 8 * 32
      data[offset] = value
      data[offset + 1] = value * 3 & 255
      data[offset + 2] = 255 - value
    }
    data[offset + 3] = 255
  }
  const image = new PNG({
    width,
    height,
  })
  image.data = data
  return PNG.sync.write(image, {
    colorType: 2,
    inputHasAlpha: true,
  })
}
for (const kind of ['entropy', 'palette'] as const) {
  const bytes = makePng(kind)
  console.info(kind, `${bytes.length} encoded bytes`)
  for (const [label, options] of [
    ['default', {}],
    ['no dominant', {dominantColorAlgorithm: false}],
    [
      'statistics only', {
        dominantColorAlgorithm: false,
        frequentColorsCount: 0,
      },
    ],
  ] as const) {
    const samples: Array<number> = []
    for (let iteration = 0; iteration < 3; iteration++) {
      const started = performance.now()
      inspectImage(bytes, options)
      samples.push(performance.now() - started)
    }
    const sorted = samples.toSorted((left, right) => left - right)
    console.info(`  ${label}: ${sorted[1].toFixed(1)} ms median`, sorted.map(value => Number(value.toFixed(1))))
  }
}
