import type { ResourceFileInfo } from '@/services/api'

/**
 * Generate a unique file ID from source and filename.
 */
export function makeFileId(source: string, filename: string | null): string {
  return `${source}|${filename ?? ''}`
}

/**
 * Parse a file ID back into source and filename.
 */
export function parseFileId(id: string): { source: string; filename: string } {
  if (!id) return { source: '', filename: '' }
  const sepIndex = id.lastIndexOf('|')
  if (sepIndex === -1) return { source: '', filename: id }
  return { source: id.slice(0, sepIndex), filename: id.slice(sepIndex + 1) }
}

/**
 * Find a file object from a list by its file ID.
 */
export function getFileObjById(
  id: string,
  availableFiles: ResourceFileInfo[]
): ResourceFileInfo | undefined {
  return availableFiles.find((f) => makeFileId(f.source, f.value) === id)
}
