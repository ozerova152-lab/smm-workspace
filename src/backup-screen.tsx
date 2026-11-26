import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, FileInput, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { backupSummary, type WorkspaceBackup } from './lib/stubs/backup'
import type { createWorkspaceStub } from './lib/stubs/workspace'

type Workspace = ReturnType<typeof createWorkspaceStub>
type Counts = ReturnType<typeof backupSummary>

function CountsText({ counts }: { counts: Counts }) {
  return <Text>Проектов: {counts.projects} · Карточек: {counts.cards} · Замеров: {counts.measurements}</Text>
}

export function BackupScreen({ workspace, back }: { workspace: Workspace; back: () => void }) {
  const [current, setCurrent] = useState<Counts>()
  const [countsFailed, setCountsFailed] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<WorkspaceBackup | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState<'export' | 'preview' | 'restore' | null>(null)
  const [error, setError] = useState('')
  const [restored, setRestored] = useState(false)
  const locked = useRef(false)
  const hasCurrent = !!current && (current.projects > 0 || current.cards > 0 || current.measurements > 0)
  useEffect(() => {
    let active = true
    void workspace.backupCounts().then(counts => {
      if (active) setCurrent(counts)
    }, () => {
      if (active) setCountsFailed(true)
    })
    return () => { active = false }
  }, [workspace])

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<void>, message: string) {
    if (locked.current) return
    locked.current = true
    setBusy(kind)
    setError('')
    try { await action() } catch { setError(message) }
    finally { locked.current = false; setBusy(null) }
  }

  function download() {
    void run('export', async () => {
      const text = await workspace.exportBackup()
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'smm-workspace-backup-' + new Date().toLocaleDateString('sv-SE') + '.json'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'Не удалось скачать копию. Повторите попытку.')
  }

  function choose(next: File | null) {
    if (locked.current) return
    setFile(next); setConfirmed(false); setPreview(null); setRestored(false); setError('')
    if (next) void run('preview', async () => {
      if (next.size > 20_000_000) throw new Error('Backup exceeds limit')
      setPreview(await workspace.previewBackup(await next.text()))
    }, 'Файл не подходит. Выберите копию SMM Workspace')
  }

  function restore() {
    if (!current || !preview || (hasCurrent && !confirmed)) return
    void run('restore', async () => {
      setCurrent(await workspace.restoreBackup(preview))
      setPreview(null); setConfirmed(false); setFile(null); setRestored(true)
    }, 'Не удалось восстановить данные. Текущие данные сохранены. Повторите попытку.')
  }

  const message = busy === 'export' ? 'Готовим копию…' : busy === 'preview' ? 'Проверяем копию…' : 'Восстанавливаем данные…'

  return <Stack gap="md">
    <Title order={2}>Резервная копия</Title>
    <Paper withBorder p="md"><Stack gap="sm" align="start">
      <Title order={3} size="h5">Текущие данные</Title>
      {current ? <CountsText counts={current} /> : countsFailed
        ? <Alert color="red" role="alert">Не удалось прочитать текущие данные</Alert>
        : <Text role="status">Загружаем текущие данные…</Text>}
      <Button onClick={download} disabled={!!busy} loading={busy === 'export'}>Скачать копию</Button>
    </Stack></Paper>
    <Paper withBorder p="md"><Stack gap="sm">
      <Title order={3} size="h5">Восстановление</Title>
      <FileInput label="Выбрать файл" placeholder="Выберите файл резервной копии" accept=".json,application/json"
        value={file} onChange={choose} clearable disabled={!!busy || !current} />
      {preview && <>
        <Text fw={600}>В файле резервной копии</Text>
        <CountsText counts={backupSummary(preview)} />
        {hasCurrent && <Alert color="orange">
          <Text size="sm">Восстановление заменит текущие данные. Чтобы сохранить их, сначала нажмите «Скачать копию».</Text>
          <Checkbox mt="xs" label="Подтверждаю замену текущих данных" checked={confirmed} disabled={!!busy}
            onChange={event => setConfirmed(event.currentTarget.checked)} />
        </Alert>}
        <Group>
          <Button color="orange" onClick={restore} disabled={!!busy || (hasCurrent && !confirmed)} loading={busy === 'restore'}>Восстановить данные</Button>
          <Button variant="subtle" onClick={() => choose(null)} disabled={!!busy}>Отмена</Button>
        </Group>
      </>}
      {busy && <Text role="status">{message}</Text>}
      {error && <Alert color="red" role="alert">{error}</Alert>}
      {restored && <Alert color="teal" role="status">Данные восстановлены</Alert>}
    </Stack></Paper>
    <Button variant="subtle" className="launch-back" onClick={back} disabled={!!busy}>Открыть проекты</Button>
  </Stack>
}
