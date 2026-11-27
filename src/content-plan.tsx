import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Alert, Badge, Box, Button, Drawer, Group, List as MantineList, Loader, Menu, Modal, Paper, ScrollArea, Select, SimpleGrid, Stack, Table, Tabs, Text, Textarea, TextInput, Title } from '@mantine/core'
import { CalendarDays, ChevronLeft, ChevronRight, Columns3, List, Plus } from 'lucide-react'
import { CardAnalytics } from './analytics-screen'
import { StrategyDialog } from './strategy-dialog'
import { platformIdeas } from './lib/content-records'
import { cardStatuses, materialKinds, newCard, type CardDraft, type ContentCard, type ContentTemplate, type Project, type createWorkspaceStub } from './lib/stubs/workspace'

type Workspace = ReturnType<typeof createWorkspaceStub>
type Editor = { draft: CardDraft; id?: string }
type View = 'table' | 'board' | 'calendar'
const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', year: 'numeric' })
const monthFormat = new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric' })
const statusColors = ['gray', 'blue', 'violet', 'teal', 'green']

export function ContentPlan({ project, workspace, initialPlatformId, initialCardId, showTemplates, openAnalytics }: {
  project: Project
  workspace: Workspace
  initialPlatformId?: string
  initialCardId?: string
  showTemplates?: boolean
  openAnalytics: (platformId?: string) => void
}) {
  const [cards, setCards] = useState<ContentCard[]>([])
  const [load, setLoad] = useState<'loading' | 'error' | 'ready'>('loading')
  const [retry, setRetry] = useState(0)
  const request = useRef<{ retry: number; data: Promise<ContentCard[]> } | undefined>(undefined)
  const [view, setView] = useState<View>(initialPlatformId && !initialCardId ? 'calendar' : 'table')
  const [platformId, setPlatformId] = useState(initialPlatformId ?? '')
  const [kind, setKind] = useState('')
  const [archived, setArchived] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [templateOpen, setTemplateOpen] = useState(showTemplates ?? false)
  const [strategyOpen, setStrategyOpen] = useState(false)
  const [month, setMonth] = useState(() => new Date())
  const [archiveError, setArchiveError] = useState(false)
  const [archivePending, setArchivePending] = useState(false)

  useEffect(() => {
    let active = true
    if (request.current?.retry !== retry) request.current = { retry, data: workspace.listCards(project.id) }
    void request.current.data.then(
      data => {
        if (!active) return
        setCards(data)
        setLoad('ready')
        const card = data.find(item => item.id === initialCardId && !item.archived)
        if (card) setEditor({ id: card.id, draft: card })
      },
      () => { if (active) setLoad('error') },
    )
    return () => { active = false }
  }, [project.id, retry, workspace, initialCardId])

  const platformName = (id?: string) => project.platforms.find(platform => platform.id === id)?.name ?? '—'
  const linkedIdeaIds = platformId ? new Set(platformIdeas(cards, platformId).map(card => card.id)) : new Set<string>()
  const filtered = cards.filter(card => card.archived === archived &&
    (!archived || card.kind === 'Публикация') &&
    (!platformId || card.platformId === platformId || linkedIdeaIds.has(card.id)) &&
    (!kind || card.kind === kind))
  const sorted = [...filtered].sort((a, b) => (a.plannedDate || a.dueDate || '9999').localeCompare(b.plannedDate || b.dueDate || '9999'))

  async function toggleArchive(card: ContentCard) {
    setArchiveError(false)
    setArchivePending(true)
    try {
      setCards(await workspace.archivePublication(project.id, card.id, !card.archived))
      setEditor(null)
    } catch { setArchiveError(true) }
    finally { setArchivePending(false) }
  }

  async function save(draft: CardDraft, id?: string) {
    const card = await workspace.saveCard(project.id, draft, id)
    setCards(current => [
      ...current.filter(item => item.id !== card.id).map(item => card.kind === 'Публикация' && item.parentId === card.id
        ? { ...item, platformId: card.platformId } : item),
      card,
    ])
    if (card.plannedDate) setMonth(new Date(card.plannedDate + 'T12:00:00'))
    setEditor({ id: card.id, draft: card })
  }

  const activeCard = editor?.id ? cards.find(card => card.id === editor.id) : undefined
  const selectCard = (card: ContentCard) => { setArchiveError(false); setEditor({ id: card.id, draft: card }) }
  const activeView = archived ? 'table' : view
  const visible = activeView === 'calendar'
    ? sorted.filter(card => card.kind === 'Публикация' && card.plannedDate.startsWith(monthKey(month)))
    : sorted

  return <Stack gap="md">
    <Group justify="space-between" align="start">
      <Title order={2}>Контент-план</Title>
      {load === 'ready' && !archived && <Group gap="xs">
        <Menu position="bottom-end" withinPortal>
          <Menu.Target><Button variant="light">Ещё</Button></Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => setStrategyOpen(true)}>Стратегия</Menu.Item>
            <Menu.Item onClick={() => openAnalytics(platformId || undefined)}>Аналитика</Menu.Item>
            <Menu.Item onClick={() => setTemplateOpen(true)}>Выбрать шаблон</Menu.Item>
            <Menu.Item onClick={() => { setArchived(true); setKind('') }}>Архив</Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <Button leftSection={<Plus size={16} aria-hidden />} onClick={() => setEditor({ draft: newCard('Идея', { platformId: platformId || undefined }) })}>Добавить идею</Button>
      </Group>}
    </Group>
    {load === 'loading' && <Group role="status"><Loader size="sm" /><Text>Загружаем план…</Text></Group>}
    {load === 'error' && <Alert role="alert" color="red"><Stack align="start">
      <Text>Не удалось открыть план. Повторите попытку</Text>
      <Button variant="light" onClick={() => { setLoad('loading'); setRetry(retry + 1) }}>Повторить попытку</Button>
    </Stack></Alert>}
    {load === 'ready' && <Paper withBorder p="md" className="content-plan-panel">
      <Stack gap="md">
        <Group justify="space-between" align="end">
          <Group align="end" gap="sm">
            {!archived && <Select label="Тип работы" value={kind} onChange={value => setKind(value ?? '')}
              data={[{ value: '', label: 'Все типы' }, ...['Идея', 'Публикация', ...materialKinds].map(value => ({ value, label: value }))]} allowDeselect={false} />}
          </Group>
          {archived && <Button variant="subtle" onClick={() => { setArchived(false); setKind('') }}>Вернуться к плану</Button>}
        </Group>
        {archived
          ? <Title order={3} size="h4">Архив публикаций</Title>
          : <Tabs value={view} onChange={value => { if (value === 'table' || value === 'board' || value === 'calendar') setView(value) }}>
            <Tabs.List>
              <Tabs.Tab value="table" leftSection={<List size={15} aria-hidden />}>Таблица</Tabs.Tab>
              <Tabs.Tab value="board" leftSection={<Columns3 size={15} aria-hidden />}>Доска</Tabs.Tab>
              <Tabs.Tab value="calendar" leftSection={<CalendarDays size={15} aria-hidden />}>Календарь</Tabs.Tab>
            </Tabs.List>
          </Tabs>}
        <Group gap="xs" className="project-platform-picker" aria-label="Площадки проекта">
          {[{ id: '', name: 'Все площадки' }, ...project.platforms].map(platform => <Button
            key={platform.id || 'all'} size="xs" variant={platformId === platform.id ? 'filled' : 'light'}
            aria-label={platform.id ? 'Показать ' + platform.name : 'Показать все площадки'}
            aria-pressed={platformId === platform.id}
            onClick={() => setPlatformId(platform.id)}>{platform.name}</Button>)}
        </Group>
        {archiveError && !editor && <Alert color="red" role="alert">Не удалось обновить архив. Повторите попытку.</Alert>}
        {activeView === 'calendar' && <PlanCalendar month={month} setMonth={setMonth} cards={visible} open={selectCard} />}
        {activeView === 'table' && visible.length > 0 && <Text size="xs" c="dimmed" className="plan-scroll-hint">Прокрутите таблицу вбок, чтобы увидеть все столбцы</Text>}
        {activeView === 'table' && visible.length > 0 && <Table.ScrollContainer minWidth={710}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead><Table.Tr>{['Дата выхода', 'Тема', 'Площадка', 'Формат', 'Статус', 'Следующий шаг', ...(archived ? ['Действие'] : [])].map(label => <Table.Th key={label}>{label}</Table.Th>)}</Table.Tr></Table.Thead>
            <Table.Tbody>{visible.map(card => <Table.Tr key={card.id}>
              <Table.Td>{formatDate(card.plannedDate)}</Table.Td>
              <Table.Td><Button variant="subtle" size="compact-sm" onClick={() => selectCard(card)} className="plan-title">{card.title}</Button><Text size="xs" c="dimmed">{card.kind}</Text></Table.Td>
              <Table.Td>{platformName(card.platformId)}</Table.Td><Table.Td>{card.format || '—'}</Table.Td>
              <Table.Td><Status card={card} /></Table.Td><Table.Td>{card.nextStep || '—'}</Table.Td>
              {archived && <Table.Td><Button variant="light" size="compact-sm" disabled={archivePending} onClick={() => void toggleArchive(card)}>Восстановить</Button></Table.Td>}
            </Table.Tr>)}</Table.Tbody>
          </Table>
        </Table.ScrollContainer>}
        {activeView === 'board' && <ScrollArea type="auto">
          <SimpleGrid cols={5} spacing="sm" className="plan-board">
            {cardStatuses.map(status => <Paper key={status} withBorder p="xs" aria-label={status}>
              <Stack gap="xs"><Text fw={600} size="sm">{status}</Text>
                {visible.filter(card => card.status === status).map(card => <Paper key={card.id} withBorder p="xs">
                  <Button variant="subtle" size="compact-sm" className="plan-title" onClick={() => selectCard(card)}>{card.title}</Button>
                  <Text size="xs" c="dimmed">{platformName(card.platformId)} · {formatDate(card.plannedDate)}</Text>
                  {card.nextStep && <Text size="xs">Следующий шаг: {card.nextStep}</Text>}
                </Paper>)}
              </Stack>
            </Paper>)}
          </SimpleGrid>
        </ScrollArea>}
        {visible.length === 0 && <Text c="dimmed">{archived ? 'В архиве нет публикаций' : 'В этом виде пока нет карточек. Добавьте идею или измените фильтры'}</Text>}
      </Stack>
    </Paper>}
    {load === 'ready' && templateOpen && <TemplatePicker workspace={workspace} close={() => setTemplateOpen(false)} select={template => {
      setTemplateOpen(false)
      setEditor({ draft: newCard('Идея', { body: template.body, platformId: platformId || undefined }) })
    }} />}
    {strategyOpen && <StrategyDialog workspace={workspace} projectId={project.id} close={() => setStrategyOpen(false)} />}
    {editor && <CardEditor key={editor.id ?? editor.draft.kind} editor={editor} project={project}
      related={activeCard ? cards.filter(card => card.parentId === activeCard.id && card.archived === activeCard.archived) : []}
      close={() => { setArchiveError(false); setEditor(null) }} save={save} open={selectCard}
      analytics={activeCard?.kind === 'Публикация' ? {
        workspace,
        published: activeCard.status === 'Опубликовано',
        open: activeCard.status === 'Опубликовано' && !activeCard.archived ? () => openAnalytics(activeCard.platformId) : undefined,
      } : undefined}
      archiveError={archiveError} archivePending={archivePending} archived={activeCard?.archived ?? false}
      archive={activeCard?.kind === 'Публикация' ? () => void toggleArchive(activeCard) : undefined}
      addChild={activeCard && !activeCard.archived ? kind => {
        setEditor({ draft: newCard(kind, { parentId: activeCard.id, platformId: activeCard.platformId || platformId || undefined, audience: activeCard.audience, title: kind === 'Публикация' ? activeCard.title : '', body: kind === 'Публикация' ? activeCard.body : '' }) })
      } : undefined} />}
  </Stack>
}

