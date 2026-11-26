import type { Platform, PlatformDraft, Project, ProjectDraft } from '../project-records'
import type { AnalyticsAccess, ProjectStorage } from '../project-storage'
import { createAnalyticsActions } from './analytics'
import { emptyAnalytics } from '../analytics'
import { backupSummary, parseBackup, type WorkspaceBackup } from './backup'

import { newCard, type CardDraft, type ContentCard, type ContentTemplate } from '../content-records'
import { calculateOverview, type OverviewPeriod } from '../overview'
import { dateKey } from '../dates'

export type { Platform, PlatformDraft, Project, ProjectDraft } from '../project-records'
export { cardStatuses, materialKinds, newCard, type CardDraft, type ContentCard, type ContentTemplate } from '../content-records'
export { overviewPeriods, type OverviewPeriod, type OverviewTask, type Overview } from '../overview'

const templates: ContentTemplate[] = [
  { id: 'post', name: 'Пост', body: 'Начало: вопрос читателю.\nОсновная часть: пример.\nФинал: следующий шаг.' },
  { id: 'video', name: 'Видео', body: 'Начало: зацепка.\nОсновная часть: три тезиса.\nФинал: вывод.' },
  { id: 'seo', name: 'SEO-описание', body: 'Тема и ключевой запрос.\nКраткое описание материала.\nСледующий шаг для читателя.' },
  { id: 'letter', name: 'Сопроводительное письмо', body: 'Приветствие.\nКонтекст и предложение.\nСледующий шаг и контакты.' },
]

export const platformCatalog: readonly PlatformDraft[] = [
  { name: 'Telegram', formats: ['Пост', 'Опрос'], metrics: ['Просмотры', 'Подписчики'], checklist: ['Проверить текст и ссылки'] },
  { name: 'ВКонтакте', formats: ['Пост', 'Короткое видео'], metrics: ['Охват', 'Реакции'], checklist: ['Проверить обложку'] },
  { name: 'YouTube', formats: ['Видео', 'Короткое видео'], metrics: ['Просмотры', 'Подписчики'], checklist: ['Проверить заголовок и обложку'] },
]

const exampleProjects: Project[] = [
  { id: 'studio', name: 'Студия «Север»', description: 'Контент студии', platforms: [{ ...platformCatalog[1], id: 'studio-vk', projectId: 'studio' }] },
  { id: 'garden', name: 'Городской сад', description: 'Практические материалы о растениях', platforms: platformCatalog.map((item, i) => ({ ...item, id: 'demo-' + i, projectId: 'garden' })) },
]

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function exampleCards(): ContentCard[] {
  const date = new Date()
  const day = (offset: number) => dateKey(date, offset)
  const card = (id: string, draft: CardDraft, projectId = 'garden'): ContentCard => ({ ...draft, id, projectId, archived: false })
  return [
    card('seed-idea', newCard('Идея', { title: 'Уход за растениями на балконе', nextStep: 'Подобрать примеры' })),
    card('seed-post', newCard('Публикация', { parentId: 'seed-idea', title: 'Чек-лист по уходу за рассадой', platformId: 'demo-0', format: 'Пост', plannedDate: day(0), dueDate: day(-1), status: 'В работе', nextStep: 'Добавить фото' })),
    card('seed-video', newCard('Публикация', { parentId: 'seed-idea', title: 'Три совета по уходу за рассадой', platformId: 'demo-2', format: 'Короткое видео', plannedDate: day(2), status: 'На проверке', nextStep: 'Проверить обложку' })),
    card('seed-script', newCard('Сценарий', { parentId: 'seed-video', title: 'Сценарий короткого видео', platformId: 'demo-2', status: 'Готово' })),
    card('clip', newCard('Публикация', { title: 'Зелень на балконе', platformId: 'demo-2', format: 'Короткое видео', status: 'Опубликовано', publishedDate: day(-9), plannedDate: day(-9) })),
    card('clip2', newCard('Публикация', { title: 'Рассада на подоконнике', platformId: 'demo-2', format: 'Короткое видео', status: 'Опубликовано', publishedDate: day(-10), plannedDate: day(-10) })),
    card('studio-post', newCard('Публикация', { title: 'Как мы снимали зимний каталог', platformId: 'studio-vk', format: 'Пост', plannedDate: day(-3), publishedDate: day(-3), status: 'Опубликовано' }), 'studio'),
    card('studio-clip', newCard('Публикация', { title: 'За кадром: один день в студии', platformId: 'studio-vk', format: 'Короткое видео', plannedDate: day(-2), status: 'Готово', nextStep: 'Подобрать новую дату' }), 'studio'),
  ]
}

