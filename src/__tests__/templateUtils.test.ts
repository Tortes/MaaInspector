import { describe, it, expect } from 'vitest'
import { normalizeTemplateList, normalizeTemplateValue } from '@/utils/templateUtils'

describe('normalizeTemplateList', () => {
  it('should return empty array for null', () => {
    expect(normalizeTemplateList(null)).toEqual([])
  })

  it('should return empty array for undefined', () => {
    expect(normalizeTemplateList(undefined)).toEqual([])
  })

  it('should return empty array for empty string', () => {
    expect(normalizeTemplateList('')).toEqual([])
  })

  it('should return empty array for whitespace-only string', () => {
    expect(normalizeTemplateList('   ')).toEqual([])
  })

  it('should trim and wrap a single string', () => {
    expect(normalizeTemplateList('  my-template  ')).toEqual(['my-template'])
  })

  it('should convert a valid string to single-item array', () => {
    expect(normalizeTemplateList('template1')).toEqual(['template1'])
  })

  it('should convert array of strings to filtered array', () => {
    expect(normalizeTemplateList(['a', 'b', '', '  '])).toEqual(['a', 'b'])
  })

  it('should convert non-string array items to strings', () => {
    expect(normalizeTemplateList([1, true, null])).toEqual(['1', 'true'])
  })

  it('should return empty array for empty array input', () => {
    expect(normalizeTemplateList([])).toEqual([])
  })

  it('should handle array with only falsy values', () => {
    expect(normalizeTemplateList(['', null, undefined, 0])).toEqual(['0'])
  })

  it('should collapse an empty template value to undefined', () => {
    expect(normalizeTemplateValue(['', null, '   '])).toBeUndefined()
  })

  it('should preserve array shape for array template values', () => {
    expect(normalizeTemplateValue([' a.png ', '', 'b.png'])).toEqual(['a.png', 'b.png'])
  })

  it('should return a string for a single string template value', () => {
    expect(normalizeTemplateValue(' a.png ')).toBe('a.png')
  })
})
