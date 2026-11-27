import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Container, Group, Loader, Paper, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import { ArrowLeft, ArrowRight, FolderPlus, Orbit } from 'lucide-react'
import { platformCatalog, type Platform, type Project } from './lib/stubs/workspace'
import { createWorkspace } from './lib/workspace'
import { metricDefinitions, type MetricDefinition } from './lib/project-records'
import { platformIdeas, type ContentCard } from './lib/content-records'
import { SpaceScene } from './space-scene'
import { ContentPlan } from './content-plan'
import { WorkOverview } from './work-overview'
import { AnalyticsScreen } from './analytics-screen'
import { BackupScreen } from './backup-screen'

const params = new URLSearchParams(window.location.search)
const publicDemo = import.meta.env.MODE === 'demo'
if (publicDemo) {
  params.set('mode', 'demo')
  params.delete('state')
}
const demo = params.get('mode') === 'demo'
const workspace = createWorkspace(params)
type PlanView = { name: 'project'; project?: Project } | { name: 'platform'; project: Project; platform?: Platform } | { name: 'calendar'; project: Project; platform: Platform; initialCardId?: string; showTemplates?: boolean }
type View = { name: 'dashboard' } | { name: 'backup' } | PlanView | { name: 'analytics'; project: Project; platformId?: string; previous: PlanView }

export function FirstLaunch() {
  const [view, setView] = useState<View>({ name: 'dashboard' })
  const previous = useRef(view.name)
  const handle = useRef<HTMLElement>(null)
  function openAnalytics(previous: PlanView, platformId?: string) {
    if (previous.project) setView({ name: 'analytics', project: previous.project, platformId, previous })
  }

  useEffect(() => {
    if (previous.current !== view.name) handle.current?.focus()
    previous.current = view.name
  }, [view.name])

  return (
    <div className="workspace-preview first-launch">
      <SpaceScene />
      <Container component="main" size="lg" className="launch-main">
        <Stack gap="xl">
          {!demo && window.location.hostname === '127.0.0.1' && window.location.port !== '3000' && <Alert role="status" color="orange" title="Открыт другой адрес">
            Проекты с адреса 127.0.0.1:3000 здесь автоматически не появятся. Для переноса скачайте резервную копию на прежнем адресе и восстановите её здесь. Используйте этот же адрес при следующем запуске.
          </Alert>}
          <Group gap="sm">
            <span className="workspace-mark" aria-hidden="true"><Orbit size={24} /></span>
            <Title order={1} size="h3">SMM Workspace</Title>
            {demo && <Badge variant="light">Демо</Badge>}
          </Group>
          {'project' in view && view.project && <Group component="nav" aria-label="Навигация проекта" gap="xs">
            <Button variant="light" size="xs" onClick={() => setView({ name: 'dashboard' })}>Все проекты</Button>
            <Button variant={view.name === 'project' ? 'filled' : 'light'} size="xs"
              onClick={() => setView({ name: 'project', project: view.project })}>Контент-план</Button>
            <Button variant={view.name === 'platform' ? 'filled' : 'light'} size="xs"
              onClick={() => setView({ name: 'platform', project: view.project! })}>Площадки</Button>
            <Button aria-label="Перейти к аналитике" variant={view.name === 'analytics' ? 'filled' : 'light'} size="xs"
              onClick={() => setView({ name: 'analytics', project: view.project!, previous: { name: 'project', project: view.project! } })}>Аналитика</Button>
          </Group>}
          {view.name !== 'dashboard' && view.name !== 'analytics' && view.name !== 'backup' && (
            <Button variant="subtle" className="launch-back" leftSection={<ArrowLeft size={16} aria-hidden />}
              onClick={() => setView(view.name === 'calendar'
                ? { name: 'platform', project: view.project, platform: view.platform }
                : view.name === 'platform'
                  ? { name: 'project', project: view.project }
                  : { name: 'dashboard' })}>
              {view.name === 'calendar' ? 'К площадке' : view.name === 'platform' ? 'К проекту' : 'К проектам'}
            </Button>
          )}
          <section tabIndex={-1} ref={handle} className="launch-content">
            {view.name === 'dashboard' && <Dashboard open={project => setView({ name: 'project', project })}
              openBackup={() => setView({ name: 'backup' })} />}
            {view.name === 'backup' && <BackupScreen workspace={workspace} back={() => setView({ name: 'dashboard' })} />}
            {view.name === 'project' && <ProjectScreen project={view.project}
              saved={project => setView({ name: 'project', project })}
              analytics={platformId => openAnalytics(view, platformId)}
              open={(project, platform) => setView({ name: 'platform', project, platform })} />}
            {view.name === 'platform' && <PlatformScreen key={view.platform?.id ?? view.project.id} view={view}
              saved={platform => setView({ name: 'platform', platform, project: { ...view.project, platforms: view.project.platforms.some(item => item.id === platform.id)
                ? view.project.platforms.map(item => item.id === platform.id ? platform : item)
                : [...view.project.platforms, platform] } })}
              analytics={platform => openAnalytics(view, platform.id)}
              openPlan={(platform, options) => setView({ name: 'calendar', project: view.project, platform, ...options })} />}
            {view.name === 'calendar' && <ContentPlan key={view.platform.id} project={view.project} workspace={workspace} initialPlatformId={view.platform.id} initialCardId={view.initialCardId} showTemplates={view.showTemplates} openAnalytics={platformId => openAnalytics(view, platformId)} />}
            {view.name === 'analytics' && <AnalyticsScreen project={view.project} workspace={workspace} demo={demo}
              platformId={view.platformId} back={() => setView(view.previous.name === 'platform' ? { name: 'project', project: view.project } : view.previous)} />}
          </section>
        </Stack>
      </Container>
    </div>
  )
}

