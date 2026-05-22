export function normalizeTemplateList(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(v => String(v)).filter(Boolean)
  if (typeof val === 'string' && val.trim()) return [val.trim()]
  return []
}
