export type MetricDefinition = { name: string; unit: string; window: string }

export function metricDefinitions(platform?: PlatformDraft): MetricDefinition[] {
  return platform?.metrics.map(name => platform.metricDetails?.find(item => item.name === name) ?? { name, unit: '', window: '' }) ?? []
}

export type PlatformDraft = {
  name: string
  formats: string[]
  metrics: string[]
  metricDetails?: MetricDefinition[]
  checklist: string[]
}

export type Platform = PlatformDraft & { id: string; projectId: string }
export type Project = { id: string; name: string; description: string; platforms: Platform[] }
export type ProjectDraft = Pick<Project, 'name' | 'description'>

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
function validMetricDetails(value: unknown, names: string[]) {
  if (value === undefined) return true
  if (!Array.isArray(value)) return false
  const seen = new Set<string>()
  for (const item of value) {
    if (!record(item) || typeof item.name !== 'string' || !names.includes(item.name) || seen.has(item.name) ||
      typeof item.unit !== 'string' || typeof item.window !== 'string') return false
    seen.add(item.name)
  }
  return true
}

const strings = (value: unknown): value is string[] => Array.isArray(value) && Array.from(value).every(item => typeof item === 'string')

export function validProjects(value: unknown): value is Project[] {
  if (!Array.isArray(value)) return false
  const projectIds = new Set<string>()
  const platformIds = new Set<string>()
  for (const project of value) {
    if (!record(project) || typeof project.id !== 'string' || !project.id || projectIds.has(project.id) ||
      typeof project.name !== 'string' || typeof project.description !== 'string' || !Array.isArray(project.platforms)) return false
    projectIds.add(project.id)
    for (const platform of project.platforms) {
      if (!record(platform) || typeof platform.id !== 'string' || !platform.id || platformIds.has(platform.id) ||
        platform.projectId !== project.id || typeof platform.name !== 'string' ||
        !strings(platform.formats) || !strings(platform.metrics) || !validMetricDetails(platform.metricDetails, platform.metrics) || !strings(platform.checklist)) return false
      platformIds.add(platform.id)
    }
  }
  return true
}