export function createWorkspaceStub(params: URLSearchParams, projectStorage?: ProjectStorage) {
  const demo = params.get('mode') === 'demo'
  const scenario = params.get('state')
  let projects = demo && scenario !== 'empty' ? structuredClone(exampleProjects) : []
  let cards = demo && scenario !== 'empty' ? exampleCards() : []
  let listAttempts = 0
  let platformAttempts = 0
  let planAttempts = 0
  let cardAttempts = 0
  let templateAttempts = 0
  let overviewAttempts = 0
  let restoreAttempts = 0
  let memoryAnalytics = emptyAnalytics()
  const memoryAccess: AnalyticsAccess = {
    async readWorkspace() { return structuredClone({ projects, cards, analytics: memoryAnalytics }) },
    async updateAnalytics(update, fail) {
      const next = update({ projects, cards, analytics: memoryAnalytics })
      if (fail) throw new Error('test metrics write')
      memoryAnalytics = structuredClone(next)
    },
  }
  const access = projectStorage ?? memoryAccess
  const analytics = createAnalyticsActions(access, scenario)
  const snapshot = async (): Promise<WorkspaceBackup> => ({ format: 'smm-workspace', version: 1, ...await access.readWorkspace() })

  async function updateProjects(update: (current: Project[]) => Project[]) {
    projects = projectStorage ? await projectStorage.update(update) : update(projects)
  }

  async function readPlan() {
    if (projectStorage) ({ projects, cards } = await projectStorage.readPlan())
  }

  async function updateCards(update: (current: { projects: Project[]; cards: ContentCard[] }) => ContentCard[]) {
    if (projectStorage) ({ projects, cards } = await projectStorage.updateCards(update))
    else cards = update({ projects, cards })
    return cards
  }

  return {
    ...analytics,
    async backupCounts() { return backupSummary(await snapshot()) },
    async exportBackup() {
      await wait(180)
      return JSON.stringify(await snapshot(), null, 2)
    },
    async previewBackup(text: string) {
      await wait(scenario === 'backup-loading' ? 1400 : 180)
      return parseBackup(text)
    },
    async restoreBackup(backup: WorkspaceBackup) {
      const first = ++restoreAttempts === 1
      await wait(240)
      const next = structuredClone(backup)
      if (projectStorage) ({ projects, cards } = await projectStorage.replaceWorkspace(next, scenario === 'backup-error' && first))
      else {
        if (scenario === 'backup-error' && first) throw new Error('test restore failure');
        ({ projects, cards } = next)
        memoryAnalytics = next.analytics
      }
      return backupSummary(next)
    },
    async listProjects(): Promise<Project[]> {
      listAttempts += 1
      await wait(scenario === 'loading' && listAttempts === 1 ? 2200 : 120)
      if (scenario === 'error' && listAttempts === 1) throw new Error('test project read')
      if (projectStorage) projects = await projectStorage.list()
      return structuredClone(projects)
    },
    async saveProject(draft: ProjectDraft): Promise<Project> {
      await wait(220)
      const project: Project = { ...draft, id: crypto.randomUUID(), platforms: [] }
      await updateProjects(current => [...current, project])
      return structuredClone(project)
    },
    async savePlatform(projectId: string, draft: PlatformDraft): Promise<Platform> {
      platformAttempts += 1
      await wait(280)
      if (scenario === 'platform-error' && platformAttempts === 1) throw new Error('test platform write')
      const platform = { ...draft, projectId, id: crypto.randomUUID() }
      await updateProjects(current => {
        if (!current.some(project => project.id === projectId)) throw new Error('Unknown project')
        return current.map(project => project.id === projectId
          ? { ...project, platforms: [...project.platforms, platform] }
          : project)
      })
      return structuredClone(platform)
    },
    async updatePlatformMetrics(projectId: string, platformId: string, fields: Pick<PlatformDraft, 'metrics' | 'metricDetails'>) {
      let updated: Platform | undefined
      await updateProjects(current => current.map(project => project.id === projectId
        ? { ...project, platforms: project.platforms.map(platform => {
            if (platform.id !== platformId) return platform
            updated = { ...platform, ...fields }
            return updated
          }) }
        : project))
      if (!updated) throw new Error('Unknown platform')
      return structuredClone(updated)
    },
    async listCards(projectId: string): Promise<ContentCard[]> {
      const first = ++planAttempts === 1
      await wait(scenario === 'plan-loading' && first ? 2000 : 150)
      if (scenario === 'plan-error' && first) throw new Error('test plan read')
      await readPlan()
      return structuredClone(cards.filter(card => card.projectId === projectId))
    },
    async getOverview(periodId: OverviewPeriod, projectId: string) {
      const first = ++overviewAttempts === 1
      await wait(scenario === 'overview-loading' && first ? 2000 : 220)
      if (scenario === 'overview-error' && first) throw new Error('test overview read')
      await readPlan()
      return structuredClone(calculateOverview(projects, cards, periodId, projectId, new Date()))
    },
    async listTemplates(): Promise<ContentTemplate[]> {
      const first = ++templateAttempts === 1
      await wait(scenario === 'templates-loading' && first ? 1800 : 160)
      if (scenario === 'templates-error' && first) throw new Error('test templates read')
      return scenario === 'templates-empty' ? [] : structuredClone(templates)
    },
    async saveCard(projectId: string, draft: CardDraft, id?: string): Promise<ContentCard> {
      const first = ++cardAttempts === 1
      await wait(240)
      if (scenario === 'card-error' && first) throw new Error('test card write')
      const cardId = id ?? crypto.randomUUID()
      const next = await updateCards(({ projects, cards }) => {
        const project = projects.find(item => item.id === projectId)
        const previous = id ? cards.find(item => item.id === id && item.projectId === projectId) : undefined
        const parent = draft.parentId ? cards.find(item => item.id === draft.parentId && item.projectId === projectId) : undefined
        if (!project || (id && (!previous || previous.archived)) || (draft.parentId && (!parent || parent.archived)) ||
          (draft.platformId && !project.platforms.some(item => item.id === draft.platformId))) {
          throw new Error('Invalid card scope')
        }
        const platformId = parent?.kind === 'Публикация' ? parent.platformId : draft.platformId
        const card = { ...draft, externalId: draft.externalId?.trim() || undefined, platformId, id: cardId, projectId, archived: false }
        const updated = [...cards.filter(item => item.id !== card.id), card]
        return card.kind === 'Публикация'
          ? updated.map(item => item.projectId === projectId && item.parentId === card.id ? { ...item, platformId } : item)
          : updated
      })
      return structuredClone(next.find(item => item.id === cardId)!)
    },
    async archivePublication(projectId: string, id: string, archived: boolean): Promise<ContentCard[]> {
      await wait(180)
      const next = await updateCards(({ cards }) => {
        if (!cards.some(card => card.projectId === projectId && card.id === id && card.kind === 'Публикация')) {
          throw new Error('Unknown publication')
        }
        return cards.map(card => card.projectId === projectId && (card.id === id || card.parentId === id) ? { ...card, archived } : card)
      })
      return structuredClone(next.filter(card => card.projectId === projectId))
    },
  }
}
