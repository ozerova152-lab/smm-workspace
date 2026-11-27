import { chromium, expect, test, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer, type ViteDevServer } from 'vite'
import type { ContentCard } from '../src/lib/content-records'

const evidence = process.env.T02_EVIDENCE === '1'
const evidenceDir = 'docs/tasks/artifacts/T02'
const fixedTime = new Date(2026, 10, 25, 12)
const project = 'Редакция «Лес»'
const idea = 'Ноябрьские прогулки'
const first = 'Маршрут недели'
const second = 'Фильм о маршруте'
const script = 'Сценарий маршрута'
const platforms = [
  { name: 'Telegram', formats: ['Объявление', 'Фотозарисовка'], checklist: 'Проверить время отправки' },
  { name: 'YouTube', formats: ['Короткий обзор', 'Документальный очерк'], checklist: 'Проверить титры' },
] as const
let server: ViteDevServer | undefined
let url: string

async function startServer(port: number) {
  server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true, ws: false } })
  await server.listen()
  const address = server.resolvedUrls?.local[0]
  if (!address) throw new Error('Vite did not report a test URL')
  return address
}

test.beforeAll(async () => {
  url = await startServer(0)
  expect(new URL(url).port).not.toBe('3000')
  if (evidence) await mkdir(evidenceDir, { recursive: true })
})

test.afterAll(async () => {
  await server?.close()
})

const card = (page: Page) => page.getByRole('dialog', { name: 'Карточка' })
const button = (root: Page | Locator, name: string) => root.getByRole('button', { name, exact: true })

async function record(page: Page, name: string, area = page.getByRole('main'), options: string[] = []) {
  if (!evidence) return
  await page.screenshot({ path: evidenceDir + '/' + name + '.png' })
  const snapshot = await area.ariaSnapshot()
  const choices = options.length ? '\nВарианты формата: ' + options.join(', ') : ''
  await writeFile(evidenceDir + '/' + name + '.txt', snapshot + choices + '\n')
}

async function storedCards(page: Page): Promise<ContentCard[]> {
  return page.evaluate(() => new Promise<ContentCard[]>((resolve, reject) => {
    const open = indexedDB.open('smm-workspace')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const database = open.result
      const transaction = database.transaction('workspace')
      const request = transaction.objectStore('workspace').get('cards')
      transaction.oncomplete = () => { database.close(); resolve(request.result ?? []) }
      transaction.onabort = () => { database.close(); reject(transaction.error) }
    }
  }))
}

async function start(page: Page) {
  await page.clock.setFixedTime(fixedTime)
  await page.goto(url)
}

