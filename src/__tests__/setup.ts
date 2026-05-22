import { vi, beforeAll, afterAll } from 'vitest'

// Global test setup
beforeAll(() => {
  // Suppress console output during tests unless explicitly testing it
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterAll(() => {
  vi.restoreAllMocks()
})
