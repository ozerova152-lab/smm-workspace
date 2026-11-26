import { useEffect, useRef, useState } from 'react'
import { Alert, Badge, Button, Group, Loader, Paper, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core'
import { CardEditor } from './content-plan'
import { overviewPeriods, type Overview, type OverviewPeriod, type OverviewTask, type Project, type createWorkspaceStub } from './lib/stubs/workspace'

type Workspace = ReturnType<typeof createWorkspaceStub>
const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' })

export function WorkOverview({ projects, workspace }: { projects: Project[]; workspace: Workspace }) {
  const [period, setPeriod] = useState<OverviewPeriod>('around')
  const [projectId, setProjectId] = useState('')
  const [snapshot, setSnapshot] = useState<Overview>()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  const [task, setTask] = useState<OverviewTask | null>(null)
  const request = useRef<{ key: string; result: Promise<Overview> } | undefined>(undefined)

  useEffect(() => {
    let active = true
    const key = JSON.stringify([period, projectId, revision])
    if (request.current?.key !== key) request.current = { key, result: workspace.getOverview(period, projectId) }
    void request.current.result.then(
      data => { if (active) { setSnapshot(data); setState('ready') } },
      () => { if (active) setState('error') },
    )
    return () => { active = false }
  }, [period, projectId, revision, workspace])

  function reload() {
    setState('loading')
    setRevision(current => current + 1)
  }

  const hasActivity = snapshot?.totals.some(row => row.planned || row.published || row.overdue)

  return <Stack component="section" aria-label="Обзор работы" gap="md">
    <Title order={3}>Обзор работы</Title>
    <Paper withBorder p="md">
      <Stack gap="md">
        <Group align="end" gap="sm">
          <Select label="Период" w={{ base: '100%', xs: 260 }} data={overviewPeriods.map(item => ({ value: item.id, label: item.label }))}
            allowDeselect={false} value={period} onChange={value => {
              const next = overviewPeriods.find(item => item.id === value)
              if (next && period !== next.id) { setState('loading'); setPeriod(next.id) }
            }} />
          <Select label="Проект" w={{ base: '100%', xs: 260 }} data={[{ value: '', label: 'Все проекты' }, ...projects.map(project => ({ value: project.id, label: project.name }))]}
            allowDeselect={false} value={projectId} onChange={value => {
              if (value !== null && value !== projectId) { setState('loading'); setProjectId(value) }
            }} />
        </Group>
        {state === 'loading' && <Group role="status"><Loader size="sm" /><Text>Обновляем обзор…</Text></Group>}
        {state === 'error' && <Alert color="red" role="alert"><Stack align="start" gap="xs">
          <Text>Не удалось загрузить обзор. Повторите попытку</Text>
          <Button variant="light" onClick={reload}>Повторить попытку</Button>
        </Stack></Alert>}
        {state === 'ready' && snapshot && <>
          <Table.ScrollContainer minWidth={490}>
            <Table aria-label="Сводка по проектам" verticalSpacing="sm">
              <Table.Thead><Table.Tr>{['Проект', 'Запланировано', 'Опубликовано', 'Просрочено'].map(label => <Table.Th key={label}>{label}</Table.Th>)}</Table.Tr></Table.Thead>
              <Table.Tbody>{snapshot.totals.map(row => <Table.Tr key={row.projectId}>
                <Table.Th scope="row">{row.projectName}</Table.Th>
                <Table.Td>{row.planned}</Table.Td><Table.Td>{row.published}</Table.Td><Table.Td>{row.overdue}</Table.Td>
              </Table.Tr>)}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {!hasActivity && <Group>
            <Text c="dimmed">За этот период задач нет</Text>
            <Button variant="subtle" onClick={() => {
              setPeriod('around'); setProjectId(''); reload()
            }}>Сбросить фильтры</Button>
          </Group>}
        </>}
      </Stack>
    </Paper>
    {state === 'ready' && snapshot && hasActivity && <SimpleGrid cols={{ base: 1, sm: 2 }}>
      <TaskList title="Ближайшие публикации" empty="Нет ближайших публикаций за этот период" tasks={snapshot.upcoming} open={setTask} />
      <TaskList title="Просроченные задачи" empty="Просроченных задач за этот период нет" tasks={snapshot.overdue} open={setTask} />
    </SimpleGrid>}
    {task && <CardEditor key={task.card.id} editor={{ id: task.card.id, draft: task.card }} project={task.project}
      related={[]} close={() => setTask(null)} closeLabel="К обзору" open={() => undefined}
      archived={false} archivePending={false} archiveError={false} save={async (draft, id) => {
        const card = await workspace.saveCard(task.project.id, draft, id)
        setTask({ ...task, card })
        reload()
      }} />}
  </Stack>
}

function TaskList({ title, empty, tasks, open }: { title: string; empty: string; tasks: OverviewTask[]; open: (task: OverviewTask) => void }) {
  return <Paper withBorder p="md" component="section" aria-label={title}>
    <Stack gap="sm">
      <Title order={4}>{title}</Title>
      {!tasks.length && <Text c="dimmed" size="sm">{empty}</Text>}
      {tasks.map(task => {
        const platform = task.project.platforms.find(item => item.id === task.card.platformId)
        return <Paper key={task.card.id} withBorder p="sm">
          <Stack gap={4} align="start">
            <Button className="plan-title" variant="subtle" size="compact-sm" onClick={() => open(task)}>{task.card.title}</Button>
            <Text size="xs" c="dimmed">{[task.project.name, platform?.name, dateFormat.format(new Date(task.date + 'T12:00:00'))].filter(Boolean).join(' · ')}</Text>
            {task.reasons.map(reason => <Badge key={reason} color="orange" variant="light" tt="none">{reason}</Badge>)}
            {task.card.nextStep && <Text size="sm">Следующий шаг: {task.card.nextStep}</Text>}
          </Stack>
        </Paper>
      })}
    </Stack>
  </Paper>
}
