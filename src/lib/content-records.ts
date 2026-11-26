import type { Project } from './project-records.ts'
import { validDate } from './dates.ts'

export const cardStatuses = ['Идея', 'В работе', 'На проверке', 'Готово', 'Опубликовано'] as const
export const materialKinds = ['Сценарий', 'Раскадровка', 'Обложка'] as const
export type CardStatus = typeof cardStatuses[number]
export type CardKind = 'Идея' | 'Публикация' | typeof materialKinds[number]
export type CardDraft = {
  kind: CardKind
  title: string
  body: string
  status: CardStatus
  platformId?: string
  parentId?: string
  format: string
  audience: string
  dueDate: string
  plannedDate: string
  publishedDate: string
  link: string
  externalId?: string
  nextStep: string
}
export type ContentCard = CardDraft & { id: string; projectId: string; archived: boolean }
export type ContentTemplate = { id: string; name: string; body: string }
export function newCard(kind: CardKind, fields: Partial<CardDraft> = {}): CardDraft {
  return { kind, title: '', body: '', status: 'Идея', format: '', audience: '', dueDate: '', plannedDate: '', publishedDate: '', link: '', nextStep: '', ...fields }
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const strings = (row: Record<string, unknown>, fields: string[]) => fields.every(key => typeof row[key] === 'string')

export function validCards(value: unknown, projects: Project[]): value is ContentCard[] {
  if (!Array.isArray(value)) return false
  const projectIds = new Set<string>()
  const platformProjects = new Map<string, string>()
  for (const project of projects) {
    projectIds.add(project.id)
    for (const platform of project.platforms) {
      platformProjects.set(platform.id, project.id)
    }
  }
  const cards = new Map<string, ContentCard>()
  for (const card of value) {
    if (!object(card) || !strings(card, ['id', 'projectId', 'title', 'body', 'format', 'audience', 'dueDate', 'plannedDate', 'publishedDate', 'link', 'nextStep']) ||
      !card.id || cards.has(card.id as string) || !projectIds.has(card.projectId as string) || typeof card.archived !== 'boolean' ||
      !['Идея', 'Публикация', ...materialKinds].some(kind => kind === card.kind) || !cardStatuses.some(status => status === card.status) ||
      !['dueDate', 'plannedDate', 'publishedDate'].every(key => card[key] === '' || validDate(card[key] as string)) ||
      (card.platformId !== undefined && (typeof card.platformId !== 'string' || platformProjects.get(card.platformId) !== card.projectId)) ||
      (card.externalId !== undefined && typeof card.externalId !== 'string') ||
      (card.parentId !== undefined && typeof card.parentId !== 'string')) return false
    cards.set(card.id as string, card as unknown as ContentCard)
  }
  for (const card of cards.values()) {
    if (!card.parentId) continue
    const parent = cards.get(card.parentId)
    const parentKind = card.kind === 'Публикация' ? 'Идея' : 'Публикация'
    if (!parent || parent.id === card.id || parent.projectId !== card.projectId || parent.kind !== parentKind || card.kind === 'Идея') return false
  }
  return true
}

export function platformIdeas(cards: ContentCard[], platformId: string) {
  const linkedIdeas = new Set(cards
    .filter(card => card.kind === 'Публикация' && card.platformId === platformId && !card.archived)
    .map(card => card.parentId))
  return cards.filter(card => card.kind === 'Идея' && !card.archived &&
    (card.platformId === platformId || linkedIdeas.has(card.id)))
}
