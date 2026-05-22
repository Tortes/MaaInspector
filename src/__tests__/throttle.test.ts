import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce, throttle, createThrottledHandler } from '../utils/throttle'

describe('throttle utilities', () => {
  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should delay function execution', () => {
      const fn = vi.fn()
      const debounced = debounce(fn, 100)
      debounced()
      expect(fn).not.toBeCalled()
      vi.advanceTimersByTime(100)
      expect(fn).toBeCalledTimes(1)
    })

    it('should reset timer on subsequent calls', () => {
      const fn = vi.fn()
      const debounced = debounce(fn, 100)
      debounced()
      vi.advanceTimersByTime(50)
      debounced()
      vi.advanceTimersByTime(50)
      expect(fn).not.toBeCalled()
      vi.advanceTimersByTime(50)
      expect(fn).toBeCalledTimes(1)
    })

    it('should pass arguments to the debounced function', () => {
      const fn = vi.fn()
      const debounced = debounce(fn, 100)
      debounced('test', 123)
      vi.advanceTimersByTime(100)
      expect(fn).toBeCalledWith('test', 123)
    })

    it('should only execute once with multiple rapid calls', () => {
      const fn = vi.fn()
      const debounced = debounce(fn, 100)
      debounced()
      debounced()
      debounced()
      vi.advanceTimersByTime(100)
      expect(fn).toBeCalledTimes(1)
    })
  })

  describe('throttle', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should execute immediately on first call', () => {
      const fn = vi.fn()
      const throttled = throttle(fn, 100)
      throttled()
      expect(fn).toBeCalledTimes(1)
    })

    it('should limit function calls within throttle period', () => {
      const fn = vi.fn()
      const throttled = throttle(fn, 100)
      throttled()
      throttled()
      throttled()
      expect(fn).toBeCalledTimes(1)
    })

    it('should allow calls after throttle period expires', () => {
      const fn = vi.fn()
      const throttled = throttle(fn, 100)
      throttled()
      vi.advanceTimersByTime(100)
      throttled()
      expect(fn).toBeCalledTimes(2)
    })

    it('should pass arguments to the throttled function', () => {
      const fn = vi.fn()
      const throttled = throttle(fn, 100)
      throttled('test', 456)
      expect(fn).toBeCalledWith('test', 456)
    })
  })

  describe('createThrottledHandler', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should create a handler with flush and clear methods', () => {
      const { handler, flush, clear, getQueueSize } = createThrottledHandler(vi.fn())
      expect(typeof handler).toBe('function')
      expect(typeof flush).toBe('function')
      expect(typeof clear).toBe('function')
      expect(typeof getQueueSize).toBe('function')
    })

    it('should queue first call when time is at zero with fake timers', () => {
      const callback = vi.fn()
      const { handler, getQueueSize } = createThrottledHandler(callback, { throttleMs: 100 })
      handler({ id: 1 })
      expect(getQueueSize()).toBe(1)
      expect(callback).toBeCalledTimes(0)
    })

    it('should execute callback after throttle period passes with flush', () => {
      const callback = vi.fn()
      const { handler, flush } = createThrottledHandler(callback, { throttleMs: 100 })
      vi.advanceTimersByTime(200)
      handler({ id: 1 })
      flush()
      expect(callback).toBeCalledTimes(1)
      expect(callback.mock.calls[0][0]).toEqual({ id: 1 })
    })

    it('should queue events during throttle period', () => {
      const callback = vi.fn()
      const { handler, getQueueSize } = createThrottledHandler(callback, { throttleMs: 100 })
      handler({ id: 1 })
      vi.advanceTimersByTime(50)
      handler({ id: 2 })
      handler({ id: 3 })
      expect(getQueueSize()).toBe(2)
    })

    it('should flush remaining queued events', () => {
      const callback = vi.fn()
      const { handler, flush } = createThrottledHandler(callback, { throttleMs: 100 })
      handler({ id: 1 })
      vi.advanceTimersByTime(50)
      handler({ id: 2 })
      flush()
      expect(callback).toBeCalledTimes(2)
    })

    it('should clear queued events without executing', () => {
      const callback = vi.fn()
      const { handler, clear } = createThrottledHandler(callback, { throttleMs: 100 })
      handler({ id: 1 })
      vi.advanceTimersByTime(50)
      handler({ id: 2 })
      clear()
      expect(callback).toBeCalledTimes(1)
    })

    it('should return queue size', () => {
      const callback = vi.fn()
      const { handler, getQueueSize } = createThrottledHandler(callback, { throttleMs: 100 })
      handler({ id: 1 })
      vi.advanceTimersByTime(50)
      handler({ id: 2 })
      handler({ id: 3 })
      expect(getQueueSize()).toBe(2)
    })

    it('should use default options when not provided', () => {
      const callback = vi.fn()
      const { handler, getQueueSize } = createThrottledHandler(callback)
      handler({ id: 1 })
      vi.advanceTimersByTime(25)
      handler({ id: 2 })
      expect(getQueueSize()).toBe(1)
    })

    it('should work with enableBatch disabled after throttle period', () => {
      const callback = vi.fn()
      const { handler } = createThrottledHandler(callback, { throttleMs: 100, enableBatch: false })
      vi.advanceTimersByTime(200)
      handler({ id: 1 })
      vi.advanceTimersByTime(200)
      handler({ id: 2 })
      expect(callback).toBeCalledTimes(2)
    })
  })
})