function Dashboard({ open, openBackup }: { open: (project?: Project) => void; openBackup: () => void }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [attempt, setAttempt] = useState(0)
  const latest = useRef<ReturnType<typeof workspace.listProjects> | undefined>(undefined)
  const lastAttempt = useRef(-1)

  useEffect(() => {
    let active = true
    if (lastAttempt.current !== attempt) {
      latest.current = workspace.listProjects()
      lastAttempt.current = attempt
    }
    void latest.current?.then(
      value => { if (active) { setProjects(value); setStatus('ready') } },
      () => { if (active) setStatus('error') },
    )
    return () => { active = false }
  }, [attempt])

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="start">
        <Title order={2}>Проекты</Title>
        {status === 'ready' && <Group gap="xs">
          {!demo && <Button variant="subtle" onClick={openBackup}>Резервная копия</Button>}
          <Button leftSection={<FolderPlus size={17} aria-hidden />} onClick={() => open()}>Создать проект</Button>
        </Group>}
      </Group>
      {status === 'loading' && <Group role="status"><Loader size="sm" /><Text>Загружаем проекты…</Text></Group>}
      {status === 'error' && <Alert color="red" role="alert">
        <Stack align="start"><Text>Не удалось открыть проекты. Повторите попытку</Text>
          <Button variant="light" onClick={() => { setStatus('loading'); setAttempt(attempt + 1) }}>Повторить попытку</Button></Stack>
      </Alert>}
      {status === 'ready' && (projects.length === 0
        ? <Paper withBorder p="xl">
          <Title order={3} size="h4">Добавьте первый проект</Title>
          <Text c="dimmed" mt="xs">Создайте проект для бренда, клиента или своего направления.</Text>
        </Paper>
        : <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {projects.map(project => <Card key={project.id} withBorder padding="lg">
            <Stack gap="xs" align="start">
              <Title order={3} size="h4">{project.name}</Title>
              {project.description && <Text c="dimmed">{project.description}</Text>}
              <Text size="sm">Площадки: {project.platforms.length}</Text>
              <Button variant="light" onClick={() => open(project)}>Открыть проект</Button>
            </Stack>
          </Card>)}
        </SimpleGrid>)}
      {!publicDemo && <Button component="a" href={demo ? './' : '?mode=demo'} variant="subtle" className="launch-back">
        {demo ? 'К рабочему пространству' : 'Открыть пример данных'}
      </Button>}
      {status === 'ready' && projects.length > 0 && <WorkOverview projects={projects} workspace={workspace} />}
    </Stack>
  )
}