function Status({ card }: { card: ContentCard }) {
  return <Badge variant="light" color={statusColors[cardStatuses.indexOf(card.status)]}>{card.status}</Badge>
}

function formatDate(value: string) {
  return value ? dateFormat.format(new Date(value + 'T12:00:00')) : '—'
}

function monthKey(date: Date) {
  return String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0')
}

function PlanCalendar({ month, setMonth, cards, open }: { month: Date; setMonth: (date: Date) => void; cards: ContentCard[]; open: (card: ContentCard) => void }) {
  const year = month.getFullYear()
  const index = month.getMonth()
  const offset = (new Date(year, index, 1).getDay() + 6) % 7
  const days = new Date(year, index + 1, 0).getDate()
  return <Stack gap="sm">
    <Group justify="space-between">
      <Group gap="xs"><Title order={3} size="h5">Календарь</Title><Text c="dimmed" tt="capitalize">{monthFormat.format(month)}</Text></Group>
      <Group gap={4}>
        <Button variant="subtle" size="compact-sm" aria-label="Предыдущий месяц" onClick={() => setMonth(new Date(year, index - 1, 1))}><ChevronLeft size={16} aria-hidden /></Button>
        <Button variant="subtle" size="compact-sm" aria-label="Следующий месяц" onClick={() => setMonth(new Date(year, index + 1, 1))}><ChevronRight size={16} aria-hidden /></Button>
      </Group>
    </Group>
    <ScrollArea type="auto">
      <SimpleGrid cols={7} spacing={4} verticalSpacing={4} className="plan-calendar" aria-label="Дни месяца">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => <Text key={day} ta="center" size="xs" c="dimmed">{day}</Text>)}
        {Array.from({ length: offset + days }, (_, cell) => {
          const day = cell - offset + 1
          const key = monthKey(month) + '-' + String(day).padStart(2, '0')
          return <Paper key={cell} withBorder={day > 0} p={4} className="plan-day">
            {day > 0 && <Stack gap={4}>
              <Text size="xs" fw={600}>{day}</Text>
              {cards.filter(card => card.plannedDate === key).map(card =>
                <Button key={card.id} variant="light" size="compact-xs" className="plan-title" onClick={() => open(card)}>{card.title}</Button>)}
            </Stack>}
          </Paper>
        })}
      </SimpleGrid>
    </ScrollArea>
  </Stack>
}

