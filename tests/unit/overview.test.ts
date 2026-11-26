import assert from 'node:assert/strict'
import test from 'node:test'
import type { ContentCard } from '../../src/lib/content-records.ts'
import { calculateOverview } from '../../src/lib/overview.ts'
import type { Project } from '../../src/lib/project-records.ts'

const now = new Date(2026, 10, 25, 12)
const projects = [
  { id: 'forest', name: 'Лесная редакция', description: '', platforms: [] },
  { id: 'lake', name: 'Озёрная редакция', description: '', platforms: [] },
] satisfies Project[]

function publication(id: string, fields: Partial<ContentCard> = {}): ContentCard {
  return {
    id, projectId: 'forest', title: id, kind: 'Публикация', status: 'В работе', archived: false,
    body: '', format: '', audience: '', dueDate: '', plannedDate: '', publishedDate: '', link: '',
    nextStep: '', ...fields,
  }
}

const cards = [
  publication('late-twice', { dueDate: '2026-11-18', plannedDate: '2026-11-24' }),
  publication('prep-late', { dueDate: '2026-11-24', plannedDate: '2026-11-27' }),
  publication('ready-but-missed', { status: 'Готово', dueDate: '2026-11-21', plannedDate: '2026-11-23' }),
  publication('published', { status: 'Опубликовано', dueDate: '2026-11-19', plannedDate: '2026-11-17', publishedDate: '2026-11-25' }),
  publication('today', { dueDate: '2026-11-25', plannedDate: '2026-11-25' }),
  publication('last-next-day', { plannedDate: '2026-12-01' }),
  publication('outside-next', { plannedDate: '2026-12-02' }),
  publication('archived', { archived: true, dueDate: '2026-11-20', plannedDate: '2026-11-20' }),
  publication('no-dates'),
  publication('other-project', { projectId: 'lake', plannedDate: '2026-11-26' }),
]

test('прошедший период считает одну задачу даже с двумя причинами просрочки', () => {
  const result = calculateOverview(projects, cards, 'past', 'forest', now)
  assert.deepEqual(result.totals, [{
    projectId: 'forest', projectName: 'Лесная редакция', planned: 2, published: 0, overdue: 3,
  }])
  assert.deepEqual(result.overdue.map(({ card, date, reasons }) => [card.id, date, reasons]), [
    ['late-twice', '2026-11-18', ['Прошёл срок подготовки', 'Пропущена дата выхода']],
    ['ready-but-missed', '2026-11-23', ['Пропущена дата выхода']],
    ['prep-late', '2026-11-24', ['Прошёл срок подготовки']],
  ])
  assert.deepEqual(result.upcoming, [])
})

test('будущий период сверяет фактическую дату отдельно от даты плана и включает сегодня', () => {
  const result = calculateOverview(projects, cards, 'next', '', now)
  assert.deepEqual(result.totals, [
    { projectId: 'forest', projectName: 'Лесная редакция', planned: 3, published: 1, overdue: 0 },
    { projectId: 'lake', projectName: 'Озёрная редакция', planned: 1, published: 0, overdue: 0 },
  ])
  assert.deepEqual(result.upcoming.map(({ card }) => card.id), ['today', 'other-project', 'prep-late', 'last-next-day'])
  assert.deepEqual(result.overdue, [])
})

test('пустой набор карточек оставляет нули и пустые списки', () => {
  assert.deepEqual(calculateOverview(projects, [], 'around', 'lake', now), {
    totals: [{ projectId: 'lake', projectName: 'Озёрная редакция', planned: 0, published: 0, overdue: 0 }],
    upcoming: [], overdue: [],
  })
})
