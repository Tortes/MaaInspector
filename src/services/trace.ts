export interface TraceContext {
  traceId: string
  spanId: string
}

const toHex = (buf: Uint8Array) => Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('')

const randomHex = (bytes: number) => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buffer = new Uint8Array(bytes)
    crypto.getRandomValues(buffer)
    return toHex(buffer)
  }
  let hex = ''
  for (let i = 0; i < bytes; i += 1) {
    hex += Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  }
  return hex
}

export const createTraceId = () => {
  if (typeof crypto !== 'undefined' && typeof (crypto as Crypto).randomUUID === 'function') {
    return (crypto as Crypto).randomUUID()
  }
  return randomHex(16)
}

export const createSpanId = () => randomHex(8)

export const createTraceContext = (): TraceContext => ({
  traceId: createTraceId(),
  spanId: createSpanId()
})
