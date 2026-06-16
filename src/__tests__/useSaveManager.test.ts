import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { useSaveManager, type SaveManagerDeps } from '@/composables/useSaveManager'
import { resourceApi } from '@/services/api'

vi.mock('@/services/api', () => ({
  resourceApi: {
    checkUnusedImages: vi.fn(),
    processImages: vi.fn(),
    saveFileNodes: vi.fn()
  }
}))

const createDeps = (overrides: Partial<SaveManagerDeps> = {}): SaveManagerDeps => ({
  currentEdgeType: ref('smoothstep'),
  currentSpacing: ref('normal'),
  currentAlgorithm: ref('layered'),
  currentDirection: ref('TB'),
  currentFilename: ref('pipeline.json'),
  currentSource: ref('D:/maa'),
  isDirty: ref(true),
  exportState: vi.fn(),
  restoreState: vi.fn(),
  getNodesData: vi.fn(() => ({ Start: { recognition: 'DirectHit' } })),
  getImageData: vi.fn(() => ({
    delImages: [{ path: 'old.png', nodeId: 'Start' }],
    tempImages: [{ path: 'new.png', base64: 'base64data', nodeId: 'Start' }]
  })),
  clearTempImageData: vi.fn(),
  clearDirty: vi.fn(),
  imageManager: {
    setNodeImages: vi.fn(),
    replaceLoadedImages: vi.fn()
  },
  ...overrides
})

describe('useSaveManager', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('does not save nodes or commit image changes when image processing fails', async () => {
    const deps = createDeps()
    vi.mocked(resourceApi.checkUnusedImages).mockResolvedValue({ unused_images: [] })
    vi.mocked(resourceApi.processImages).mockRejectedValue(new Error('image failed'))
    vi.mocked(resourceApi.saveFileNodes).mockResolvedValue({ success: true })

    const manager = useSaveManager(deps)

    await expect(manager.handleSaveNodes({ source: 'D:/maa', filename: 'pipeline.json' }, vi.fn()))
      .rejects.toThrow('image failed')

    expect(resourceApi.processImages).toHaveBeenCalledWith(
      'D:/maa',
      [],
      [{ path: 'new.png', base64: 'base64data', nodeId: 'Start' }]
    )
    expect(resourceApi.saveFileNodes).not.toHaveBeenCalled()
    expect(deps.clearTempImageData).not.toHaveBeenCalled()
    expect(deps.clearDirty).not.toHaveBeenCalled()
  })

  it('replaces loaded images as one file-scoped image map', () => {
    const deps = createDeps()
    const manager = useSaveManager(deps)

    manager.handleLoadImages({
      Start: [{ path: 'a.png' }],
      Invalid: [{ noPath: true }]
    })

    expect(deps.imageManager.replaceLoadedImages).toHaveBeenCalledWith({
      Start: [{ path: 'a.png' }]
    })
  })
})
