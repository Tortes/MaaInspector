import { describe, it, expect } from 'vitest'
import { toPipelineV2Node, toPipelineV1Node, isPipelineV2Node, isPipelineV2Nodes, toPipelineV2Nodes, toPipelineV1Nodes } from '@/utils/pipelineTransform'
import type { FlowBusinessData } from '@/utils/flowTypes'

describe('pipelineTransform', () => {
  describe('toPipelineV2Node', () => {
    it('should convert V1 recognition to V2 format', () => {
      const v1Node: FlowBusinessData = {
        recognition: 'TemplateMatch',
        template: 'test.png',
        roi: [0, 0, 100, 100],
        threshold: 0.8
      }
      const result = toPipelineV2Node(v1Node)
      expect(result.recognition).toEqual({
        type: 'TemplateMatch',
        param: {
          template: 'test.png',
          roi: [0, 0, 100, 100],
          threshold: 0.8
        }
      })
    })

    it('should convert V1 action to V2 format', () => {
      const v1Node: FlowBusinessData = {
        action: 'ClickSelf',
        target: [100, 200],
        duration: 100
      }
      const result = toPipelineV2Node(v1Node)
      expect(result.action).toEqual({
        type: 'ClickSelf',
        param: {
          target: [100, 200],
          duration: 100
        }
      })
    })

    it('should convert V1 And composite to V2 format', () => {
      const v1Node: FlowBusinessData = {
        recognition: 'And',
        all_of: [
          { recognition: 'TemplateMatch', template: 'a.png' },
          { recognition: 'OCR', expected: 'hello' }
        ]
      } as FlowBusinessData
      const result = toPipelineV2Node(v1Node)
      expect((result.recognition as any).type).toBe('And')
      const allOf = (result.recognition as any).param.all_of
      expect(allOf).toHaveLength(2)
      expect(allOf[0].recognition).toEqual({ type: 'TemplateMatch', param: { template: 'a.png' } })
      expect(allOf[1].recognition).toEqual({ type: 'OCR', param: { expected: 'hello' } })
    })

    it('should convert V1 Or composite to V2 format', () => {
      const v1Node: FlowBusinessData = {
        recognition: 'Or',
        any_of: [
          { recognition: 'TemplateMatch', template: 'a.png' },
          { recognition: 'TemplateMatch', template: 'b.png' }
        ]
      } as FlowBusinessData
      const result = toPipelineV2Node(v1Node)
      expect((result.recognition as any).type).toBe('Or')
      const anyOf = (result.recognition as any).param.any_of
      expect(anyOf).toHaveLength(2)
    })

    it('should keep V2 format unchanged', () => {
      const v2Node = {
        recognition: { type: 'TemplateMatch', param: { template: 'test.png' } },
        action: { type: 'ClickSelf' }
      } as unknown as FlowBusinessData
      const result = toPipelineV2Node(v2Node)
      expect(result.recognition).toEqual({ type: 'TemplateMatch', param: { template: 'test.png' } })
      expect(result.action).toEqual({ type: 'ClickSelf' })
    })

    it('should merge V1 params into existing V2 param', () => {
      const node = {
        recognition: { type: 'TemplateMatch', param: { template: 'v2.png' } },
        roi: [0, 0, 50, 50],
        threshold: 0.9
      } as unknown as FlowBusinessData
      const result = toPipelineV2Node(node)
      expect((result.recognition as any).param.template).toBe('v2.png')
      expect((result.recognition as any).param.roi).toEqual([0, 0, 50, 50])
      expect((result.recognition as any).param.threshold).toBe(0.9)
    })

    it('should remove V1 param keys from root after conversion', () => {
      const v1Node: FlowBusinessData = {
        recognition: 'TemplateMatch',
        template: 'test.png',
        roi: [0, 0, 100, 100]
      }
      const result = toPipelineV2Node(v1Node)
      expect(result.template).toBeUndefined()
      expect(result.roi).toBeUndefined()
    })

    it('should handle node without recognition or action', () => {
      const node: FlowBusinessData = {
        next: ['node2'],
        timeout_next: ['node3']
      }
      const result = toPipelineV2Node(node)
      expect(result.recognition).toBeUndefined()
      expect(result.action).toBeUndefined()
      expect(result.next).toEqual(['node2'])
    })

    it('should keep empty recognition type as-is on root', () => {
      const node: FlowBusinessData = {
        recognition: '',
        template: 'test.png'
      }
      const result = toPipelineV2Node(node)
      expect(result.recognition).toBe('')
    })

    it('should omit empty template params when converting to V2', () => {
      const result = toPipelineV2Node({
        recognition: 'TemplateMatch',
        template: [' ', '']
      } as FlowBusinessData)

      expect(result.recognition).toEqual({ type: 'TemplateMatch' })
      expect(result.template).toBeUndefined()
    })
  })

  describe('toPipelineV1Node', () => {
    it('should convert V2 recognition to V1 format', () => {
      const v2Node = {
        recognition: { type: 'TemplateMatch', param: { template: 'test.png', roi: [0, 0, 100, 100] } }
      } as unknown as FlowBusinessData
      const result = toPipelineV1Node(v2Node)
      expect(result.recognition).toBe('TemplateMatch')
      expect(result.template).toBe('test.png')
      expect(result.roi).toEqual([0, 0, 100, 100])
    })

    it('should convert V2 action to V1 format', () => {
      const v2Node = {
        action: { type: 'ClickSelf', param: { target: [100, 200], duration: 100 } }
      } as unknown as FlowBusinessData
      const result = toPipelineV1Node(v2Node)
      expect(result.action).toBe('ClickSelf')
      expect(result.target).toEqual([100, 200])
      expect(result.duration).toBe(100)
    })

    it('should convert V2 And composite to V1 format', () => {
      const v2Node = {
        recognition: {
          type: 'And',
          param: {
            all_of: [
              { recognition: { type: 'TemplateMatch', param: { template: 'a.png' } } },
              { recognition: { type: 'OCR', param: { expected: 'hello' } } }
            ]
          }
        }
      } as unknown as FlowBusinessData
      const result = toPipelineV1Node(v2Node)
      expect(result.recognition).toBe('And')
      const allOf = result.all_of as any[]
      expect(allOf).toHaveLength(2)
      expect(allOf[0].recognition).toBe('TemplateMatch')
      expect(allOf[0].template).toBe('a.png')
      expect(allOf[1].recognition).toBe('OCR')
      expect(allOf[1].expected).toBe('hello')
    })

    it('should convert V2 Or composite to V1 format', () => {
      const v2Node = {
        recognition: {
          type: 'Or',
          param: {
            any_of: [
              { recognition: { type: 'TemplateMatch', param: { template: 'a.png' } } }
            ]
          }
        }
      } as unknown as FlowBusinessData
      const result = toPipelineV1Node(v2Node)
      expect(result.recognition).toBe('Or')
      expect(result.any_of).toBeDefined()
    })

    it('should keep V1 format unchanged', () => {
      const v1Node: FlowBusinessData = {
        recognition: 'TemplateMatch',
        template: 'test.png'
      }
      const result = toPipelineV1Node(v1Node)
      expect(result.recognition).toBe('TemplateMatch')
      expect(result.template).toBe('test.png')
    })

    it('should not overwrite existing root keys with param values', () => {
      const v2Node = {
        recognition: { type: 'TemplateMatch', param: { template: 'v2.png' } },
        template: 'v1.png'
      } as unknown as FlowBusinessData
      const result = toPipelineV1Node(v2Node)
      expect(result.template).toBe('v1.png')
    })

    it('should handle node without recognition or action', () => {
      const node: FlowBusinessData = {
        next: ['node2']
      }
      const result = toPipelineV1Node(node)
      expect(result.recognition).toBeUndefined()
      expect(result.action).toBeUndefined()
      expect(result.next).toEqual(['node2'])
    })

    it('should omit empty template params when converting to V1', () => {
      const result = toPipelineV1Node({
        recognition: { type: 'TemplateMatch', param: { template: [' ', ''] } }
      } as unknown as FlowBusinessData)

      expect(result.recognition).toBe('TemplateMatch')
      expect(result.template).toBeUndefined()
    })
  })

  describe('isPipelineV2Node', () => {
    it('should return true for V2 recognition', () => {
      const node = {
        recognition: { type: 'TemplateMatch', param: {} }
      }
      expect(isPipelineV2Node(node)).toBe(true)
    })

    it('should return true for V2 action', () => {
      const node = {
        action: { type: 'ClickSelf' }
      }
      expect(isPipelineV2Node(node)).toBe(true)
    })

    it('should return false for V1 format', () => {
      const node = {
        recognition: 'TemplateMatch',
        action: 'ClickSelf'
      }
      expect(isPipelineV2Node(node)).toBe(false)
    })

    it('should return false for empty node', () => {
      expect(isPipelineV2Node({})).toBe(false)
    })

    it('should return false when type is not a string', () => {
      const node = {
        recognition: { type: 123, param: {} }
      }
      expect(isPipelineV2Node(node)).toBe(false)
    })
  })

  describe('isPipelineV2Nodes', () => {
    it('should return true if any node is V2', () => {
      const nodes = {
        node1: { recognition: 'TemplateMatch' },
        node2: { recognition: { type: 'OCR', param: {} } }
      }
      expect(isPipelineV2Nodes(nodes as any)).toBe(true)
    })

    it('should return false if all nodes are V1', () => {
      const nodes = {
        node1: { recognition: 'TemplateMatch' },
        node2: { recognition: 'OCR' }
      }
      expect(isPipelineV2Nodes(nodes as any)).toBe(false)
    })

    it('should handle empty nodes', () => {
      expect(isPipelineV2Nodes({})).toBe(false)
    })

    it('should handle null/undefined nodes', () => {
      expect(isPipelineV2Nodes(null as any)).toBe(false)
    })
  })

  describe('toPipelineV2Nodes', () => {
    it('should convert all nodes to V2', () => {
      const nodes: Record<string, FlowBusinessData> = {
        node1: { recognition: 'TemplateMatch', template: 'a.png' },
        node2: { recognition: 'OCR', expected: 'hello' }
      }
      const result = toPipelineV2Nodes(nodes)
      expect((result.node1.recognition as any).type).toBe('TemplateMatch')
      expect((result.node2.recognition as any).type).toBe('OCR')
    })

    it('should handle empty nodes', () => {
      expect(toPipelineV2Nodes({})).toEqual({})
    })
  })

  describe('toPipelineV1Nodes', () => {
    it('should convert all nodes to V1', () => {
      const nodes: Record<string, FlowBusinessData> = {
        node1: { recognition: { type: 'TemplateMatch', param: { template: 'a.png' } } } as unknown as FlowBusinessData,
        node2: { recognition: { type: 'OCR', param: { expected: 'hello' } } } as unknown as FlowBusinessData
      }
      const result = toPipelineV1Nodes(nodes)
      expect(result.node1.recognition).toBe('TemplateMatch')
      expect(result.node1.template).toBe('a.png')
      expect(result.node2.recognition).toBe('OCR')
      expect(result.node2.expected).toBe('hello')
    })

    it('should handle empty nodes', () => {
      expect(toPipelineV1Nodes({})).toEqual({})
    })
  })
})