function TemplatePicker({ workspace, close, select }: { workspace: Workspace; close: () => void; select: (template: ContentTemplate) => void }) {
  const [templates, setTemplates] = useState<ContentTemplate[]>([])
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [attempt, setAttempt] = useState(0)
  const request = useRef<{ attempt: number; data: Promise<ContentTemplate[]> } | undefined>(undefined)
  useEffect(() => {
    let active = true
    if (request.current?.attempt !== attempt) request.current = { attempt, data: workspace.listTemplates() }
    void request.current.data.then(
      data => { if (active) { setTemplates(data); setState('ready') } },
      () => { if (active) setState('error') },
    )
    return () => { active = false }
  }, [attempt, workspace])
  return <Modal opened onClose={close} title="Шаблоны">
    <Stack>
      {state === 'loading' && <Text role="status">Загружаем шаблоны…</Text>}
      {state === 'error' && <Alert role="alert" color="red"><Stack align="start">
        <Text>Не удалось открыть шаблоны. Повторите попытку</Text>
        <Button variant="light" onClick={() => { setState('loading'); setAttempt(attempt + 1) }}>Повторить попытку</Button>
      </Stack></Alert>}
      {state === 'ready' && (templates.length ? templates.map(template => <Paper key={template.id} withBorder p="sm">
        <Stack gap="xs" align="start"><Text fw={600}>{template.name}</Text><Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-line' }}>{template.body}</Text>
          <Button variant="light" onClick={() => select(template)}>Использовать шаблон</Button></Stack>
      </Paper>) : <Text c="dimmed">По этим фильтрам шаблонов нет</Text>)}
      <Button variant="subtle" onClick={close}>Назад</Button>
    </Stack>
  </Modal>
}

