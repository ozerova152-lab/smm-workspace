import { createServer } from 'vite'

const host = '127.0.0.1'
const port = 3000
const server = await createServer({ server: { host, port, strictPort: true } })

try {
  await server.listen()
  server.printUrls()
} catch (error) {
  if (error?.code === 'EADDRINUSE' || error?.message === `Port ${port} is already in use`) {
    console.error(`Порт ${port} занят. Если SMM Workspace уже запущен, откройте http://${host}:${port}/. Для нового запуска сначала освободите порт.`)
  } else {
    console.error(error)
  }
  await server.close()
  process.exitCode = 1
}
