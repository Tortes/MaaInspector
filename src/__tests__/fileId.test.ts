import { describe, it, expect } from 'vitest'
import { makeFileId, parseFileId, getFileObjById } from '@/utils/fileId'
import type { ResourceFileInfo } from '@/services/api'

describe('fileId utilities', () => {
  describe('makeFileId', () => {
    it('should create unique file ID with source and filename', () => {
      expect(makeFileId('local', 'test.json')).toBe('local|test.json')
    })

    it('should handle null filename', () => {
      expect(makeFileId('local', null)).toBe('local|')
    })

    it('should handle empty source', () => {
      expect(makeFileId('', 'test.json')).toBe('|test.json')
    })

    it('should handle both empty', () => {
      expect(makeFileId('', null)).toBe('|')
    })

    it('should handle filename with pipe character', () => {
      expect(makeFileId('local', 'test|file.json')).toBe('local|test|file.json')
    })
  })

  describe('parseFileId', () => {
    it('should parse file ID back to source and filename', () => {
      const result = parseFileId('local|test.json')
      expect(result).toEqual({ source: 'local', filename: 'test.json' })
    })

    it('should handle empty string', () => {
      const result = parseFileId('')
      expect(result).toEqual({ source: '', filename: '' })
    })

    it('should handle ID without separator', () => {
      const result = parseFileId('nosource')
      expect(result).toEqual({ source: '', filename: 'nosource' })
    })

    it('should split at last pipe character', () => {
      const result = parseFileId('local|test|file.json')
      expect(result).toEqual({ source: 'local|test', filename: 'file.json' })
    })

    it('should handle empty filename', () => {
      const result = parseFileId('local|')
      expect(result).toEqual({ source: 'local', filename: '' })
    })

    it('should handle empty source', () => {
      const result = parseFileId('|test.json')
      expect(result).toEqual({ source: '', filename: 'test.json' })
    })
  })

  describe('getFileObjById', () => {
    const mockFiles: ResourceFileInfo[] = [
      { source: 'local', value: 'a.json', label: 'a', filename: 'a.json' },
      { source: 'remote', value: 'b.json', label: 'b', filename: 'b.json' },
      { source: 'local', value: 'c.json', label: 'c', filename: 'c.json' }
    ]

    it('should find file by ID', () => {
      const result = getFileObjById('local|a.json', mockFiles)
      expect(result).toMatchObject({ source: 'local', value: 'a.json' })
    })

    it('should return undefined for non-existent ID', () => {
      const result = getFileObjById('nonexistent|d.json', mockFiles)
      expect(result).toBeUndefined()
    })

    it('should return the first match when multiple files have same source', () => {
      const result = getFileObjById('local|c.json', mockFiles)
      expect(result).toMatchObject({ source: 'local', value: 'c.json' })
    })

    it('should handle empty file list', () => {
      const result = getFileObjById('local|a.json', [])
      expect(result).toBeUndefined()
    })
  })
})
