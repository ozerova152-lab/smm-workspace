import { chromium, expect, test, type Locator, type Page } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'
import type { AnalyticsSnapshot } from '../src/lib/analytics'

const evidenceDir = 'docs/tasks/artifacts/T03'
const evidence = process.env.T03_EVIDENCE === '1'
const now = new Date(2026, 10, 25, 12)
const project = 'Редакция «Теплица»'
const idea = 'Сезон в теплице'
const metric = 'Просмотры'
const definition = 'Просмотры | показов | Первая неделя'
const hypothesis = 'Короткие выпуски повышают число просмотров за неделю'
const selectedReference = { note: 'Сюжет про зелень', url: 'https://example.test/reference/greens' }
const excludedReference = { note: 'Неподходящая подборка', url: 'https://example.test/reference/other' }
const publications = [
  { name: 'Первые ростки', externalId: 'show-1', link: 'https://example.test/show/1' },
  { name: 'Выбор почвы', externalId: 'shared-show', link: 'https://example.test/show/2' },
  { name: 'Сроки посадки', externalId: 'shared-show', link: 'https://example.test/show/3' },
]

const button = (area: Page | Locator, name: string) => area.getByRole('button', { name, exact: true })
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true })
const card = (page: Page) => dialog(page, 'Карточка')

async function startServer(port = 0) {
  const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true, ws: false } })
  await server.listen()
  const address = server.resolvedUrls?.local[0]
  if (!address) throw new Error('Vite did not report a test URL')
  expect(new URL(address).port).not.toBe('3000')
  return { server, address }
}

async function capture(page: Page, name: string, area = page.getByRole('main')) {
  if (!evidence) return
  await page.screenshot({ path: evidenceDir + '/' + name + '.png' })
  await writeFile(evidenceDir + '/' + name + '.txt', await area.ariaSnapshot() + '\n')
}

async function dataEvidence(name: string, value: unknown) {
  if (evidence) await writeFile(evidenceDir + '/' + name + '.json', JSON.stringify(value, null, 2) + '\n')
}

async function openApp(page: Page, address: string) {
  await page.clock.setFixedTime(now)
  await page.goto(address)
}

async function openProject(page: Page) {
  const projectCard = page.getByRole('heading', { name: project, exact: true }).locator('..')
  await button(projectCard, 'Открыть проект').click()
  await expect(page.getByRole('heading', { name: 'Контент-план' })).toBeVisible()
}

async function choose(page: Page, area: Page | Locator, label: string, option: string) {
  await area.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function saveCard(page: Page) {
  const save = button(card(page), 'Сохранить карточку')
  await save.click()
  await expect(save).toBeEnabled()
  await expect(card(page).getByRole('alert')).toHaveCount(0)
}

async function createProject(page: Page) {
  await button(page, 'Создать проект').click()
  await page.getByLabel('Название', { exact: true }).fill(project)
  await button(page, 'Сохранить проект').click()
  await button(page, 'Добавить площадку').click()
  await choose(page, page, 'Каталог площадок', 'YouTube')
  await page.getByLabel('Метрики').fill(definition + '\nПодписчики | человек')
  await button(page, 'Сохранить площадку').click()
  await expect(page.getByRole('heading', { name: 'YouTube', exact: true })).toBeVisible()
  await button(page, 'К проекту').click()
  await button(page, 'Добавить идею').click()
  await card(page).getByLabel('Заголовок').fill(idea)
  await saveCard(page)
  for (const [index, item] of publications.entries()) {
    if (index) await button(page, idea).click()
    const form = card(page)
    await button(form, 'Добавить адаптацию').click()
    await form.getByLabel('Заголовок').fill(item.name)
    await choose(page, form, 'Площадка', 'YouTube')
    await choose(page, form, 'Формат', 'Видео')
    await choose(page, form, 'Статус', 'Опубликовано')
    await form.getByLabel('Фактическая дата выхода').fill('2026-11-18')
    await form.getByLabel('Ссылка', { exact: true }).fill(item.link)
    await form.getByLabel('Внешний ID публикации').fill(item.externalId)
    await saveCard(page)
    await button(form, 'К плану').click()
  }
}

async function readStoredAnalytics(page: Page) {
  return page.evaluate(() => new Promise<AnalyticsSnapshot>((resolve, reject) => {
    const open = indexedDB.open('smm-workspace')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const database = open.result
      const transaction = database.transaction('workspace')
      const request = transaction.objectStore('workspace').get('analytics')
      transaction.oncomplete = () => { database.close(); resolve(request.result) }
      transaction.onabort = () => { database.close(); reject(transaction.error) }
    }
  }))
}

