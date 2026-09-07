import type {FileInput, FileResult, ImageInput, Options, Result, SingleFileResult, SingleOptions, SingleResult} from './types.ts'

// eslint-disable-next-line typescript/no-restricted-imports -- Built-in fs avoids a runtime dependency.
import {readFile} from 'node:fs/promises'

import {analyzeImage as analyze, resolveOptions} from './analyze.ts'

export default function inspectImage(input: ImageInput, options?: SingleOptions): SingleResult
export default function inspectImage(input: ImageInput, options: Options): Result
export default function inspectImage(input: ImageInput, options: Options = {}): Result {
  return analyze(input, options)
}

export function analyzeImage(input: ImageInput, options?: SingleOptions): SingleResult
export function analyzeImage(input: ImageInput, options: Options): Result
export function analyzeImage(input: ImageInput, options: Options = {}): Result {
  return analyze(input, options)
}

export function inspectImageFile(file: FileInput, options?: SingleOptions): Promise<SingleFileResult>
export function inspectImageFile(file: FileInput, options: Options): Promise<FileResult>
export async function inspectImageFile(file: FileInput, options: Options = {}): Promise<FileResult> {
  resolveOptions(options)
  const bytes = file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : await readFile(file)
  return {
    ...analyze(bytes, options),
    fileSize: bytes.byteLength,
  }
}

export const analyzeImageFile = inspectImageFile
export type * from './types.ts'
