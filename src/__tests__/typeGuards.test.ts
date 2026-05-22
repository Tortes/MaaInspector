import { describe, it, expect } from 'vitest'
import { isEdgeType, isSpacingKey, isLayoutAlgorithm, isLayoutDirection } from '../utils/typeGuards'

describe('type guards', () => {
  describe('isEdgeType', () => {
    it('should return true for valid edge types', () => {
      expect(isEdgeType('smoothstep')).toBe(true)
      expect(isEdgeType('default')).toBe(true)
    })

    it('should return false for invalid edge types', () => {
      expect(isEdgeType('invalid')).toBe(false)
      expect(isEdgeType('straight')).toBe(false)
      expect(isEdgeType('')).toBe(false)
    })

    it('should return false for non-string values', () => {
      expect(isEdgeType(null)).toBe(false)
      expect(isEdgeType(undefined)).toBe(false)
      expect(isEdgeType(123)).toBe(false)
      expect(isEdgeType({})).toBe(false)
    })
  })

  describe('isSpacingKey', () => {
    it('should return true for valid spacing keys', () => {
      expect(isSpacingKey('very-compact')).toBe(true)
      expect(isSpacingKey('compact')).toBe(true)
      expect(isSpacingKey('normal')).toBe(true)
      expect(isSpacingKey('loose')).toBe(true)
      expect(isSpacingKey('extra-loose')).toBe(true)
    })

    it('should return false for invalid spacing keys', () => {
      expect(isSpacingKey('invalid')).toBe(false)
      expect(isSpacingKey('')).toBe(false)
      expect(isSpacingKey('tight')).toBe(false)
    })

    it('should return false for non-string values', () => {
      expect(isSpacingKey(null)).toBe(false)
      expect(isSpacingKey(undefined)).toBe(false)
      expect(isSpacingKey(123)).toBe(false)
    })
  })

  describe('isLayoutAlgorithm', () => {
    it('should return true for valid layout algorithms', () => {
      expect(isLayoutAlgorithm('layered')).toBe(true)
      expect(isLayoutAlgorithm('stress')).toBe(true)
      expect(isLayoutAlgorithm('mrtree')).toBe(true)
    })

    it('should return false for invalid layout algorithms', () => {
      expect(isLayoutAlgorithm('invalid')).toBe(false)
      expect(isLayoutAlgorithm('')).toBe(false)
      expect(isLayoutAlgorithm('grid')).toBe(false)
    })

    it('should return false for non-string values', () => {
      expect(isLayoutAlgorithm(null)).toBe(false)
      expect(isLayoutAlgorithm(undefined)).toBe(false)
      expect(isLayoutAlgorithm(123)).toBe(false)
    })
  })

  describe('isLayoutDirection', () => {
    it('should return true for valid layout directions', () => {
      expect(isLayoutDirection('TB')).toBe(true)
      expect(isLayoutDirection('LR')).toBe(true)
    })

    it('should return false for invalid layout directions', () => {
      expect(isLayoutDirection('invalid')).toBe(false)
      expect(isLayoutDirection('')).toBe(false)
      expect(isLayoutDirection('RL')).toBe(false)
      expect(isLayoutDirection('BT')).toBe(false)
    })

    it('should return false for non-string values', () => {
      expect(isLayoutDirection(null)).toBe(false)
      expect(isLayoutDirection(undefined)).toBe(false)
      expect(isLayoutDirection(123)).toBe(false)
    })
  })
})
