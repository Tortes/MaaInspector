import type { EdgeType } from './flowOptions'
import type { SpacingKey, LayoutAlgorithm, LayoutDirection } from './flowTypes'

export function isEdgeType(value: unknown): value is EdgeType {
  return value === 'smoothstep' || value === 'default'
}

export function isSpacingKey(value: unknown): value is SpacingKey {
  return (
    value === 'very-compact' ||
    value === 'compact' ||
    value === 'normal' ||
    value === 'loose' ||
    value === 'extra-loose'
  )
}

export function isLayoutAlgorithm(value: unknown): value is LayoutAlgorithm {
  return value === 'layered' || value === 'stress' || value === 'mrtree'
}

export function isLayoutDirection(value: unknown): value is LayoutDirection {
  return value === 'TB' || value === 'LR'
}
