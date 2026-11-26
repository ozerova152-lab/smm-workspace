import { validProjects, type Project } from './project-records'
import { validCards, type ContentCard } from './content-records'

import { emptyAnalytics, type AnalyticsSnapshot } from './analytics'
import { assertValidAnalytics } from './stubs/backup'

type UpdateProjects = (projects: Project[]) => Project[]
type PlanSnapshot = { projects: Project[]; cards: ContentCard[] }
type WorkspaceSnapshot = PlanSnapshot & { analytics: AnalyticsSnapshot }
type UpdateAnalytics = (current: WorkspaceSnapshot) => AnalyticsSnapshot
export type AnalyticsAccess = {
  readWorkspace: () => Promise<WorkspaceSnapshot>
  updateAnalytics: (update: UpdateAnalytics, fail?: boolean) => Promise<void>
}

type UpdateCards = (current: PlanSnapshot) => ContentCard[]

export type ProjectStorage = AnalyticsAccess & {
  list: () => Promise<Project[]>
  update: (update: UpdateProjects) => Promise<Project[]>
  readPlan: () => Promise<PlanSnapshot>
  updateCards: (update: UpdateCards) => Promise<PlanSnapshot>
  replaceWorkspace: (next: WorkspaceSnapshot, fail?: boolean) => Promise<PlanSnapshot>
}

const databaseName = 'smm-workspace'
const databaseVersion = 2
const storeName = 'workspace'
const recordKey = 'projects'
const cardsKey = 'cards'
const analyticsKey = 'analytics'
const legacyStoreName = 'projects'

function upgradeDatabase(database: IDBDatabase, transaction: IDBTransaction, oldVersion: number) {
  if (database.objectStoreNames.contains(storeName)) return
  const store = database.createObjectStore(storeName)
  if (oldVersion === 0) {
    store.add([], recordKey)
    return
  }

  if (!database.objectStoreNames.contains(legacyStoreName)) {
    transaction.abort()
    return
  }
  const request = transaction.objectStore(legacyStoreName).getAll()
  request.onsuccess = () => {
    if (validProjects(request.result)) store.add(request.result, recordKey)
    else transaction.abort()
  }
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    let blocked = false
    request.onblocked = () => {
      blocked = true
      reject(new Error('Workspace database is blocked'))
    }
    request.onupgradeneeded = event => {
      const transaction = request.transaction!
      if (blocked) {
        transaction.abort()
        return
      }
      upgradeDatabase(request.result, transaction, event.oldVersion)
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      if (blocked) database.close()
      else resolve(database)
    }
  })
}

async function withProjects<T>(
  mode: IDBTransactionMode,
  read: (store: IDBObjectStore, projects: Project[], finish: (read: () => T) => void) => void,
): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode)
      const store = transaction.objectStore(storeName)
      const request = store.get(recordKey)
      let result: T
      transaction.oncomplete = () => resolve(result)
      transaction.onabort = () => reject(transaction.error ?? new Error('Workspace transaction was aborted'))
      function finish(read: () => T) {
        try {
          result = read()
        } catch (error) {
          transaction.abort()
          reject(error)
        }
      }
      request.onsuccess = () => {
        const projects: unknown = request.result
        if (!validProjects(projects)) {
          finish(() => { throw new Error('Workspace projects are damaged') })
          return
        }
        read(store, projects, finish)
      }
    })
  } finally {
    database.close()
  }
}

type PlanUpdate = { updateCards: UpdateCards } | { replaceWith: WorkspaceSnapshot; fail?: boolean }

function readPlan(update?: PlanUpdate) {
  return withProjects<PlanSnapshot>(update ? 'readwrite' : 'readonly', (store, projects, finish) => {
    const request = store.get(cardsKey)
    request.onsuccess = () => finish(() => {
      // Earlier workspaces have a projects record and no cards record.
      const cards: unknown = request.result === undefined ? [] : request.result
      if (!validCards(cards, projects)) throw new Error('Workspace cards are damaged')
      if (!update) return { projects, cards }

      const replacing = 'replaceWith' in update
      const next = replacing ? update.replaceWith : { projects, cards: update.updateCards({ projects, cards }) }
      if (!validProjects(next.projects) || !validCards(next.cards, next.projects)) throw new Error('Invalid content plan')
      if (replacing) {
        assertValidAnalytics(update.replaceWith.analytics, next.projects, next.cards)
        store.put(next.projects, recordKey)
        store.put(update.replaceWith.analytics, analyticsKey)
      }
      const write = store.put(next.cards, cardsKey)
      if (replacing && update.fail) write.onsuccess = () => store.transaction.abort()
      return next
    })
  })
}

function accessAnalytics(update?: UpdateAnalytics, fail = false) {
  return withProjects<WorkspaceSnapshot>(update ? 'readwrite' : 'readonly', (store, projects, finish) => {
    const cardsRequest = store.get(cardsKey)
    const analyticsRequest = store.get(analyticsKey)
    analyticsRequest.onsuccess = () => finish(() => {
      const cards: unknown = cardsRequest.result === undefined ? [] : cardsRequest.result
      if (!validCards(cards, projects)) throw new Error('Workspace cards are damaged')
      const analytics: unknown = analyticsRequest.result === undefined ? emptyAnalytics() : analyticsRequest.result
      assertValidAnalytics(analytics, projects, cards)
      const current = { projects, cards, analytics }
      if (!update) return current
      const next = update(current)
      assertValidAnalytics(next, projects, cards)
      const write = store.put(next, analyticsKey)
      if (fail) write.onsuccess = () => store.transaction.abort()
      return { ...current, analytics: next }
    })
  })
}

export const localProjectStorage: ProjectStorage = {
  list: () => withProjects<Project[]>('readonly', (_store, projects, finish) => finish(() => projects)),
  update: update => withProjects<Project[]>('readwrite', (store, projects, finish) => finish(() => {
    const next = update(projects)
    if (!validProjects(next)) throw new Error('Invalid workspace projects')
    store.put(next, recordKey)
    return next
  })),
  readPlan: () => readPlan(),
  updateCards: updateCards => readPlan({ updateCards }),
  replaceWorkspace: (replaceWith, fail) => readPlan({ replaceWith, fail }),
  readWorkspace: () => accessAnalytics(),
  async updateAnalytics(update, fail) { await accessAnalytics(update, fail) },
}