async function addReference(page: Page, item: typeof selectedReference) {
  await button(page, 'Добавить референс').click()
  const form = dialog(page, 'Добавить референс')
  await form.getByLabel('Ссылка').fill(item.url)
  await form.getByLabel('Заметка').fill(item.note)
  await button(form, 'Сохранить референс').click()
  await expect(page.getByRole('link', { name: item.url, exact: true })).toHaveAttribute('href', item.url)
}

async function manualMeasurement(page: Page) {
  await button(page, 'Внести метрику').click()
  const form = dialog(page, 'Внести метрику')
  await choose(page, form, 'Объект замера', publications[0].name)
  await expect(form.getByRole('combobox', { name: 'Метрика' })).toHaveValue(metric)
  await expect(form.getByText('Единица: показов')).toBeVisible()
  await expect(form.getByText('Настроенное окно: Первая неделя')).toBeVisible()
  await form.getByLabel('Значение').fill('-1')
  await button(form, 'Сохранить метрику').click()
  await expect(form.getByRole('alert')).toHaveText('Укажите неотрицательное число')
  await form.getByLabel('Значение').fill('25')
  await form.getByLabel('Источник').fill('Вымышленный отчёт')
  await form.getByLabel('Дата замера или начало окна').fill('2026-11-18')
  await form.getByLabel('Конец окна').fill('2026-11-24')
  await capture(page, 'manual-metric', form)
  await button(form, 'Сохранить метрику').click()
  await expect(page.getByText('Замер сохранён', { exact: true })).toBeVisible()
}

