import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { perfNow, perfLog, perfMark } from '../utils/perfTrace'

describe('perfTrace utilities', () => {
  describe('perfNow', () => {
    it('should return a number', () => {
      const result = perfNow()
      expect(typeof result).toBe('number')
    })

    it('should return a positive value', () => {
      const result = perfNow()
      expect(result).toBeGreaterThanOrEqual(0)
    })

    it('should use performance.now when available', () => {
      const mockNow = vi.fn(() => 123.45)
      const originalPerformance = globalThis.performance
      Object.defineProperty(globalThis, 'performance', {
        value: { now: mockNow },
        writable: true,
        configurable: true,
      })
      expect(perfNow()).toBe(123.45)
      expect(mockNow).toHaveBeenCalled()
      Object.defineProperty(globalThis, 'performance', {
        value: originalPerformance,
        writable: true,
        configurable: true,
      })
    })

    it('should fallback to Date.now when performance is undefined', () => {
      const originalPerformance = globalThis.performance
      const originalDateNow = Date.now
      delete (globalThis as Record<string, unknown>).performance
      vi.spyOn(Date, 'now').mockReturnValue(999)
      expect(perfNow()).toBe(999)
      vi.restoreAllMocks()
      Object.defineProperty(globalThis, 'performance', {
        value: originalPerformance,
        writable: true,
        configurable: true,
      })
      Date.now = originalDateNow
    })
  })

  describe('perfLog', () => {
    beforeEach(() => {
      vi.spyOn(console, 'info').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should not log when perf trace is disabled', () => {
      perfLog('test', 0)
      expect(console.info).not.toHaveBeenCalled()
    })

    it('should not log with meta when disabled', () => {
      perfLog('test', 0, { key: 'value' })
      expect(console.info).not.toHaveBeenCalled()
    })
  })

  describe('perfMark', () => {
    beforeEach(() => {
      vi.spyOn(console, 'info').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should not log when perf trace is disabled', () => {
      perfMark('my-mark')
      expect(console.info).not.toHaveBeenCalled()
    })

    it('should not log with meta when disabled', () => {
      perfMark('my-mark', { detail: 'info' })
      expect(console.info).not.toHaveBeenCalled()
    })
  })
})
