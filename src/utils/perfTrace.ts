const PERF_TRACE_KEY = 'maainspector.perfTrace'

const isPerfTraceEnabled = () => false

export const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export const perfLog = (label: string, start: number, meta?: Record<string, unknown>) => {
  if (!isPerfTraceEnabled()) return
  const duration = Math.round((perfNow() - start) * 10) / 10
  console.info(`[perf] ${label}: ${duration}ms`, meta || '')
}

export const perfMark = (label: string, meta?: Record<string, unknown>) => {
  if (!isPerfTraceEnabled()) return
  console.info(`[perf] ${label}`, meta || '')
}
