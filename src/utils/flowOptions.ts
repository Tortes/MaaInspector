import type { Component } from 'vue'
import { Activity, Move, ArrowDown, ArrowRight, Layers, Network, GitBranch } from 'lucide-vue-next'
import type { SpacingKey, LayoutAlgorithm, LayoutDirection } from './flowTypes'

export interface OptionItem<TValue = string> {
  label: string
  value: TValue
  icon?: Component
}

export type EdgeType = 'smoothstep' | 'default'

export const EDGE_TYPE_OPTIONS: OptionItem<EdgeType>[] = [
  { label: '直角连线 (Step)', value: 'smoothstep', icon: Activity },
  { label: '贝塞尔曲线 (Bezier)', value: 'default', icon: Activity }
]

export const SPACING_OPTIONS: Record<SpacingKey, { nodeSpacing: number; edgeSpacing: number }> = {
  'very-compact': { nodeSpacing: 40, edgeSpacing: 60 },
  'compact': { nodeSpacing: 80, edgeSpacing: 100 },
  'normal': { nodeSpacing: 120, edgeSpacing: 150 },
  'loose': { nodeSpacing: 200, edgeSpacing: 250 },
  'extra-loose': { nodeSpacing: 300, edgeSpacing: 350 }
}

export const SPACING_TYPE_OPTIONS: OptionItem<SpacingKey>[] = [
  { label: '非常紧凑', value: 'very-compact', icon: Move },
  { label: '紧凑', value: 'compact', icon: Move },
  { label: '默认', value: 'normal', icon: Move },
  { label: '宽松', value: 'loose', icon: Move },
  { label: '非常宽松', value: 'extra-loose', icon: Move }
]

export const LAYOUT_ALGORITHM_OPTIONS: OptionItem<LayoutAlgorithm>[] = [
  { label: '分层布局', value: 'layered', icon: Layers },
  { label: '应力布局', value: 'stress', icon: Network },
  { label: '树形布局', value: 'mrtree', icon: GitBranch }
]

export const LAYOUT_DIRECTION_OPTIONS: OptionItem<LayoutDirection>[] = [
  { label: '上→下', value: 'TB', icon: ArrowDown },
  { label: '左→右', value: 'LR', icon: ArrowRight }
]
