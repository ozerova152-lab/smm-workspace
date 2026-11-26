import type { Project } from '../project-records'
import type { ContentCard } from '../content-records'
import type { AnalyticsAccess } from '../project-storage'
import { mergeMeasurements, validReferenceUrl, type Measurement, type StrategyNote } from '../analytics'

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function scoped(projects: Project[], cards: ContentCard[], projectId: string, platformId: string) {
  if (!projects.some(project => project.id === projectId && project.platforms.some(platform => platform.id === platformId))) {
    throw new Error('Unknown platform')
  }
  return cards.filter(card => card.projectId === projectId && card.platformId === platformId && card.kind === 'Публикация')
}

export function createAnalyticsActions(access: AnalyticsAccess, scenario: string | null) {
  let reads = 0
  let saves = 0

  return {
    async readAnalytics(projectId: string, platformId: string) {
      const first = ++reads === 1
      await wait(scenario === 'analytics-loading' && first ? 1600 : 140)
      if (scenario === 'analytics-error' && first) throw new Error('test analytics read')
      const { projects, cards, analytics } = await access.readWorkspace()
      const history = scoped(projects, cards, projectId, platformId)
      return {
        publications: history.filter(card => card.status === 'Опубликовано' && !card.archived),
        history,
        measurements: analytics.measurements.filter(item => item.platformId === platformId),
        references: analytics.references.find(([id]) => id === platformId)?.[1] ?? [],
      }
    },
    async writeMeasurements(projectId: string, platformId: string, selected: Measurement[], replace: boolean) {
      const first = ++saves === 1
      await wait(240)
      await access.updateAnalytics(({ projects, cards, analytics }) => {
        const publications = scoped(projects, cards, projectId, platformId).filter(card => card.status === 'Опубликовано' && !card.archived)
        const measurements = mergeMeasurements(analytics.measurements, selected, platformId, publications, replace)
        return { ...analytics, measurements }
      }, scenario === 'metrics-error' && first)
    },
    async readCardMeasurements(projectId: string, cardId: string) {
      const { cards, analytics } = await access.readWorkspace()
      if (!cards.some(card => card.id === cardId && card.projectId === projectId && card.kind === 'Публикация')) {
        throw new Error('Unknown publication')
      }
      return analytics.measurements.filter(item => item.publicationId === cardId)
    },
    async addReference(projectId: string, platformId: string, url: string, note: string) {
      if (!validReferenceUrl(url)) throw new Error('Invalid reference URL')
      const reference = { id: crypto.randomUUID(), url, note }
      await access.updateAnalytics(({ projects, cards, analytics }) => {
        scoped(projects, cards, projectId, platformId)
        const references = new Map(analytics.references)
        references.set(platformId, [...(references.get(platformId) ?? []), reference])
        return { ...analytics, references: [...references] }
      })
      return reference
    },
    async readStrategy(projectId: string) {
      const { analytics } = await access.readWorkspace()
      return analytics.notes.find(([id]) => id === projectId)?.[1]
    },
    async writeStrategy(projectId: string, note: StrategyNote) {
      await access.updateAnalytics(({ projects, analytics }) => {
        if (!projects.some(item => item.id === projectId)) throw new Error('Unknown project')
        const notes = new Map(analytics.notes)
        notes.set(projectId, note)
        return { ...analytics, notes: [...notes] }
      })
    },
  }
}
