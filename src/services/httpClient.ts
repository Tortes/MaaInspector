import type { RequestContext } from './requestTypes'
import { addRequestLogEntry } from './requestLog'
import { createTraceContext } from './trace'

export interface RequestOptions extends RequestInit {
  timeoutMs?: number
  context?: RequestContext
  parseJson?: boolean
}

export class ApiError extends Error {
  status?: number
  traceId?: string
  url?: string
  body?: unknown
}

const normalizeUrl = (baseUrl: string, endpoint: string) => {
  if (/^https?:\/\//i.test(endpoint)) return endpoint
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${base}${path}`
}

const attachAbortSignal = (controller: AbortController, signal?: AbortSignal | null) => {
  if (!signal) return
  if (signal.aborted) {
    controller.abort()
    return
  }
  signal.addEventListener('abort', () => controller.abort(), { once: true })
}

export const createHttpClient = (baseUrl: string) => {
  const request = async <T>(endpoint: string, options: RequestOptions = {}): Promise<T> => {
    const {
      timeoutMs,
      context,
      parseJson = true,
      headers: requestHeaders,
      signal,
      ...fetchOptions
    } = options
    const trace = createTraceContext()
    const url = normalizeUrl(baseUrl, endpoint)
    const headers = new Headers(requestHeaders || {})
    if (options.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    headers.set('X-Trace-Id', trace.traceId)
    headers.set('X-Span-Id', trace.spanId)

    const controller = new AbortController()
    attachAbortSignal(controller, signal)
    const requestTimeoutMs = timeoutMs ?? (endpoint.includes('search') ? 60_000 : 10_000)
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs)
    const startedAt = Date.now()

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal
      })
      const durationMs = Date.now() - startedAt
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        const error = new ApiError(text || response.statusText)
        error.status = response.status
        error.traceId = trace.traceId
        error.url = url
        error.body = text
        throw error
      }
      const data = parseJson ? (await response.json()) as T : (response as unknown as T)
      addRequestLogEntry({
        id: `${trace.traceId}:${trace.spanId}`,
        traceId: trace.traceId,
        method: (fetchOptions.method || 'GET').toUpperCase(),
        url,
        status: response.status,
        ok: true,
        durationMs,
        context,
        timestamp: Date.now()
      })
      return data
    } catch (err: unknown) {
      const durationMs = Date.now() - startedAt
      const message = err instanceof Error ? err.message : String(err)
      const status = err instanceof ApiError ? err.status : undefined
      addRequestLogEntry({
        id: `${trace.traceId}:${trace.spanId}`,
        traceId: trace.traceId,
        method: (fetchOptions.method || 'GET').toUpperCase(),
        url,
        status,
        ok: false,
        durationMs,
        context,
        error: message,
        timestamp: Date.now()
      })
      throw err
    } finally {
      clearTimeout(timeoutId)
    }
  }

  return { request }
}
