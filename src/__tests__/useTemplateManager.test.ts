import { describe, expect, it, vi } from 'vitest'
import { useImageManager } from '@/composables/useImageManager'
import { handleSpecialAction } from '@/composables/flowGraph/useTemplateManager'
import type { FlowNode } from '@/utils/flowTypes'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn((path: string) => `tauri://localhost${path}`)
}))

describe('useTemplateManager', () => {
  it('keeps new temp images in pending changes and node template when validPaths is omitted', () => {
    const imageManager = useImageManager()
    const node = {
      id: 'Start',
      position: { x: 0, y: 0 },
      data: {
        id: 'Start',
        type: 'TemplateMatch',
        data: {
          id: 'Start',
          recognition: 'TemplateMatch',
          template: []
        }
      }
    } as FlowNode

    handleSpecialAction(
      node,
      {
        _action: 'save_image_changes',
        images: [],
        tempImages: [{ path: 'new.png', base64: 'base64data', url: 'base64data' }],
        deletedImages: []
      },
      imageManager
    )

    expect(node.data?.data?.template).toEqual(['new.png'])
    expect(imageManager.getPendingImageChanges().tempImages).toEqual([
      { path: 'new.png', base64: 'base64data', nodeId: 'Start' }
    ])
  })

  it('removes template when image changes leave no valid paths', () => {
    const imageManager = useImageManager()
    const node = {
      id: 'Start',
      position: { x: 0, y: 0 },
      data: {
        id: 'Start',
        type: 'TemplateMatch',
        data: {
          id: 'Start',
          recognition: 'TemplateMatch',
          template: ['']
        }
      }
    } as FlowNode

    handleSpecialAction(
      node,
      {
        _action: 'save_image_changes',
        validPaths: ['', '   '],
        images: [],
        tempImages: [],
        deletedImages: []
      },
      imageManager
    )

    expect(node.data?.data?.template).toBeUndefined()
  })
})
