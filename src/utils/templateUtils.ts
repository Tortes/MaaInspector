export function normalizeTemplateList(val: unknown): string[] {
  const normalizePath = (path: unknown) => {
    if (path === null || path === undefined) return null
    const normalized = String(path).trim()
    return normalized ? normalized : null
  }

  if (Array.isArray(val)) {
    return val
      .map(normalizePath)
      .filter((path): path is string => !!path)
  }

  const normalized = normalizePath(val)
  if (normalized) return [normalized]
  return []
}

export function normalizeTemplateValue(val: unknown): string | string[] | undefined {
  const paths = normalizeTemplateList(val)
  if (!paths.length) return undefined
  return Array.isArray(val) ? paths : paths[0]
}