function ProjectScreen({ project, saved, open, analytics }: {
  project?: Project
  saved: (project: Project) => void
  open: (project: Project, platform?: Platform) => void
  analytics: (platformId?: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (pending.current) return
    if (!name.trim()) { setError('Введите название проекта'); return }
    pending.current = true
    setSaving(true)
    setError('')
    try { saved(await workspace.saveProject({ name: name.trim(), description: description.trim() })) }
    catch { setError('Не удалось сохранить проект. Повторите попытку') }
    finally { pending.current = false; setSaving(false) }
  }

  if (project) return <Stack gap="lg">
    <Title order={2}>{project.name}</Title>
    {project.description && <Text c="dimmed">{project.description}</Text>}
    <ContentPlan key={project.id} project={project} workspace={workspace} openAnalytics={analytics} />
    <Title order={3} size="h4">Площадки</Title>
    <Stack align="start">
      {project.platforms.map(platform => <Button variant="light" key={platform.id} onClick={() => open(project, platform)}>{platform.name}</Button>)}
      <Button onClick={() => open(project)}>Добавить площадку</Button>
    </Stack>
  </Stack>

  return <Stack gap="lg">
    <Title order={2}>Создать проект</Title>
    <Paper withBorder p="lg" component="form" onSubmit={save} noValidate>
      <Stack align="stretch">
        <TextInput label="Название" aria-label="Название" value={name} maxLength={100} required
          error={error === 'Введите название проекта' ? error : undefined}
          onChange={event => setName(event.currentTarget.value)} disabled={saving} />
        <Textarea label="Описание" value={description} maxLength={500} onChange={event => setDescription(event.currentTarget.value)} disabled={saving} />
        {error && error !== 'Введите название проекта' && <Alert color="red" role="alert">{error}</Alert>}
        {saving && <Text role="status">Сохраняем проект…</Text>}
        <Button type="submit" className="launch-back" loading={saving}>Сохранить проект</Button>
      </Stack>
    </Paper>
  </Stack>
}
const toList = (value: string) => [...new Set(value.split('\n').map(item => item.trim()).filter(Boolean))]

const metricInputHelp = 'По одной на строку. Например: Просмотры | шт. | Первые 7 дней'

function parseMetricDefinitions(value: string) {
  const definitions = new Map<string, MetricDefinition>()
  for (const line of toList(value)) {
    const [name, unit = '', window = '', ...extra] = line.split('|').map(part => part.trim())
    if (!name || extra.length || definitions.has(name)) throw new Error('Проверьте строки метрик. Названия должны быть уникальны')
    definitions.set(name, { name, unit, window })
  }
  return { metrics: [...definitions.keys()], metricDetails: [...definitions.values()] }
}

function formatMetricDefinitions(platform?: Platform) {
  return metricDefinitions(platform)
    .map(({ name, unit, window }) => (unit || window) ? [name, unit, window].join(' | ') : name)
    .join('\n')
}

function PlatformScreen({ view, saved, openPlan, analytics }: {
  view: Extract<View, { name: 'platform' }>
  saved: (platform: Platform) => void
  openPlan: (platform: Platform, options?: { initialCardId?: string; showTemplates?: boolean }) => void
  analytics: (platform: Platform) => void
}) {
  const [selection, setSelection] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [formats, setFormats] = useState('')
  const [metrics, setMetrics] = useState(() => formatMetricDefinitions(view.platform))
  const [editingMetrics, setEditingMetrics] = useState(false)
  const [checklist, setChecklist] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)

  function choose(value: string | null) {
    setSelection(value)
    const preset = platformCatalog.find(item => item.name === value)
    setName(preset?.name ?? '')
    setFormats(preset?.formats.join('\n') ?? '')
    setMetrics(preset?.metrics.join('\n') ?? '')
    setChecklist(preset?.checklist.join('\n') ?? '')
    setError('')
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (pending.current) return
    if (!view.platform && !name.trim()) { setError('Введите название площадки'); return }
    const formatList = toList(formats)
    if (!view.platform && formatList.length === 0) { setError('Добавьте свой формат'); return }
    let definitions: ReturnType<typeof parseMetricDefinitions>
    try { definitions = parseMetricDefinitions(metrics) }
    catch (issue) { setError((issue as Error).message); return }
    pending.current = true
    setSaving(true)
    setError('')
    try {
      const platform = view.platform
        ? await workspace.updatePlatformMetrics(view.project.id, view.platform.id, definitions)
        : await workspace.savePlatform(view.project.id, { name: name.trim(), formats: formatList, checklist: toList(checklist), ...definitions })
      saved(platform)
      setEditingMetrics(false)
    }
    catch { setError('Не удалось сохранить площадку. Повторите попытку') }
    finally { pending.current = false; setSaving(false) }
  }

  const platform = view.platform
  if (platform) return <Stack gap="lg">
    <Text c="dimmed">{view.project.name}</Text>
    <Title order={2}>{platform.name}</Title>
    <Paper withBorder p="lg"><Stack gap="xs">
      <Text fw={600}>Форматы</Text><Group>{platform.formats.map(format => <Badge key={format}>{format}</Badge>)}</Group>
      {platform.metrics.length > 0 && <Text>Метрики: {platform.metrics.join(', ')}</Text>}
      {metricDefinitions(platform).filter(item => item.unit || item.window).map(item => <Text size="sm" key={item.name}>
        {[item.name, item.unit, item.window].filter(Boolean).join(' · ')}
      </Text>)}
      {editingMetrics ? <Stack component="form" onSubmit={save}>
        <Textarea label="Метрики" description={metricInputHelp} value={metrics} disabled={saving} onChange={event => setMetrics(event.currentTarget.value)} />
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <Group>
          <Button type="submit" loading={saving}>Сохранить метрики</Button>
          <Button variant="subtle" disabled={saving} onClick={() => setEditingMetrics(false)}>Отмена</Button>
        </Group>
      </Stack> : <Button variant="light" onClick={() => {
        setMetrics(formatMetricDefinitions(platform))
        setError('')
        setEditingMetrics(true)
      }}>Настроить метрики</Button>}
      {platform.checklist.length > 0 && <Text>Чек-лист: {platform.checklist.join(', ')}</Text>}
    </Stack></Paper>
    <Group>
      <Button rightSection={<ArrowRight size={16} aria-hidden />} onClick={() => openPlan(platform)}>Открыть контент-план</Button>
      <Button variant="light" onClick={() => openPlan(platform, { showTemplates: true })}>Шаблоны</Button>
      <Button variant="light" onClick={() => analytics(platform)}>Аналитика площадки</Button>
    </Group>
    <PlatformIdeas projectId={view.project.id} platformId={platform.id}
      open={card => openPlan(platform, { initialCardId: card.id })} />
  </Stack>

  return <Stack gap="lg">
    <Text c="dimmed">{view.project.name}</Text>
    <Title order={2}>Добавить площадку</Title>
    {view.project.platforms.length > 0 && <Group>
      {view.project.platforms.map(item => <Button key={item.id} variant="light" size="xs" onClick={() => {
        openPlan(item)
      }}>{item.name}</Button>)}
    </Group>}
    <Paper withBorder p="lg" component="form" onSubmit={save} noValidate>
      <Stack>
        <Select label="Каталог площадок" placeholder="Выберите площадку"
          data={[...platformCatalog.map(item => item.name), 'Добавить свою']} value={selection} onChange={choose} disabled={saving} />
        {selection && <>
          <TextInput label="Название площадки" value={name} maxLength={100} withAsterisk disabled={saving} onChange={event => setName(event.currentTarget.value)} />
          <Textarea label="Форматы" placeholder="Добавьте свой формат" description="По одному на строку" value={formats} withAsterisk disabled={saving} onChange={event => setFormats(event.currentTarget.value)} />
          <Textarea label="Метрики" description={metricInputHelp} value={metrics} disabled={saving} onChange={event => setMetrics(event.currentTarget.value)} />
          <Textarea label="Чек-лист" value={checklist} disabled={saving} onChange={event => setChecklist(event.currentTarget.value)} />
          {error && <Alert color="red" role="alert">{error}</Alert>}
          {saving && <Text role="status">Сохраняем площадку…</Text>}
          <Button type="submit" className="launch-back" loading={saving}>Сохранить площадку</Button>
        </>}
      </Stack>
    </Paper>
  </Stack>
}

