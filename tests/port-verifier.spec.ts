import { test, expect, chromium } from '@playwright/test'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'

const node = process.execPath
async function freePort() { const s = createServer(); await new Promise<void>(r => s.listen(0, '127.0.0.1', r)); const p = (s.address() as import('node:net').AddressInfo).port; await new Promise<void>(r => s.close(() => r())); return p }
async function start(args: string[]) {
 const p = spawn(node, ['scripts/start.mjs', ...args], { stdio: ['ignore', 'pipe', 'pipe'] }); let output = ''
 p.stdout.on('data', x => { output += x }); p.stderr.on('data', x => { output += x })
 const deadline = Date.now() + 20000
 while (!output.includes('http://127.0.0.1:') && p.exitCode === null && Date.now() < deadline) await new Promise(r => setTimeout(r, 100))
 if (!output.includes('http://127.0.0.1:')) { p.kill(); throw new Error('server did not start: ' + output) }
 return { p, output }
}
async function stop(p: ReturnType<typeof spawn>) { if (p.exitCode === null) { p.kill(); await new Promise(r => p.once('exit', r)) } }
test('explicit port, isolation notice, occupied port and persisted project', async ({}, info) => {
 const port = await freePort(); let server = await start(['--port', String(port)]); console.log('START', server.output.trim())
 try {
  const occupied = spawnSync(node, ['scripts/start.mjs', '--port', String(port)], { encoding:'utf8', timeout: 15000 }); console.log('OCCUPIED', occupied.status, (occupied.stderr + occupied.stdout).trim()); expect(occupied.status).toBe(1); expect(occupied.stderr).toContain(`Порт ${port} занят или недоступен`)
  const profile = info.outputPath('independent-profile'); let ctx = await chromium.launchPersistentContext(profile)
  let page = await ctx.newPage(); await page.goto(`http://127.0.0.1:${port}/`); await expect(page.getByText('Открыт другой адрес')).toBeVisible(); await expect(page.getByText(/Проекты с адреса 127.0.0.1:3000 здесь автоматически не появятся/)).toBeVisible()
  console.log('NOTICE', (await page.getByRole('main').innerText()).slice(0, 300)); await page.getByRole('button', {name:'Создать проект'}).click(); await page.getByLabel('Название', {exact:true}).fill('Вымышленный проект Проверка порта'); await page.getByRole('button', {name:'Сохранить проект'}).click(); await expect(page.getByRole('heading', {name:'Вымышленный проект Проверка порта'})).toBeVisible(); await ctx.close(); await stop(server.p)
  server = await start(['--port', String(port)]); ctx = await chromium.launchPersistentContext(profile); page = await ctx.newPage(); await page.goto(`http://127.0.0.1:${port}/`); await expect(page.getByRole('heading', {name:'Вымышленный проект Проверка порта'})).toBeVisible(); console.log('RESTART SCREEN', (await page.getByRole('main').innerText()).slice(0, 700)); await ctx.close()
 } finally { await stop(server.p) }
})
test('invalid arguments rejected', () => { for (const args of [['--port'], ['--port','0'], ['--port','65536'], ['--port','abc'], ['--bad'], ['--port','3001','extra']]) { const result = spawnSync(node, ['scripts/start.mjs', ...args], {encoding:'utf8', timeout: 15000}); console.log('INVALID', JSON.stringify(args), result.status, result.stderr.trim()); expect(result.status).toBe(1); expect(result.stderr).toContain('Укажите порт числом от 1 до 65535') } })
