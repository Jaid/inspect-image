import {expect, test} from 'bun:test'

const {default: inspectImage} = await import('#src/main.ts')

test('should run', () => {
  const result = inspectImage()
  expect(result).toBe('inspect-image') // TODO Test actual functionality
})
