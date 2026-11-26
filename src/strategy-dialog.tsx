import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Modal, Stack, Text, TextInput, Textarea } from '@mantine/core'
import type { StrategyNote } from './lib/analytics'
import type { createWorkspaceStub } from './lib/stubs/workspace'

const empty: StrategyNote = { goal: '', audience: '', hypothesis: '', period: '' }
const fields = [
  { key: 'goal', label: 'Цель' },
  { key: 'audience', label: 'Аудитория' },
  { key: 'period', label: 'Период' },
] as const

export function StrategyDialog({ workspace, projectId, close }: { workspace: ReturnType<typeof createWorkspaceStub>; projectId: string; close: () => void }) {
  const [note, setNote] = useState<StrategyNote>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [readError, setReadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    void workspace.readStrategy(projectId).then(
      value => { if (active) setNote(value ?? empty) },
      () => { if (active) setReadError(true) },
    )
    return () => { active = false }
  }, [projectId, workspace, attempt])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!note || saving) return
    setSaving(true); setError(false)
    try { await workspace.writeStrategy(projectId, note); close() }
    catch { setError(true) }
    finally { setSaving(false) }
  }

  return <Modal opened onClose={saving ? () => undefined : close} title="Стратегия">
    {readError ? <Alert color="red" role="alert">
      Не удалось загрузить заметку. <Button variant="subtle" onClick={() => { setReadError(false); setAttempt(value => value + 1) }}>Повторить попытку</Button>
    </Alert> : !note ? <Text role="status">Загружаем заметку…</Text> : <Stack component="form" onSubmit={submit}>
      {fields.map(({ key, label }) => <TextInput key={key} label={label} disabled={saving} value={note[key]}
        onChange={event => setNote({ ...note, [key]: event.currentTarget.value })} />)}
      <Textarea label="Гипотеза" disabled={saving} placeholder="Сохраните первую гипотезу" value={note.hypothesis}
        onChange={event => setNote({ ...note, hypothesis: event.currentTarget.value })} />
      {saving && <Text role="status">Сохраняем заметку…</Text>}
      {error && <Alert color="red" role="alert">Не удалось сохранить заметку. Повторите попытку</Alert>}
      <Button type="submit" loading={saving}>Сохранить заметку</Button>
    </Stack>}
  </Modal>
}
