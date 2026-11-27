import { createServer } from 'vite'

const host = '127.0.0.1'
const args = process.argv.slice(2)
const portIndex = args.indexOf('--port')
const port = portIndex === -1 ? 3000 : Number(args[portIndex + 1])
if ((args.length && (portIndex !== 0 || args.length !== 2)) || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Укажите порт числом от 1 до 65535: npm start -- --port 3001')
  process.exit(1)
}
const server = await createServer({ server: { host, port, strictPort: true } })

try {
  await server.listen()
  server.printUrls()
  if (port !== 3000) {
    console.log('Выбран другой адрес. Проекты с адреса 127.0.0.1:3000 здесь автоматически не появятся. Для переноса используйте резервную копию.')
  }
} catch (error) {
  if (error?.code === 'EADDRINUSE' || error?.code === 'EACCES' || error?.message === `Port ${port} is already in use`) {
    console.error(`Порт ${port} занят или недоступен. Если SMM Workspace уже запущен, откройте http://${host}:${port}/. Для нового запуска сначала освободите порт.`)
    console.error('Для отдельного просмотра можно запустить npm start -- --port 3001. При другом адресе старые проекты автоматически не появятся; используйте резервную копию.')
  } else {
    console.error(error)
  }
  await server.close()
  process.exitCode = 1
}
