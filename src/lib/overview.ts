import type { ContentCard } from './content-records.ts'
import type { Project } from './project-records.ts'
import { dateKey } from './dates.ts'

export const overviewPeriods = [
  { id: 'around', label: '7 дней до и после сегодня', from: -7, to: 7 },
  { id: 'past', label: 'Последние 7 дней', from: -7, to: -1 },
  { id: 'next', label: 'Ближайшие 7 дней', from: 0, to: 6 },
] as const
export type OverviewPeriod = typeof overviewPeriods[number]['id']
export type OverviewTask = { card: ContentCard; project: Project; date: string; reasons: string[] }
export type Overview = {
  totals: { projectId: string; projectName: string; planned: number; published: number; overdue: number }[]
  upcoming: OverviewTask[]
  overdue: OverviewTask[]
}

export function calculateOverview(
  projects: Project[], cards: ContentCard[], periodId: OverviewPeriod, projectId: string, now: Date,
): Overview {
  const period = overviewPeriods.find(item => item.id === periodId) ?? overviewPeriods[0]
  const today = dateKey(now, 0)
  const from = dateKey(now, period.from)
  const to = dateKey(now, period.to)
  const inRange = (value: string) => value >= from && value <= to
  const overview: Overview = { totals: [], upcoming: [], overdue: [] }
  for (const project of projects.filter(item => !projectId || item.id === projectId)) {
    const totals = { projectId: project.id, projectName: project.name, planned: 0, published: 0, overdue: 0 }
    for (const card of cards.filter(item => item.projectId === project.id && !item.archived)) {
      const publication = card.kind === 'Публикация'
      const published = card.status === 'Опубликовано'
      if (publication && inRange(card.plannedDate)) totals.planned += 1
      if (publication && published && inRange(card.publishedDate)) totals.published += 1
      if (publication && !published && card.plannedDate >= today && inRange(card.plannedDate)) {
        overview.upcoming.push({ card, project, date: card.plannedDate, reasons: [] })
      }
      const latePreparation = !published && card.status !== 'Готово' && inRange(card.dueDate) && card.dueDate < today
      const latePublication = publication && !published && inRange(card.plannedDate) && card.plannedDate < today
      if (latePreparation || latePublication) {
        totals.overdue += 1
        const reasons = [
          ...(latePreparation ? ['Прошёл срок подготовки'] : []),
          ...(latePublication ? ['Пропущена дата выхода'] : []),
        ]
        const date = latePreparation && latePublication
          ? [card.dueDate, card.plannedDate].sort()[0]
          : latePreparation ? card.dueDate : card.plannedDate
        overview.overdue.push({ card, project, date, reasons })
      }
    }
    overview.totals.push(totals)
  }
  const byDate = (a: OverviewTask, b: OverviewTask) => a.date.localeCompare(b.date)
  return { ...overview, upcoming: overview.upcoming.sort(byDate), overdue: overview.overdue.sort(byDate) }
}
