import { chromium, expect, test, type Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer, type ViteDevServer } from 'vite'

const workingUrl = 'http://127.0.0.1:3000/'
const live = process.env.T01_LIVE_RUN === '1'
const evidenceDir = 'docs/tasks/artifacts/T01'
let server: ViteDevServer | undefined
let url: string

test.beforeAll(async () => {
  if (live) {
    url = workingUrl
    await mkdir(evidenceDir, { recursive: true })
    return
  }
  server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: true, ws: false } })
  await server.listen()
  const address = server.resolvedUrls?.local[0]
  if (!address) throw new Error('Vite did not report a test URL')
  url = address
})

test.afterAll(async () => {
  await server?.close()
})

async function recordScreen(page: Page, name: string) {
  if (!live) return
  await page.screenshot({ path: evidenceDir + '/' + name + '.png' })
  await writeFile(evidenceDir + '/' + name + '.txt', await page.getByRole('main').innerText())
}

async function enterProject(page: Page, name: string) {
  await page.getByRole('button', { name: 'Создать проект' }).click()
  await page.getByLabel('Название', { exact: true }).fill(name)
}

async function selectPlatform(page: Page, option: string) {
  await page.getByRole('button', { name: 'Добавить площадку' }).click()
  await page.getByRole('combobox', { name: 'Каталог площадок' }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function addPlatform(page: Page, platform: typeof platforms[number]) {
  await selectPlatform(page, platform.option)
  if (platform.option === 'Telegram') {
    await expect(page.getByLabel('Форматы')).toHaveValue(/Пост/)
  } else {
    await page.getByLabel('Название площадки').fill(platform.name)
    await page.getByRole('button', { name: 'Сохранить площадку' }).click()
    await expect(page.getByRole('alert')).toContainText('Добавьте свой формат')
  }
  await page.getByLabel('Форматы').fill(platform.format)
  await page.getByLabel('Метрики').fill(platform.metric)
  await page.getByLabel('Чек-лист').fill(platform.checklist)
  await page.getByRole('button', { name: 'Сохранить площадку' }).click()
  await expect(page.getByRole('heading', { name: platform.name })).toBeVisible()
  await page.getByRole('button', { name: 'К проекту' }).click()
}

const platforms = [
  { option: 'Telegram', name: 'Telegram', format: 'Анонс', metric: 'Пересылки', checklist: 'Согласовать ссылку', image: 'restart-catalog' },
  { option: 'Добавить свою', name: 'Маяк FM', format: 'Радиодайджест', metric: 'Дослушивания', checklist: 'Проверить уровень звука', image: 'restart-custom' },
]

test('T01: проект и настройки обеих площадок доступны после закрытия Chromium', async () => {
  const profile = test.info().outputPath('persistent-profile')
  const context = await chromium.launchPersistentContext(profile)
  try {
    const page = await context.newPage()
    await page.goto(url)
    await expect(page.getByText('Добавьте первый проект')).toBeVisible()
    await enterProject(page, '   ')
    await page.getByRole('button', { name: 'Сохранить проект' }).click()
    await expect(page.getByText('Введите название проекта')).toBeVisible()
    await page.getByLabel('Название', { exact: true }).fill('Редакция Маяк')
    await page.getByRole('button', { name: 'Сохранить проект' }).click()
    for (const platform of platforms) await addPlatform(page, platform)
  } finally {
    await context.close()
  }

  const reopened = await chromium.launchPersistentContext(profile)
  try {
    const page = await reopened.newPage()
    await page.goto(url)
    await expect(page.getByRole('heading', { name: 'Редакция Маяк' })).toBeVisible()
    await expect(page.getByText('Площадки: 2', { exact: true })).toBeVisible()
    await recordScreen(page, 'restart-dashboard')
    await page.getByRole('button', { name: 'Открыть проект' }).click()
    for (const platform of platforms) {
      await page.getByRole('button', { name: platform.name, exact: true }).click()
      await expect(page.getByText(platform.format, { exact: true })).toBeVisible()
      await expect(page.getByText('Метрики: ' + platform.metric, { exact: true })).toBeVisible()
      await expect(page.getByText('Чек-лист: ' + platform.checklist, { exact: true })).toBeVisible()
      await recordScreen(page, platform.image)
      await page.getByRole('button', { name: 'К проекту' }).click()
    }
    await page.getByRole('button', { name: 'К проектам' }).click()
    await page.getByRole('link', { name: 'Открыть пример данных' }).click()
    await expect(page.getByRole('heading', { name: 'Городской сад' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Редакция Маяк' })).toHaveCount(0)
    await enterProject(page, 'Временный проект демо')
    await page.getByRole('button', { name: 'Сохранить проект' }).click()
    await expect(page.getByRole('heading', { name: 'Временный проект демо' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Городской сад' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Временный проект демо' })).toHaveCount(0)
    await recordScreen(page, 'demo-reload')
    await page.getByRole('link', { name: 'К рабочему пространству' }).click()
    await expect(page.getByRole('heading', { name: 'Редакция Маяк' })).toBeVisible()
  } finally {
    await reopened.close()
  }
})

test('T01: команда запуска сообщает о занятом порте и сохраняет действующий адрес', async () => {
  const marker = 'existing listener'
  const listener = createHttpServer((_, response) => response.end(marker))
  if (!live) {
    await new Promise<void>((resolve, reject) => {
      listener.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') resolve()
        else reject(error)
      })
      listener.listen(3000, '127.0.0.1', resolve)
    })
  }

  try {
    const before = await fetch(workingUrl)
    expect(before.status).toBe(200)
    const original = await before.text()
    if (listener.listening) expect(original).toBe(marker)
    else expect(original).toContain('<title>SMM Workspace</title>')
    const options = { encoding: 'utf8' as const, timeout: 12_000 }
    const failed = process.platform === 'win32'
      ? spawnSync('npm.cmd start', { ...options, shell: true })
      : spawnSync('npm', ['start'], options)
    const after = await fetch(workingUrl)
    const sameBody = await after.text() === original
    if (live) {
      await writeFile(evidenceDir + '/port-conflict.json', JSON.stringify({
        exitCode: failed.status, stdout: failed.stdout, stderr: failed.stderr,
        activeUrl: after.url, statusBefore: before.status, statusAfter: after.status, sameBody,
      }, null, 2))
    }
    expect(failed.error).toBeUndefined()
    expect(failed.status).toBe(1)
    expect(failed.stderr).toContain('Порт 3000 занят')
    expect(failed.stderr).toContain(workingUrl)
    expect(failed.stderr).toContain('освободите порт')
    expect(failed.stdout).not.toMatch(/127\.0\.0\.1:300\d/)
    expect(after.url).toBe(workingUrl)
    expect(after.status).toBe(200)
    expect(sameBody).toBe(true)
  } finally {
    if (listener.listening) await new Promise<void>(resolve => listener.close(() => resolve()))
  }
})

async function projectRecord(page: Page, replacement?: unknown) {
  return page.evaluate(({ write, value }) => new Promise<unknown>((resolve, reject) => {
    const open = indexedDB.open('smm-workspace')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const database = open.result
      const tx = database.transaction('workspace', write ? 'readwrite' : 'readonly')
      const store = tx.objectStore('workspace')
      const request = write ? store.put(value, 'projects') : store.get('projects')
      tx.oncomplete = () => { database.close(); resolve(request.result) }
      tx.onabort = () => { database.close(); reject(tx.error) }
    }
  }), { write: replacement !== undefined, value: replacement })
}

test('T01: сбои чтения и записи IndexedDB сохраняют исходные данные', async ({ page }) => {
  await page.goto(url)
  await enterProject(page, 'Проект до сбоя')
  await page.getByRole('button', { name: 'Сохранить проект' }).click()
  await expect(page.getByRole('heading', { name: 'Проект до сбоя' })).toBeVisible()
  const before = await projectRecord(page)
  const damaged = { malformed: true, previous: before }
  await projectRecord(page, damaged)

  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Не удалось открыть проекты. Повторите попытку')
  await expect(page.getByText('Добавьте первый проект')).toHaveCount(0)
  await page.getByRole('button', { name: 'Повторить попытку' }).click()
  await expect(page.getByRole('alert')).toContainText('Не удалось открыть проекты. Повторите попытку')
  const afterReadFailure = await projectRecord(page)
  expect(afterReadFailure).toEqual(damaged)
  await recordScreen(page, 'storage-read-failure')
  await projectRecord(page, before)
  await page.getByRole('button', { name: 'Повторить попытку' }).click()
  await expect(page.getByRole('heading', { name: 'Проект до сбоя' })).toBeVisible()

  await enterProject(page, 'Проект после сбоя')
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, key) {
      IDBObjectStore.prototype.put = put
      const request = put.call(this, value, key)
      request.addEventListener('success', () => this.transaction.abort(), { once: true })
      return request
    }
  })
  await page.getByRole('button', { name: 'Сохранить проект' }).click()
  await expect(page.getByRole('alert')).toContainText('Не удалось сохранить проект. Повторите попытку')
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Проект после сбоя')
  const afterWriteFailure = await projectRecord(page)
  expect(afterWriteFailure).toEqual(before)
  await recordScreen(page, 'storage-write-failure')
  await page.getByRole('button', { name: 'Сохранить проект' }).click()
  await expect(page.getByRole('heading', { name: 'Проект после сбоя' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Проект до сбоя' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Проект после сбоя' })).toBeVisible()
  if (live) {
    await writeFile(evidenceDir + '/storage-failure-indexeddb.json', JSON.stringify({
      before, afterReadFailure, afterWriteFailure, afterRetry: await projectRecord(page),
    }, null, 2))
  }
})

