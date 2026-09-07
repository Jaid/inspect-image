declare module 'utif2' {
  type Ifd = Record<string, unknown> & {height?: number
    width?: number}
  const UTIF: {
    decode: (data: Uint8Array) => Array<Ifd>
    decodeImage: (data: Uint8Array, ifd: Ifd) => void
    encodeImage: (data: Uint8Array, width: number, height: number) => ArrayBuffer
    toRGBA8: (ifd: Ifd) => Uint8Array
  }
  export default UTIF
}
