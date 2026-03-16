import type { RequestContext } from './requestTypes'

export interface RequestLogEntry {
  id: string
  traceId?: string
  method: string
  url: string
  status?: number
  ok: boolean
  durationMs: number
  context?: RequestContext
  error?: string
  timestamp: number
}

const MAX_LOG = 200
const entries: RequestLogEntry[] = []

export const addRequestLogEntry = (entry: RequestLogEntry) => {
  entries.unshift(entry)
  if (entries.length > MAX_LOG) {
    entries.length = MAX_LOG
  }
}

export const getRequestLogEntries = () => entries.slice()
