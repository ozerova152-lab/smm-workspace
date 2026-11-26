import { validProjects } from '../project-records'
import { measurementError, measurementKey, validReferenceUrl, type AnalyticsSnapshot, type Measurement } from '../analytics'
import { validCards, type ContentCard } from '../content-records'
import type { Project } from '../project-records'

export type WorkspaceBackup = {
  format: 'smm-workspace'
  version: 1
  projects: Project[]
  cards: ContentCard[]
  analytics: AnalyticsSnapshot
}

const invalid = () => new Error('Файл не подходит. Выберите копию SMM Workspace')
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const strings = (row: Record<string, unknown>, fields: string[]) => fields.every(key => typeof row[key] === 'string')
const unique = (values: string[]) => new Set(values).size === values.length

export function parseBackup(text: string): WorkspaceBackup {
  let value: unknown
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { throw invalid() }
  if (!object(value) || value.format !== 'smm-workspace' || value.version !== 1 ||
    !validProjects(value.projects) || !validCards(value.cards, value.projects)) throw invalid()
  assertValidAnalytics(value.analytics, value.projects, value.cards)
  return { format: 'smm-workspace', version: 1, projects: value.projects, cards: value.cards, analytics: value.analytics }
}

export function assertValidAnalytics(value: unknown, projects: Project[], plan: ContentCard[]): asserts value is AnalyticsSnapshot {
  if (!object(value)) throw invalid()
  const platformProjects = new Map(projects.flatMap(project => project.platforms.map(platform => [platform.id, project.id] as const)))
  const projectIds = new Set(projects.map(project => project.id))
  const cards = new Map(plan.map(card => [card.id, card]))
  const { measurements, references, notes } = value
  if (!Array.isArray(measurements) || !Array.isArray(references) || !Array.isArray(notes)) throw invalid()
  const keys = new Set<string>()
  for (const row of measurements) {
    if (!object(row) || !strings(row, ['platformId', 'publicationId', 'metric', 'from', 'to', 'source']) ||
      !platformProjects.has(row.platformId as string) || typeof row.value !== 'number' ||
      (row.unit !== undefined && typeof row.unit !== 'string') || (row.window !== undefined && typeof row.window !== 'string')) throw invalid()
    const item = row as unknown as Measurement
    const publication = cards.get(item.publicationId)
    const key = measurementKey(item)
    if (measurementError(item) || keys.has(key) || (item.publicationId && (!publication || publication.kind !== 'Публикация' ||
      publication.projectId !== platformProjects.get(item.platformId)))) throw invalid()
    keys.add(key)
  }
  const referencePlatforms: string[] = []
  for (const pair of references) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !platformProjects.has(pair[0]) || !Array.isArray(pair[1])) throw invalid()
    referencePlatforms.push(pair[0])
    const ids: string[] = []
    for (const item of pair[1]) {
      if (!object(item) || !strings(item, ['id', 'url', 'note']) || !validReferenceUrl(item.url as string)) throw invalid()
      ids.push(item.id as string)
    }
    if (!unique(ids)) throw invalid()
  }
  const noteProjects: string[] = []
  for (const pair of notes) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !projectIds.has(pair[0]) || !object(pair[1]) ||
      !strings(pair[1], ['goal', 'audience', 'hypothesis', 'period'])) throw invalid()
    noteProjects.push(pair[0])
  }
  if (!unique(referencePlatforms) || !unique(noteProjects)) throw invalid()
}

export function backupSummary(backup: WorkspaceBackup) {
  return { projects: backup.projects.length, cards: backup.cards.length, measurements: backup.analytics.measurements.length }
}
