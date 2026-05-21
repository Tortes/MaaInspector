import { reactive } from 'vue'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { TemplateImage, ImageDataPayload } from './flowTypes'

interface NodeImageState {
  images: TemplateImage[]
  tempImages: TemplateImage[]
  delImages: TemplateImage[]
}

export function useImageManager() {
  const imageUrlCache = reactive(new Map<string, string>())
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

  const getImageUrl = (fullPath: string): string | undefined => {
    if (!fullPath) return undefined
    if (!imageUrlCache.has(fullPath)) {
      const url = convertFileSrc(fullPath)
      console.log('[DEBUG getImageUrl] fullPath:', fullPath, '-> url:', url)
      imageUrlCache.set(fullPath, url)
    }
    return imageUrlCache.get(fullPath)
  }

  const setNodeImages = (nodeId: string, images: TemplateImage[]) => {
    const state = ensureNodeState(nodeId)
    const enriched = images.map(img => ({
      ...img,
      url: img.fullPath ? getImageUrl(img.fullPath) : img.url
    }))
    state.images = enriched
    enriched.forEach(img => {
      if (img.fullPath && img.url) {
        imageUrlCache.set(img.fullPath, img.url)
      }
    })
    console.log('[DEBUG setNodeImages] nodeId:', nodeId, 'count:', enriched.length, 'first url:', enriched[0]?.url, 'first fullPath:', enriched[0]?.fullPath)
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

  const addTempImage = (nodeId: string, path: string, fullPath?: string, base64?: string) => {
    const state = ensureNodeState(nodeId)
    const existing = state.tempImages.find(img => img.path === path)
    if (!existing) {
      const url = fullPath ? getImageUrl(fullPath) : undefined
      state.tempImages.push({ path, fullPath, url, base64, found: true })
    } else if (fullPath) {
      existing.fullPath = fullPath
      existing.url = getImageUrl(fullPath)
    }
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
    imageUrlCache.clear()
  }

  const exportState = () => ({
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

    snapshot.nodeImageStates?.forEach(([nodeId, state]) => {
      const images = JSON.parse(JSON.stringify(state.images || [])) as TemplateImage[]
      const tempImages = JSON.parse(JSON.stringify(state.tempImages || [])) as TemplateImage[]
      const delImages = JSON.parse(JSON.stringify(state.delImages || [])) as TemplateImage[]

      const enrichImages = (imgs: TemplateImage[]) => imgs.map(img => ({
        ...img,
        url: img.fullPath ? getImageUrl(img.fullPath) : img.url
      }))

      nodeImageStates.set(nodeId, {
        images: enrichImages(images),
        tempImages: enrichImages(tempImages),
        delImages: enrichImages(delImages)
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
      .filter(img => img.found && img.path && templatePaths.includes(img.path))
      .slice(0, 16)
  }

  const getImagesForDisplayWithCache = (nodeId: string, templatePaths: string[]): TemplateImage[] => {
    const state = nodeImageStates.get(nodeId)
    if (!state) {
      console.log('[DEBUG getImagesForDisplayWithCache] NO STATE for nodeId:', nodeId, 'templatePaths:', templatePaths)
      return []
    }

    const result: TemplateImage[] = []

    for (const path of templatePaths) {
      if (result.length >= 16) break

      const stateImg = [...state.images, ...state.tempImages].find(img => img.path === path)
      if (stateImg && stateImg.url) {
        result.push(stateImg)
        continue
      }
    }

    console.log('[DEBUG getImagesForDisplayWithCache] nodeId:', nodeId, 'templatePaths:', templatePaths, 'state.images count:', state.images.length, 'result count:', result.length, 'result urls:', result.map(r => r.url))
    return result
  }

  const hasTemplateChanged = (nodeId: string): boolean => {
    const state = nodeImageStates.get(nodeId)
    if (!state) return false
    return state.tempImages.length > 0 || state.delImages.length > 0
  }

  return {
    imageUrlCache,
    getImageUrl,
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