async function choice(page: Page, root: Page | Locator, label: string, option: string) {
  await root.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function createProject(page: Page, name: string) {
  await button(page, 'Создать проект').click()
  await page.getByLabel('Название', { exact: true }).fill(name)
  await button(page, 'Сохранить проект').click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
}

async function addPlatform(page: Page, platform: typeof platforms[number]) {
  await button(page, 'Добавить площадку').click()
  await choice(page, page, 'Каталог площадок', platform.name)
  await page.getByLabel('Форматы').fill(platform.formats.join('\n'))
  await page.getByLabel('Чек-лист').fill(platform.checklist)
  await button(page, 'Сохранить площадку').click()
  await expect(page.getByRole('heading', { name: platform.name, exact: true })).toBeVisible()
  await button(page, 'К проекту').click()
}

async function saveCard(page: Page) {
  const save = button(card(page), 'Сохранить карточку')
  await save.click()
  await expect(save).toBeEnabled()
  await expect(card(page).getByRole('alert')).toHaveCount(0)
}

async function openProject(page: Page, name: string) {
  const projectSection = page.getByRole('heading', { name, exact: true }).locator('..')
  await button(projectSection, 'Открыть проект').click()
  await expect(page.getByRole('heading', { name: 'Контент-план' })).toBeVisible()
}

async function planView(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click()
}

async function adaptation(page: Page, title: string, platform: typeof platforms[number], date: string, dueDate: string, capture?: string) {
  const form = card(page)
  await button(form, 'Добавить адаптацию').click()
  await form.getByLabel('Заголовок').fill(title)
  await button(form, 'Сохранить карточку').click()
  await expect(form.getByRole('alert')).toHaveText('Выберите площадку и формат')
  await choice(page, form, 'Площадка', platform.name)
  await expect(form.getByText(platform.checklist, { exact: true })).toBeVisible()
  await form.getByRole('combobox', { name: 'Формат' }).click()
  await expect(page.getByRole('option')).toHaveText([...platform.formats])
  if (capture && evidence) await record(page, capture, form, await page.getByRole('option').allTextContents())
  await page.getByRole('option', { name: platform.formats[0], exact: true }).click()
  await form.getByLabel('Дата выхода', { exact: true }).fill(date)
  await form.getByLabel('Срок подготовки').fill(dueDate)
  await form.getByLabel('Следующий шаг').fill('Проверить маршрут')
  await choice(page, form, 'Статус', 'В работе')
  await saveCard(page)
}

test('T02: карточки, площадки, шаблон и архив переживают закрытие браузера', async () => {
  test.setTimeout(70_000)
  const profile = test.info().outputPath('persistent-profile')
  const firstSession = await chromium.launchPersistentContext(profile)
  let templateText: string
  try {
    const page = await firstSession.newPage()
    await start(page)
    await expect(page.getByText('Добавьте первый проект')).toBeVisible()
    await createProject(page, project)
    for (const platform of platforms) await addPlatform(page, platform)
    await page.getByRole('button', { name: 'Ещё' }).click()
    await page.getByRole('menuitem', { name: 'Выбрать шаблон', exact: true }).click()
    await button(page.getByRole('dialog', { name: 'Шаблоны' }), 'Использовать шаблон').first().click()
    const form = card(page)
    const content = form.getByLabel('Содержание')
    templateText = await content.inputValue()
    expect(templateText.length).toBeGreaterThan(0)
    await form.getByLabel('Заголовок').fill('   ')
    await button(form, 'Сохранить карточку').click()
    await expect(form.getByRole('alert')).toContainText('Добавьте заголовок')
    await expect(content).toHaveValue(templateText)
    await form.getByLabel('Заголовок').fill(idea)
    await content.fill('Редакционный текст о лесной тропе.')
    await saveCard(page)
    await adaptation(page, first, platforms[0], '2026-11-26', '2026-11-25', 'platform-telegram-adaptation')
    await button(form, 'Связать материал').click()
    await button(form, 'Сценарий').click()
    await form.getByLabel('Заголовок').fill(script)
    await content.fill('Вступление ведущей и два эпизода.')
    await saveCard(page)
    await button(form, 'К плану').click()
    await button(page, idea).click()
    await adaptation(page, second, platforms[1], '2026-11-29', '2026-11-27', 'platform-youtube-adaptation')
    await button(form, 'К плану').click()
    await button(page, first).click()
    await form.getByLabel('Дата выхода', { exact: true }).fill('2026-11-28')
    await choice(page, form, 'Статус', 'Готово')
    await saveCard(page)
    await button(form, 'К плану').click()
  } finally {
    await firstSession.close()
  }

  const reopened = await chromium.launchPersistentContext(profile)
  try {
    const page = await reopened.newPage()
    await start(page)
    await openProject(page, project)
    const form = card(page)
    const row = page.getByRole('row').filter({ has: button(page, first) })
    await expect(row).toContainText('28 нояб. 2026')
    await expect(row).toContainText('Готово')
    await expect(button(page, second)).toBeVisible()
    await record(page, 'restart-table')
    await button(page, idea).click()
    await expect(form.getByLabel('Содержание')).toHaveValue('Редакционный текст о лесной тропе.')
    await expect(button(form, first)).toBeVisible()
    await expect(button(form, second)).toBeVisible()
    await record(page, 'restart-adaptations', form)
    await button(form, 'К плану').click()
    await planView(page, 'Доска')
    await expect(button(page.locator('[aria-label="Готово"]'), first)).toBeVisible()
    await expect(button(page.locator('[aria-label="В работе"]'), second)).toBeVisible()
    await record(page, 'restart-board')
    await planView(page, 'Календарь')
    await expect(page.locator('.plan-day').filter({ has: button(page, first) }).getByText('28', { exact: true })).toBeVisible()
    await expect(page.locator('.plan-day').filter({ has: button(page, second) }).getByText('29', { exact: true })).toBeVisible()
    await record(page, 'restart-calendar')
    await button(page, first).click()
    await expect(form.getByRole('combobox', { name: 'Статус' })).toHaveValue('Готово')
    await expect(button(form, script)).toBeVisible()
    await button(form, 'К плану').click()

    await button(page, platforms[0].name).click()
    await expect(button(page, idea)).toBeVisible()
    await record(page, 'platform-ideas')
    await button(page, idea).click()
    await expect(form.getByLabel('Заголовок')).toHaveValue(idea)
    await button(form, 'К плану').click()
    await button(page, 'К площадке').click()
    await button(page, 'Открыть контент-план').click()
    await expect(page.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Показать ' + platforms[0].name })).toHaveAttribute('aria-pressed', 'true')
    await expect(button(page, first)).toBeVisible()
    await expect(button(page, second)).toHaveCount(0)
    await record(page, 'platform-calendar')
    await button(page, 'К площадке').click()
    await button(page, 'Шаблоны').click()
    const templates = page.getByRole('dialog', { name: 'Шаблоны' })
    await expect(templates).toBeVisible()
    await record(page, 'platform-templates', templates)
    await button(templates, 'Использовать шаблон').first().click()
    await expect(form.getByLabel('Содержание')).toHaveValue(templateText)
    await button(form, 'К плану').click()

    await button(page, first).click()
    await button(form, 'Убрать из плана').click()
    await expect(form).toBeHidden()
    for (const view of ['Таблица', 'Доска', 'Календарь']) {
      await planView(page, view)
      await expect(button(page, first)).toHaveCount(0)
      await expect(button(page, script)).toHaveCount(0)
    }
    const archived = await storedCards(page)
    expect(archived.find(item => item.title === first)?.archived).toBe(true)
    expect(archived.find(item => item.title === script)?.archived).toBe(true)
    await page.getByRole('button', { name: 'Ещё' }).click()
    await page.getByRole('menuitem', { name: 'Архив', exact: true }).click()
    await expect(button(page, first)).toBeVisible()
    await record(page, 'archived')
    if (evidence) await writeFile(evidenceDir + '/archived-indexeddb.json', JSON.stringify(archived, null, 2))
  } finally {
    await reopened.close()
  }

  await server?.close()
  expect(await startServer(Number(new URL(url).port))).toBe(url)
  const finalSession = await chromium.launchPersistentContext(profile)
  try {
    const page = await finalSession.newPage()
    await start(page)
    await openProject(page, project)
    await expect(button(page, second)).toBeVisible()
    await expect(button(page, first)).toHaveCount(0)
    await expect(button(page, script)).toHaveCount(0)
    await page.getByRole('button', { name: 'Ещё' }).click()
    await page.getByRole('menuitem', { name: 'Архив', exact: true }).click()
    const archivedRow = page.getByRole('row').filter({ has: button(page, first) })
    await button(archivedRow, 'Восстановить').click()
    await expect(page.getByText('В архиве нет публикаций')).toBeVisible()
    await button(page, 'Вернуться к плану').click()
    await button(page, first).click()
    await button(card(page), script).click()
    await expect(card(page).getByLabel('Содержание')).toHaveValue('Вступление ведущей и два эпизода.')
    const restored = await storedCards(page)
    const parent = restored.find(item => item.title === idea)
    const publication = restored.find(item => item.title === first)
    const material = restored.find(item => item.title === script)
    expect(parent?.id).toBeTruthy()
    expect(publication).toMatchObject({ archived: false, parentId: parent?.id, plannedDate: '2026-11-28', status: 'Готово' })
    expect(restored.find(item => item.title === second)).toMatchObject({ archived: false, parentId: parent?.id })
    expect(material).toMatchObject({ archived: false, parentId: publication?.id })
    expect(await page.evaluate(() => location.origin)).toBe(new URL(url).origin)
    await record(page, 'restored-material', card(page))
    if (evidence) await writeFile(evidenceDir + '/restored-indexeddb.json', JSON.stringify(restored, null, 2))
  } finally {
    await finalSession.close()
  }
})

test('T02: обзор пересчитывает сохраненные сроки и возвращает к выбранным фильтрам', async ({ page }) => {
  test.setTimeout(45_000)
  await start(page)
  await expect(page.getByText('Добавьте первый проект')).toBeVisible()
  if (evidence) await writeFile(evidenceDir + '/clean-test-context.json', JSON.stringify({ url, initialScreen: await page.getByText('Добавьте первый проект').innerText(), realWorkspacePort: 3000 }, null, 2))
  await createProject(page, 'Редакция «Озеро»')
  await button(page, 'К проектам').click()
  await createProject(page, project)
  for (const platform of platforms) await addPlatform(page, platform)
  await button(page, 'Добавить идею').click()
  const form = card(page)
  await form.getByLabel('Заголовок').fill(idea)
  await saveCard(page)
  await adaptation(page, first, platforms[0], '2026-11-24', '2026-11-23')
  await button(form, 'К плану').click()
  await button(page, idea).click()
  await adaptation(page, second, platforms[1], '2026-11-28', '2026-11-24')
  await button(form, 'К плану').click()
  await button(page, 'К проектам').click()

  const overview = page.getByRole('region', { name: 'Обзор работы' })
  const row = overview.getByRole('row').filter({ has: page.getByRole('rowheader', { name: project }) })
  await expect(row.getByRole('cell')).toHaveText(['2', '0', '2'])
  await choice(page, overview, 'Проект', 'Редакция «Озеро»')
  await expect(overview.getByText('За этот период задач нет')).toBeVisible()
  await button(overview, 'Сбросить фильтры').click()
  await choice(page, overview, 'Проект', project)
  await choice(page, overview, 'Период', 'Последние 7 дней')
  await expect(row.getByRole('cell')).toHaveText(['1', '0', '2'])
  const overdue = overview.getByRole('region', { name: 'Просроченные задачи' })
  await expect(overdue.getByText('Прошёл срок подготовки')).toHaveCount(2)
  await expect(overdue.getByText('Пропущена дата выхода')).toHaveCount(1)
  await record(page, 'overview-past-before', overview)

  await button(overdue, first).click()
  await expect(form.getByLabel('Следующий шаг')).toHaveValue('Проверить маршрут')
  await choice(page, form, 'Статус', 'Опубликовано')
  await button(form, 'Сохранить карточку').click()
  await expect(form.getByRole('alert')).toHaveText('Укажите фактическую дату выхода')
  await form.getByLabel('Фактическая дата выхода').fill('2026-11-25')
  await form.getByLabel('Следующий шаг').fill('Собрать первые комментарии')
  await saveCard(page)
  await button(form, 'К обзору').click()
  await expect(overview.getByRole('combobox', { name: 'Проект' })).toHaveValue(project)
  await expect(overview.getByRole('combobox', { name: 'Период' })).toHaveValue('Последние 7 дней')
  await expect(row.getByRole('cell')).toHaveText(['1', '0', '1'])
  await expect(overdue.getByText('Пропущена дата выхода')).toHaveCount(0)
  await expect(button(overdue, second)).toBeVisible()
  await record(page, 'overview-past-after', overview)
  await choice(page, overview, 'Период', 'Ближайшие 7 дней')
  await expect(row.getByRole('cell')).toHaveText(['1', '1', '0'])
  await expect(button(overview.getByRole('region', { name: 'Ближайшие публикации' }), second)).toBeVisible()
  await record(page, 'overview-next', overview)
  const rows = await storedCards(page)
  expect(rows.find(item => item.title === first)).toMatchObject({
    status: 'Опубликовано', plannedDate: '2026-11-24', publishedDate: '2026-11-25', nextStep: 'Собрать первые комментарии',
  })
  if (evidence) await writeFile(evidenceDir + '/overview-indexeddb.json', JSON.stringify(rows, null, 2))
})