function PlatformIdeas({ projectId, platformId, open }: {
  projectId: string
  platformId: string
  open: (card: ContentCard) => void
}) {
  const [ideas, setIdeas] = useState<ContentCard[]>([])
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [attempt, setAttempt] = useState(0)
  const request = useRef<{ attempt: number; data: Promise<ContentCard[]> } | undefined>(undefined)

  useEffect(() => {
    let active = true
    if (request.current?.attempt !== attempt) {
      request.current = { attempt, data: workspace.listCards(projectId) }
    }
    void request.current.data.then(
      cards => { if (active) { setIdeas(platformIdeas(cards, platformId)); setState('ready') } },
      () => { if (active) setState('error') },
    )
    return () => { active = false }
  }, [projectId, platformId, attempt])

  return <Paper component="section" withBorder p="lg">
    <Stack gap="xs" align="start">
      <Title order={3} size="h4">Идеи площадки</Title>
      {state === 'loading' && <Text role="status">Загружаем идеи…</Text>}
      {state === 'error' && <Alert color="red" role="alert">
        <Stack align="start">
          <Text>Не удалось открыть идеи. Повторите попытку</Text>
          <Button variant="light" onClick={() => { setState('loading'); setAttempt(attempt + 1) }}>Повторить попытку</Button>
        </Stack>
      </Alert>}
      {state === 'ready' && (ideas.length
        ? ideas.map(card => <Button className="plan-title" variant="subtle" key={card.id} onClick={() => open(card)}>{card.title}</Button>)
        : <Text c="dimmed">У этой площадки пока нет идей</Text>)}
    </Stack>
  </Paper>
}