async function upload(page: Page, form: Locator, csv: string) {
  const file = page.waitForEvent('filechooser')
  await form.getByLabel('Выбрать CSV').click()
  await (await file).setFiles({ name: 'analytics-test.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
}

test('T03: analytics survives restart, imports atomically and exports selected data', async () => {
  test.setTimeout(90_000)
  if (evidence) await mkdir(evidenceDir, { recursive: true })
  const profile = test.info().outputPath('analytics-profile')
  let host = await startServer()
  try {
    const session = await chromium.launchPersistentContext(profile)
    try {
      const page = await session.newPage()
      await openApp(page, host.address)
      await expect(page.getByText('Добавьте первый проект')).toBeVisible()
      await createProject(page)
      await button(page, publications[0].name).click()
      await expect(card(page).getByText('Ожидает данных', { exact: true })).toBeVisible()
      await button(card(page), 'Открыть аналитику').click()
      await manualMeasurement(page)
      await addReference(page, selectedReference)
      await addReference(page, excludedReference)
      await button(page, 'К контент-плану').click()
      await page.getByRole('button', { name: 'Ещё' }).click()
      await page.getByRole('menuitem', { name: 'Стратегия', exact: true }).click()
      const strategy = dialog(page, 'Стратегия')
      await strategy.getByLabel('Гипотеза').fill(hypothesis)
      await button(strategy, 'Сохранить заметку').click()
      await expect(strategy).toBeHidden()
    } finally {
      await session.close()
    }

    await host.server.close()
    host = await startServer(Number(new URL(host.address).port))
    const sessionAfterRestart = await chromium.launchPersistentContext(profile)
    try {
      const page = await sessionAfterRestart.newPage()
      await openApp(page, host.address + '?state=metrics-error')
      await openProject(page)
      await page.getByRole('button', { name: 'Ещё' }).click()
      await page.getByRole('menuitem', { name: 'Стратегия', exact: true }).click()
      const strategy = dialog(page, 'Стратегия')
      await expect(strategy.getByLabel('Гипотеза')).toHaveValue(hypothesis)
      await capture(page, 'strategy-after-restart', strategy)
      await page.keyboard.press('Escape')
      await button(page, publications[0].name).click()
      await expect(card(page).getByText('Обновлено', { exact: true })).toBeVisible()
      await expect(card(page).getByRole('row').last()).toContainText('25 показов')
      await capture(page, 'card-after-restart', card(page))
      await button(card(page), 'Открыть аналитику').click()
      await expect(page.getByRole('link', { name: selectedReference.url, exact: true })).toHaveAttribute('href', selectedReference.url)
      await expect(page.getByRole('row').last()).toContainText('25 показов')
      await capture(page, 'analytics-after-restart')
      await button(page, 'Внести метрику').click()
      const manual = dialog(page, 'Внести метрику')
      await expect(manual.getByText('Единица: показов')).toBeVisible()
      await expect(manual.getByText('Настроенное окно: Первая неделя')).toBeVisible()
      await page.keyboard.press('Escape')

      const before = await readStoredAnalytics(page)
      expect(before.measurements).toHaveLength(1)
      await dataEvidence('indexeddb-before-import', before)
      const [template] = await Promise.all([page.waitForEvent('download'), button(page, 'Скачать шаблон CSV').click()])
      const header = (await readFile((await template.path())!, 'utf8')).split(/\r?\n/)[0]
      expect(header).toBe('platform_id,publication_id,metric,value,window_start,window_end,source')
      await button(page, 'Импортировать CSV').click()
      const importer = dialog(page, 'Импорт CSV')
      const csvRow = (reference: string, value: string, end = '2026-11-24') =>
        ['', reference, metric, value, '2026-11-18', end, 'Вымышленный отчёт'].join(',')
      await upload(page, importer, [
        header,
        csvRow(publications[0].externalId, '150'),
        csvRow(publications[1].link, '95'),
        csvRow(publications[2].externalId, '80'),
        csvRow(publications[0].externalId, 'wrong'),
        csvRow(publications[0].externalId, '160'),
        csvRow(publications[0].externalId, '300', '2026-11-25'),
        ',,Подписчики,100,2026-11-18,,Вымышленный отчёт',
        ',,Подписчики,112,2026-11-25,,Вымышленный отчёт',
      ].join('\r\n'))
      await expect(importer.getByRole('combobox', { name: 'Публикация для строки 2' })).toHaveValue(publications[0].name)
      await expect(importer.getByRole('combobox', { name: 'Публикация для строки 3' })).toHaveValue(publications[1].name)
      await expect(importer.getByText('Несколько совпадений. Выберите публикацию или пропустите строку')).toBeVisible()
      await expect(importer.getByText('Укажите неотрицательное число')).toBeVisible()
      await expect(importer.getByRole('checkbox', { name: 'Выбрать строку 5' })).toBeDisabled()
      await expect(importer.getByText('Окно: Первая неделя').first()).toBeVisible()
      await expect(importer.getByText('Просмотры: 150 показов')).toBeVisible()
      await choose(page, importer, 'Публикация для строки 4', publications[2].name)
      const save = button(importer, 'Сохранить выбранные строки')
      await expect(save).toBeDisabled()
      const consent = importer.getByRole('checkbox', { name: 'Подтвердить замену совпадающих замеров' })
      await consent.check()
      await capture(page, 'csv-preview', importer)
      await save.click()
      await expect(importer.getByRole('alert')).toHaveText('Не удалось сохранить метрики. Повторите попытку')
      await expect(importer.getByRole('checkbox', { name: 'Выбрать строку 4' })).toBeChecked()
      await expect(importer.getByRole('checkbox', { name: 'Выбрать строку 6' })).toBeChecked()
      await expect(consent).toBeChecked()
      const afterError = await readStoredAnalytics(page)
      expect(afterError).toEqual(before)
      await dataEvidence('indexeddb-after-failed-import', afterError)
      await capture(page, 'csv-aborted', importer)
      await save.click()
      await expect(importer).toBeHidden()
      await expect(page.getByText('Принято строк: 7. Пропущено: 1.')).toBeVisible()
      const afterImport = await readStoredAnalytics(page)
      expect(afterImport.measurements.map(item => item.value).sort((a, b) => a - b)).toEqual([80, 95, 100, 112, 160, 300])
      await dataEvidence('indexeddb-after-import', afterImport)
      await page.getByLabel('Начало периода').fill('2026-11-18')
      await expect(page.getByText('Вымышленный отчёт: +12', { exact: true })).toBeVisible()
      await page.getByLabel('Начало периода').fill('2026-11-19')
      await expect(page.getByText('Вымышленный отчёт: Нет данных', { exact: true })).toBeVisible()
      await page.getByLabel('Начало периода').fill('2026-11-18')
      const visibleMeasurements = page.getByRole('table', { name: 'Замеры', exact: true }).getByRole('row').filter({ hasText: metric })
      await expect(visibleMeasurements).toHaveCount(4)
      const comparable = visibleMeasurements.filter({ hasText: '2026-11-18 — 2026-11-24' })
      await expect(comparable).toHaveText([/Первые ростки.*160 показов/, /Выбор почвы.*95 показов/, /Сроки посадки.*80 показов/])
      await capture(page, 'analytics-imported')

      const include = page.getByRole('checkbox', { name: /^Включить:/ })
      for (const control of await include.all()) await control.uncheck()
      await page.getByRole('checkbox', { name: 'Включить: Первые ростки, Просмотры, 2026-11-18 — 2026-11-24' }).check()
      await page.getByRole('checkbox', { name: selectedReference.note }).check()
      const [download] = await Promise.all([page.waitForEvent('download'), button(page, 'Скачать сводку').click()])
      const summary = JSON.parse(await readFile((await download.path())!, 'utf8'))
      expect(summary).toMatchObject({
        platform: 'YouTube', project, period: { from: '2026-11-18', to: '2026-11-25' },
        measurements: [{ publication: publications[0].name, link: publications[0].link, from: '2026-11-18',
          to: '2026-11-24', metric, value: 160, source: 'Вымышленный отчёт', unit: 'показов', window: 'Первая неделя' }],
        references: [selectedReference],
      })
      await dataEvidence('downloaded-summary', summary)

      const report = await readFile('docs/dev/analytics-report-example.md', 'utf8')
      expect(report).toMatch(/\[150\]\(https:\/\/example\.com\/garden\/balcony\)/)
      expect(report).toMatch(/\[95\]\(https:\/\/example\.com\/garden\/seedlings\)/)
      const reportIdea = report.match(/\*\*Идея для плана\*\* — «([^»]+)»/)?.[1]
      const reportContent = report.match(/\*\*Содержание\*\* — ([^\r\n]+)/)?.[1]
      expect(reportIdea).toBeTruthy()
      expect(reportContent).toBeTruthy()
      await button(page, 'К контент-плану').click()
      await button(page, 'Добавить идею').click()
      await card(page).getByLabel('Заголовок').fill(reportIdea!)
      await card(page).getByLabel('Содержание').fill(reportContent!)
      await saveCard(page)
      await button(card(page), 'К плану').click()
      await button(page, reportIdea!).click()
      await expect(card(page).getByLabel('Содержание')).toHaveValue(reportContent!)
      await capture(page, 'report-idea-in-plan', card(page))
      await button(card(page), 'К плану').click()
      await button(page, publications[0].name).click()
      await button(card(page), 'Убрать из плана').click()
      await expect(button(page, publications[0].name)).toHaveCount(0)
      await page.getByRole('button', { name: 'Ещё' }).click()
      await page.getByRole('menuitem', { name: 'Архив', exact: true }).click()
      await button(page, publications[0].name).click()
      await expect(card(page).getByText('Обновлено', { exact: true })).toBeVisible()
      await expect(card(page).getByText('160 показов', { exact: true })).toBeVisible()
      await capture(page, 'archived-measurements', card(page))
    } finally {
      await sessionAfterRestart.close()
    }
    await host.server.close()
    host = await startServer(Number(new URL(host.address).port))
    const finalSession = await chromium.launchPersistentContext(profile)
    try {
      const finalPage = await finalSession.newPage()
      await openApp(finalPage, host.address)
      const persisted = await readStoredAnalytics(finalPage)
      expect(persisted.measurements.map(item => item.value).sort((a, b) => a - b)).toEqual([80, 95, 100, 112, 160, 300])
    } finally {
      await finalSession.close()
    }
  } finally {
    await host.server.close()
  }
})
