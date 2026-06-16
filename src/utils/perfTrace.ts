import { logDebug } from '@/utils/logger'

const PERF_TRACE_KEY = 'maainspector.perfTrace'

const isPerfTraceEnabled = () => {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(PERF_TRACE_KEY) === 'on'
}

export const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export const perfLog = (label: string, start: number, meta?: Record<string, unknown>) => {
  if (!isPerfTraceEnabled()) return
  const duration = Math.round((perfNow() - start) * 10) / 10
  logDebug('perf', `[perf] ${label}: ${duration}ms`, { ...(meta || {}), duration })
}

export const perfMark = (label: string, meta?: Record<string, unknown>) => {
  if (!isPerfTraceEnabled()) return
  logDebug('perf', `[perf] ${label}`, meta || {})
}
