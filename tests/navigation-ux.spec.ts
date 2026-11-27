import { expect, test } from '@playwright/test'
import { createServer, type ViteDevServer } from 'vite'

let server: ViteDevServer
let url: string
test.beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: true, ws: false } })
  await server.listen()
  url = server.resolvedUrls!.local[0]
})
test.afterAll(async () => { await server.close() })

test('быстрый выбор площадки и навигация проекта', async ({ page }) => {
  await page.goto(url + '?mode=demo')
  await page.getByRole('heading', { name: 'Городской сад' }).locator('..').getByRole('button', { name: 'Открыть проект' }).click()
  await page.getByRole('button', { name: 'Показать Telegram' }).click()
  await expect(page.getByRole('button', { name: 'Показать Telegram' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Три совета по уходу за рассадой' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Показать все площадки' }).click()
  await expect(page.getByRole('button', { name: 'Три совета по уходу за рассадой' })).toBeVisible()
  await page.getByRole('button', { name: 'Три совета по уходу за рассадой' }).click()
  await expect(page.getByRole('dialog', { name: 'Карточка' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Карточка' }).getByRole('button', { name: 'К плану' }).click()
  await page.getByRole('button', { name: 'Ещё' }).click()
  await page.getByRole('menuitem', { name: 'Выбрать шаблон' }).click()
  await expect(page.getByRole('dialog', { name: 'Шаблоны' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Доска' }).click()
  await expect(page.getByText('Следующий шаг: Проверить обложку')).toBeVisible()
  await page.getByRole('button', { name: 'Перейти к аналитике' }).click()
  await expect(page.getByRole('heading', { name: 'Аналитика' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Навигация проекта' }).getByRole('button', { name: 'Все проекты' }).click()
  await expect(page.getByRole('heading', { name: 'Проекты' })).toBeVisible()
})