const legacyProject = {
  id: 'legacy-project', name: 'Редакция из прежнего профиля', description: '',
  platforms: [{
    id: 'legacy-platform', projectId: 'legacy-project', name: 'Канал из прежнего профиля',
    formats: ['Обзор'], metrics: ['Просмотры'], checklist: ['Проверить факты'],
  }],
}
const damagedLegacyProject = { id: 'legacy-damaged', name: 'Запись с повреждением', formats: 17 }

for (const scenario of [
  { name: 'empty', rows: [] },
  { name: 'existing', rows: [legacyProject] },
  { name: 'damaged', rows: [legacyProject, damagedLegacyProject] },
]) {
  test('T01: обновление профиля с базой версии 1 (' + scenario.name + ')', async ({ page }) => {
    const setup = new URL('storage-test', url).href
    await page.route(setup, route => route.fulfill({ contentType: 'text/html', body: '<title>Storage test</title>' }))
    await page.goto(setup)
    await page.evaluate(rows => new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('smm-workspace', 1)
      open.onupgradeneeded = () => {
        const projects = open.result.createObjectStore('projects', { keyPath: 'id' })
        for (const row of rows) projects.add(row)
      }
      open.onsuccess = () => { open.result.close(); resolve() }
      open.onerror = () => reject(open.error)
    }), scenario.rows)
    await page.goto(url)

    if (scenario.name === 'damaged') {
      await expect(page.getByRole('alert')).toContainText('Не удалось открыть проекты. Повторите попытку')
      await expect(page.getByText('Добавьте первый проект')).toHaveCount(0)
      const raw = await page.evaluate(() => new Promise((resolve, reject) => {
        const open = indexedDB.open('smm-workspace')
        open.onsuccess = () => {
          const database = open.result
          const rows = database.transaction('projects').objectStore('projects').getAll()
          rows.onsuccess = () => {
            resolve({ version: database.version, stores: [...database.objectStoreNames], rows: rows.result })
            database.close()
          }
          rows.onerror = () => reject(rows.error)
        }
        open.onerror = () => reject(open.error)
      }))
      expect(raw).toEqual({
        version: 1, stores: ['projects'], rows: [damagedLegacyProject, legacyProject],
      })
      await recordScreen(page, 'legacy-damaged')
      if (live) await writeFile(evidenceDir + '/legacy-damaged-indexeddb.json', JSON.stringify(raw, null, 2))
      return
    }

    if (scenario.name === 'existing') {
      await expect(page.getByRole('heading', { name: legacyProject.name })).toBeVisible()
      expect(await projectRecord(page)).toEqual(scenario.rows)
    } else {
      await expect(page.getByText('Добавьте первый проект')).toBeVisible()
    }
    await enterProject(page, 'Проект после обновления')
    await page.getByRole('button', { name: 'Сохранить проект' }).click()
    await expect(page.getByRole('heading', { name: 'Проект после обновления' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Проект после обновления' })).toBeVisible()
    await recordScreen(page, 'legacy-' + scenario.name)
    if (live) {
      await writeFile(evidenceDir + '/legacy-' + scenario.name + '-indexeddb.json', JSON.stringify(await projectRecord(page), null, 2))
    }
  })
}
