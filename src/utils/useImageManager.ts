import { reactive } from 'vue'
import type { TemplateImage, ImageDataPayload } from './flowTypes'

interface NodeImageState {
  images: TemplateImage[]
  tempImages: TemplateImage[]
  delImages: TemplateImage[]
}

export function useImageManager() {
  const imageCache = reactive(new Map<string, string>())
  const nodeImageStates = new Map<string, NodeImageState>()

  function ensureNodeState(nodeId: string): NodeImageState {
    if (!nodeImageStates.has(nodeId)) {
      nodeImageStates.set(nodeId, {
        images: [],
        tempImages: [],
        delImages: []
      })
    }
    return nodeImageStates.get(nodeId)!
  }

  const getImageBase64 = (path: string): string | undefined => {
    return imageCache.get(path)
  }

  const setImageCache = (path: string, base64: string) => {
    imageCache.set(path, base64)
  }

  const batchSetImageCache = (entries: Array<{ path: string; base64: string }>) => {
    entries.forEach(({ path, base64 }) => {
      if (path && base64) {
        imageCache.set(path, base64)
      }
    })
  }

  const setNodeImages = (nodeId: string, images: TemplateImage[]) => {
    const state = ensureNodeState(nodeId)
    state.images = images
    images.forEach(img => {
      if (img.path && img.base64) {
        imageCache.set(img.path, img.base64)
      }
    })
  }

  const getNodeImages = (nodeId: string): TemplateImage[] => {
    const state = nodeImageStates.get(nodeId)
    return state ? [...state.images, ...state.tempImages] : []
  }

  const getNodeSavedImages = (nodeId: string): TemplateImage[] => {
    const state = nodeImageStates.get(nodeId)
    return state ? [...state.images] : []
  }

  const getNodeTempImages = (nodeId: string): TemplateImage[] => {
    const state = nodeImageStates.get(nodeId)
    return state ? [...state.tempImages] : []
  }

  const getNodeDeletedImages = (nodeId: string): TemplateImage[] => {
    const state = nodeImageStates.get(nodeId)
    return state ? [...state.delImages] : []
  }

  const addTempImage = (nodeId: string, path: string, base64: string) => {
    const state = ensureNodeState(nodeId)
    const existing = state.tempImages.find(img => img.path === path)
    if (!existing) {
      state.tempImages.push({ path, base64, found: true })
    }
    imageCache.set(path, base64)
  }

  const deleteImage = (nodeId: string, path: string) => {
    const state = ensureNodeState(nodeId)

    const savedIdx = state.images.findIndex(img => img.path === path)
    if (savedIdx >= 0) {
      const removed = state.images.splice(savedIdx, 1)[0]
      state.delImages.push(removed)
      return
    }

    const tempIdx = state.tempImages.findIndex(img => img.path === path)
    if (tempIdx >= 0) {
      state.tempImages.splice(tempIdx, 1)
    }
  }

  const restoreImage = (nodeId: string, path: string) => {
    const state = ensureNodeState(nodeId)
    const delIdx = state.delImages.findIndex(img => img.path === path)
    if (delIdx >= 0) {
      const restored = state.delImages.splice(delIdx, 1)[0]
      state.images.push(restored)
    }
  }

  const getImageData = (): ImageDataPayload => {
    const delImages: ImageDataPayload['delImages'] = []
    const tempImages: ImageDataPayload['tempImages'] = []

    nodeImageStates.forEach((state, nodeId) => {
      state.delImages.forEach(img => {
        if (img.path) {
          delImages.push({ path: img.path, nodeId })
        }
      })
      state.tempImages.forEach(img => {
        if (img.path && img.base64) {
          tempImages.push({ path: img.path, base64: img.base64, nodeId })
        }
      })
    })

    return { delImages, tempImages }
  }

  const clearTempImageData = () => {
    nodeImageStates.forEach((state) => {
      if (state.tempImages.length > 0) {
        state.images.push(...state.tempImages)
        state.tempImages = []
      }
      state.delImages = []
    })
  }

  const clearNodeState = (nodeId: string) => {
    nodeImageStates.delete(nodeId)
  }

  const clearAll = () => {
    nodeImageStates.clear()
    imageCache.clear()
  }

  const exportState = () => ({
    imageCache: Array.from(imageCache.entries()),
    nodeImageStates: Array.from(nodeImageStates.entries()).map(([nodeId, state]) => [
      nodeId,
      {
        images: JSON.parse(JSON.stringify(state.images)) as TemplateImage[],
        tempImages: JSON.parse(JSON.stringify(state.tempImages)) as TemplateImage[],
        delImages: JSON.parse(JSON.stringify(state.delImages)) as TemplateImage[]
      }
    ] as const)
  })

  const restoreState = (snapshot?: {
    imageCache?: Array<[string, string]>
    nodeImageStates?: Array<readonly [string, NodeImageState]>
  }) => {
    clearAll()
    if (!snapshot) return

    snapshot.imageCache?.forEach(([path, base64]) => {
      if (path && base64) imageCache.set(path, base64)
    })
    snapshot.nodeImageStates?.forEach(([nodeId, state]) => {
      nodeImageStates.set(nodeId, {
        images: JSON.parse(JSON.stringify(state.images || [])) as TemplateImage[],
        tempImages: JSON.parse(JSON.stringify(state.tempImages || [])) as TemplateImage[],
        delImages: JSON.parse(JSON.stringify(state.delImages || [])) as TemplateImage[]
      })
    })
  }

  const getImagePaths = (nodeId: string): string[] => {
    const state = nodeImageStates.get(nodeId)
    if (!state) return []
    return [...state.images, ...state.tempImages]
      .map(img => img.path)
      .filter(Boolean) as string[]
  }

  const getImagesForDisplay = (nodeId: string, templatePaths: string[]): TemplateImage[] => {
    const allImages = getNodeImages(nodeId)
    return allImages
      .filter(img => img.found && img.base64 && img.path && templatePaths.includes(img.path))
      .slice(0, 16)
  }

  const getImagesForDisplayWithCache = (nodeId: string, templatePaths: string[]): TemplateImage[] => {
    const state = nodeImageStates.get(nodeId)
    if (!state) {
      return templatePaths
        .filter(path => imageCache.has(path))
        .map(path => ({ path, base64: imageCache.get(path), found: true }))
        .slice(0, 16)
    }

    const result: TemplateImage[] = []

    for (const path of templatePaths) {
      if (result.length >= 16) break

      const stateImg = [...state.images, ...state.tempImages].find(img => img.path === path)
      if (stateImg && stateImg.base64) {
        result.push(stateImg)
        continue
      }

      const cachedBase64 = imageCache.get(path)
      if (cachedBase64) {
        result.push({ path, base64: cachedBase64, found: true })
      }
    }

    return result
  }

  const hasTemplateChanged = (nodeId: string): boolean => {
    const state = nodeImageStates.get(nodeId)
    if (!state) return false
    return state.tempImages.length > 0 || state.delImages.length > 0
  }

  return {
    imageCache,
    getImageBase64,
    setImageCache,
    batchSetImageCache,
    setNodeImages,
    getNodeImages,
    getNodeSavedImages,
    getNodeTempImages,
    getNodeDeletedImages,
    addTempImage,
    deleteImage,
    restoreImage,
    getImageData,
    clearTempImageData,
    clearNodeState,
    clearAll,
    getImagePaths,
    getImagesForDisplay,
    getImagesForDisplayWithCache,
    hasTemplateChanged,
    exportState,
    restoreState
  }
}