export function CardEditor({ editor, project, related, close, closeLabel = 'К плану', save, open, addChild, archive, archived, archivePending, archiveError, analytics }: {
  editor: Editor
  project: Project
  related: ContentCard[]
  close: () => void
  closeLabel?: string
  save: (draft: CardDraft, id?: string) => Promise<void>
  open: (card: ContentCard) => void
  addChild?: (kind: CardDraft['kind']) => void
  archive?: () => void
  archived: boolean
  archivePending: boolean
  archiveError: boolean
  analytics?: { workspace: Workspace; published: boolean; open?: () => void }
}) {
  const [draft, setDraft] = useState(editor.draft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [linkMaterial, setLinkMaterial] = useState(false)
  const pending = useRef(false)
  const isIdea = draft.kind === 'Идея'
  const isPublication = draft.kind === 'Публикация'
  const busy = saving || archivePending
  const disabled = busy || archived
  const platform = project.platforms.find(item => item.id === draft.platformId)
  const update = <K extends keyof CardDraft,>(key: K, value: CardDraft[K]) => setDraft(current => ({ ...current, [key]: value }))
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending.current || archived) return
    if (!draft.title.trim()) { setError('Добавьте заголовок и следующий шаг'); return }
    if (isPublication && (!draft.platformId || !draft.format)) { setError('Выберите площадку и формат'); return }
    if (isPublication && draft.status === 'Опубликовано' && !draft.publishedDate) { setError('Укажите фактическую дату выхода'); return }
    pending.current = true
    setSaving(true)
    setError('')
    try { await save({ ...draft, title: draft.title.trim() }, editor.id) }
    catch { setError('Не удалось сохранить карточку. Введённые данные остались в форме') }
    finally { pending.current = false; setSaving(false) }
  }
  return <Drawer opened onClose={busy ? () => undefined : close} closeOnEscape={!busy} closeOnClickOutside={!busy} title="Карточка" position="right" size="lg">
    <Box component="form" onSubmit={submit} noValidate>
      <Stack gap="sm">
        <Group><Badge variant="light">{draft.kind}</Badge>{archived && <Badge color="gray">В архиве</Badge>}</Group>
        <TextInput label="Заголовок" aria-label="Заголовок" required value={draft.title} disabled={disabled} onChange={event => update('title', event.currentTarget.value)} />
        {(isIdea || isPublication) && <Group grow align="start">
          <Select label="Площадка" data={project.platforms.map(platform => ({ value: platform.id, label: platform.name }))} value={draft.platformId ?? null}
            disabled={disabled} onChange={value => setDraft(current => ({ ...current, platformId: value ?? undefined, format: '' }))} />
          {isPublication && <Select label="Формат" data={platform?.formats ?? []} value={draft.format || null} disabled={disabled || !draft.platformId} onChange={value => update('format', value ?? '')} />}
        </Group>}
        {isPublication && platform && platform.checklist.length > 0 && <Stack gap={4}>
          <Text fw={600} size="sm">Чек-лист площадки</Text>
          <MantineList size="sm">{platform.checklist.map(item => <MantineList.Item key={item}>{item}</MantineList.Item>)}</MantineList>
        </Stack>}
        <Select label="Статус" data={[...cardStatuses]} value={draft.status} allowDeselect={false} disabled={disabled} onChange={value => {
          const status = cardStatuses.find(item => item === value)
          if (status) update('status', status)
        }} />
        <TextInput label="Аудитория" value={draft.audience} disabled={disabled} onChange={event => update('audience', event.currentTarget.value)} />
        <Group grow>
          <TextInput label="Срок подготовки" type="date" value={draft.dueDate} disabled={disabled} onChange={event => update('dueDate', event.currentTarget.value)} />
          {isPublication && <TextInput label="Дата выхода" type="date" value={draft.plannedDate} disabled={disabled} onChange={event => update('plannedDate', event.currentTarget.value)} />}
        </Group>
        <TextInput label="Следующий шаг" value={draft.nextStep} disabled={disabled} onChange={event => update('nextStep', event.currentTarget.value)} />
        <Textarea label="Содержание" autosize minRows={2} value={draft.body} disabled={disabled} onChange={event => update('body', event.currentTarget.value)} />
        {isPublication && draft.status === 'Опубликовано' && <TextInput label="Фактическая дата выхода" type="date" value={draft.publishedDate} disabled={disabled} onChange={event => update('publishedDate', event.currentTarget.value)} />}
        <TextInput label="Ссылка" value={draft.link} disabled={disabled} onChange={event => update('link', event.currentTarget.value)} />
        {isPublication && <TextInput label="Внешний ID публикации" value={draft.externalId ?? ''} disabled={disabled} onChange={event => update('externalId', event.currentTarget.value)} />}
        {related.length > 0 && <Stack gap={4}>
          <Text fw={600} size="sm">{isIdea ? 'Адаптации' : 'Материалы'}</Text>
          {related.map(card => <Button key={card.id} className="plan-title launch-back" variant="subtle" onClick={() => open(card)} disabled={busy}>{card.title}</Button>)}
        </Stack>}
        {analytics && editor.id && <CardAnalytics workspace={analytics.workspace} projectId={project.id} cardId={editor.id} published={analytics.published} />}
        {error && <Alert role="alert" color="red">{error}</Alert>}
        {archiveError && <Alert role="alert" color="red">Не удалось обновить архив. Повторите попытку.</Alert>}
        {saving && <Text role="status">Сохраняем карточку…</Text>}
        <Group className="card-editor-actions">
          {!archived && <Button type="submit" loading={saving} disabled={archivePending}>Сохранить карточку</Button>}
          {addChild && isIdea && <Button variant="light" disabled={disabled || !project.platforms.length} onClick={() => addChild('Публикация')}>Добавить адаптацию</Button>}
          {addChild && isPublication && <Button variant="light" disabled={disabled} onClick={() => setLinkMaterial(!linkMaterial)}>Связать материал</Button>}
          {archive && <Button variant="subtle" color={archived ? 'blue' : 'orange'} loading={archivePending} disabled={saving} onClick={archive}>{archived ? 'Восстановить' : 'Убрать из плана'}</Button>}
          {analytics?.open && <Button variant="light" disabled={busy} onClick={analytics.open}>Открыть аналитику</Button>}
          <Button variant="subtle" disabled={busy} onClick={close}>{closeLabel}</Button>
        </Group>
        {linkMaterial && addChild && <Group gap="xs">{materialKinds.map(kind => <Button key={kind} variant="light" disabled={disabled} onClick={() => addChild(kind)}>{kind}</Button>)}</Group>}
      </Stack>
    </Box>
  </Drawer>
}
