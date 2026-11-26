import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Alert, Anchor, Autocomplete, Badge, Button, Checkbox, FileInput, Group, Modal, Paper, Select, Stack, Table, Text, TextInput, Textarea, Title } from '@mantine/core'
import { audienceGrowth, comparisonWindow, csvHeader, measurementError, measurementKey, previewCsv, validDate, validReferenceUrl, type Measurement, type PreviewRow } from './lib/analytics'
import { metricDefinitions, type MetricDefinition } from './lib/project-records'
import type { ContentCard, Project, createWorkspaceStub } from './lib/stubs/workspace'

type Workspace = ReturnType<typeof createWorkspaceStub>
type AnalyticsData = Awaited<ReturnType<Workspace['readAnalytics']>>
type Props = { project: Project; workspace: Workspace; demo: boolean; platformId?: string; back: () => void }
type ImportRow = PreviewRow & { chosen: boolean }

function day(offset = 0) {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12).toLocaleDateString('sv-SE')
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csvLine(values: (string | number)[]) {
  return values.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')
}

function sample(platformId: string, publications: ContentCard[]) {
  const id = publications[0]?.externalId || publications[0]?.link || publications[0]?.id || 'ID_публикации'
  return [csvHeader,
    csvLine([platformId, id, 'Просмотры', 140, day(-7), day(-1), 'Пример']),
    csvLine([platformId, id, 'Просмотры', 150, day(-7), day(-1), 'Пример']),
    csvLine([platformId, id, 'Просмотры', 'ошибка', day(-7), day(-1), 'Пример']),
    csvLine([platformId, 'нужна-привязка', 'Просмотры', 25, day(-9), '', 'Пример']),
    csvLine([platformId, '', 'Подписчики', 100, day(-30), '', 'Пример']),
    csvLine([platformId, '', 'Подписчики', 112, day(), '', 'Пример']),
    ...(publications[1] ? [csvLine([platformId, publications[1].id, 'Просмотры', 95, day(-7), day(-1), 'Пример'])] : []),
  ].join('\r\n')
}

const measurementWindow = (item: Measurement) => item.to ? item.from + ' — ' + item.to : item.from
const numeric = new Intl.NumberFormat('ru')

export function AnalyticsScreen({ project, workspace, demo, platformId, back }: Props) {
  const [platform, setPlatform] = useState(platformId ?? project.platforms[0]?.id ?? '')
  const [from, setFrom] = useState(() => day(-30))
  const [to, setTo] = useState(() => day())
  const [loaded, setLoaded] = useState<{ platform: string; data?: AnalyticsData; failed?: boolean }>()
  const [revision, setRevision] = useState(0)
  const [panel, setPanel] = useState<'import' | 'manual' | 'reference' | null>(null)
  const [notice, setNotice] = useState('')
  const [comparison, setComparison] = useState<string | null>(null)
  const [audienceSource, setAudienceSource] = useState<string | null>(null)
  const [excluded, setExcluded] = useState<string[]>([])
  const [referenceIds, setReferenceIds] = useState<string[]>([])
  const request = useRef<{ key: string; result: Promise<AnalyticsData> } | undefined>(undefined)

  useEffect(() => {
    if (!platform) return
    let active = true
    const key = JSON.stringify([project.id, platform, revision])
    if (request.current?.key !== key) request.current = { key, result: workspace.readAnalytics(project.id, platform) }
    void request.current.result.then(
      data => { if (active) setLoaded({ platform, data }) },
      () => { if (active) setLoaded({ platform, failed: true }) },
    )
    return () => { active = false }
  }, [platform, project.id, revision, workspace])

  const current = loaded?.platform === platform ? loaded : undefined
  const data = current?.data
  const dateError = !validDate(from) || !validDate(to) || from > to
  const publications = data?.publications ?? []
  const history = data?.history ?? []
  const names = new Map(history.map(item => [item.id, item.title]))
  const eligible = new Set(history.filter(item => item.publishedDate >= from && item.publishedDate <= to).map(item => item.id))
  const rows = (data?.measurements ?? []).filter(item => !dateError && (item.publicationId ? eligible.has(item.publicationId) : item.from >= from && item.from <= to))
  const selected = rows.filter(item => !excluded.includes(measurementKey(item)))
  const groupKey = (item: Measurement) => JSON.stringify([item.metric, item.source, item.from, item.to])
  const sorted = [...rows].sort((a, b) => groupKey(a).localeCompare(groupKey(b)) || b.value - a.value)
  const audience = (data?.measurements ?? []).filter(item => !item.publicationId && (!item.to || item.to === item.from) && /^(подписчики|followers)$/i.test(item.metric))
  const audienceSources = [...new Set(audience.map(item => item.source))]
  const groups = new Map<string, { label: string; items: Measurement[] }>()
  for (const item of rows) {
    const window = comparisonWindow(item, history.find(card => card.id === item.publicationId)?.publishedDate ?? '')
    if (!window) continue
    const key = JSON.stringify([item.metric, item.source, window.key])
    const group = groups.get(key) ?? { label: [item.metric, item.source, window.label].join(' · '), items: [] }
    group.items.push(item); groups.set(key, group)
  }
  const groupOptions = [...groups].map(([value, group]) => ({ value, label: group.label }))
  const comparisonKey = comparison && groups.has(comparison) ? comparison : groupOptions[0]?.value
  const ranking = comparisonKey ? [...groups.get(comparisonKey)!.items].sort((a, b) => b.value - a.value) : []
  const chosenSource = audienceSource && audienceSources.includes(audienceSource) ? audienceSource : audienceSources[0]
  const growth = chosenSource ? audienceGrowth(audience, chosenSource, from, to) : undefined
  const activePlatform = project.platforms.find(item => item.id === platform)
  const platformName = activePlatform?.name ?? ''
  const metrics = metricDefinitions(activePlatform)
  const reload = () => { setLoaded(undefined); setRevision(value => value + 1) }
  function afterSave(message: string) { setPanel(null); setNotice(message); reload() }
  function exportSummary() {
    download('smm-workspace-analytics.json', JSON.stringify({
      project: project.name, platform: platformName, period: { from, to },
      measurements: selected.map(({ platformId, publicationId, metric, value, source, from, to, unit, window, windowType }) => ({
        platformId, publicationId, metric, value, source, from, to, unit, window, windowType,
        publication: names.get(publicationId) ?? null, link: history.find(card => card.id === publicationId)?.link || null,
      })),
      references: data?.references.filter(item => referenceIds.includes(item.id)).map(({ url, note }) => ({ url, note })) ?? [],
      instructions: 'Указывайте, на каких значениях, источниках и окнах основан каждый вывод. Предложите идеи для ручного переноса в контент-план.',
    }, null, 2), 'application/json;charset=utf-8')
  }

  return <Stack gap="md">
    <Text c="dimmed">{project.name}</Text>
    <Title order={2}>Аналитика</Title>
    <Paper withBorder p="md"><Stack>
      <Group align="end">
        <Select label="Площадка" data={project.platforms.map(item => ({ value: item.id, label: item.name }))} value={platform || null} allowDeselect={false}
          onChange={value => { if (value && value !== platform) { setLoaded(undefined); setPlatform(value); setNotice(''); setExcluded([]); setReferenceIds([]) } }} />
        <TextInput type="date" label="Начало периода" value={from} onChange={event => setFrom(event.currentTarget.value)} />
        <TextInput type="date" label="Конец периода" value={to} onChange={event => setTo(event.currentTarget.value)} />
      </Group>
      {!platform && <Text>Добавьте площадку в проект, чтобы внести метрики</Text>}
      {platform && !current && <Text role="status">Обновляем результаты…</Text>}
      {current?.failed && <Alert color="red" role="alert">Не удалось открыть аналитику. <Button variant="subtle" onClick={reload}>Повторить попытку</Button></Alert>}
      {notice && <Text role="status">{notice}</Text>}
      {dateError && <Alert color="red" role="alert">Проверьте начало и конец периода</Alert>}
      {data && <>
        <Group>
          <Button onClick={() => setPanel('manual')}>Внести метрику</Button>
          <Button variant="light" onClick={() => setPanel('import')}>Импортировать CSV</Button>
          <Button variant="subtle" onClick={() => download('smm-metrics-template.csv',
            csvHeader + '\r\n' + csvLine([platform, publications[0]?.externalId || publications[0]?.link || publications[0]?.id || '', metrics[0]?.name ?? 'Просмотры', 140, day(-7), day(-1), 'Пример']) + '\r\n',
            'text/csv;charset=utf-8')}>Скачать шаблон CSV</Button>
        </Group>
        {!dateError && !rows.length && <Text c="dimmed">Пока нет замеров. Внесите метрику или импортируйте CSV</Text>}
      </>}
    </Stack></Paper>
    {data && !dateError && <Paper withBorder p="md"><Stack>
      <Title order={3} size="h4">Результаты</Title>
      <Text fw={600}>Рейтинг публикаций</Text>
      {groupOptions.length > 0 ? <>
        <Select label="Метрика, источник и окно сравнения" data={groupOptions} value={comparisonKey ?? null} allowDeselect={false} onChange={setComparison} />
        <Table aria-label="Рейтинг публикаций"><Table.Thead><Table.Tr><Table.Th>Публикация</Table.Th><Table.Th>Значение</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{ranking.map(item => <Table.Tr key={measurementKey(item)}><Table.Td>{names.get(item.publicationId)}</Table.Td><Table.Td>{measurementValue(item)}</Table.Td></Table.Tr>)}</Table.Tbody></Table>
      </> : <Text c="dimmed">Нет сопоставимых окон</Text>}
      {!!rows.length && <Text size="sm" c="dimmed">Все замеры, включая точечные, приведены ниже.</Text>}
      {!!rows.length && <Table.ScrollContainer minWidth={700}>
        <Table aria-label="Замеры" verticalSpacing="sm">
          <Table.Thead><Table.Tr>{['В сводку', 'Публикация', 'Метрика', 'Значение', 'Период замера', 'Источник'].map(label => <Table.Th key={label}>{label}</Table.Th>)}</Table.Tr></Table.Thead>
          <Table.Tbody>{sorted.map(item => {
            const key = measurementKey(item)
            return <Table.Tr key={key}>
              <Table.Td><Checkbox aria-label={'Включить: ' + (names.get(item.publicationId) ?? platformName) + ', ' + item.metric + ', ' + measurementWindow(item)}
                checked={!excluded.includes(key)} onChange={event => updateSelection(setExcluded, key, !event.currentTarget.checked)} /></Table.Td>
              <Table.Td>{names.get(item.publicationId) ?? platformName}</Table.Td><Table.Td>{item.metric}</Table.Td>
              <Table.Td>{measurementValue(item)}</Table.Td><Table.Td>{measurementWindow(item)}</Table.Td><Table.Td>{item.source}</Table.Td>
            </Table.Tr>
          })}</Table.Tbody>
        </Table>
      </Table.ScrollContainer>}
      <Stack gap="xs">
        <Text fw={600}>Прирост подписчиков</Text>
        {audienceSources.length > 0 && <Select label="Источник подписчиков" data={audienceSources} value={chosenSource ?? null} allowDeselect={false} onChange={setAudienceSource} />}
        <Text>{chosenSource ? chosenSource + ': ' : ''}{growth === undefined ? 'Нет данных' : (growth > 0 ? '+' : '') + numeric.format(growth)}</Text>
      </Stack>
      <Stack gap="xs">
        <Text fw={600}>Референсы</Text>
        {data.references.map(item => <Stack key={item.id} gap={2}>
          <Checkbox label={item.note || item.url} checked={referenceIds.includes(item.id)}
            onChange={event => updateSelection(setReferenceIds, item.id, event.currentTarget.checked)} />
          <Anchor size="sm" href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</Anchor>
        </Stack>)}
        <Group>
          <Button variant="light" onClick={() => setPanel('reference')}>Добавить референс</Button>
          <Button disabled={!selected.length && !referenceIds.length} onClick={exportSummary}>Скачать сводку</Button>
        </Group>
      </Stack>
    </Stack></Paper>}
    <Button variant="subtle" className="launch-back" onClick={back}>К контент-плану</Button>
    {data && panel === 'import' && <ImportDialog platform={platform} data={data} metrics={metrics} demo={demo} close={() => setPanel(null)}
      save={(rows, replace) => workspace.writeMeasurements(project.id, platform, rows, replace)} done={afterSave} />}
    {data && panel === 'manual' && <ManualDialog platform={platform} data={data} metrics={metrics} close={() => setPanel(null)}
      save={(rows, replace) => workspace.writeMeasurements(project.id, platform, rows, replace)} done={afterSave} />}
    {data && panel === 'reference' && <ReferenceDialog close={() => setPanel(null)}
      save={async (url, note) => { await workspace.addReference(project.id, platform, url, note); setPanel(null); reload() }} />}
  </Stack>
}

function updateSelection(set: React.Dispatch<React.SetStateAction<string[]>>, key: string, include: boolean) {
  set(current => include ? [...new Set([...current, key])] : current.filter(item => item !== key))
}

type Write = (rows: Measurement[], replace: boolean) => Promise<void>
type DialogProps = { platform: string; data: AnalyticsData; metrics: MetricDefinition[]; close: () => void; save: Write; done: (message: string) => void }
function publicationOptions(publications: ContentCard[]) {
  const counts = new Map<string, number>()
  for (const item of publications) counts.set(item.title, (counts.get(item.title) ?? 0) + 1)
  return publications.map(item => {
    const label = counts.get(item.title) === 1
      ? item.title
      : [item.title, item.publishedDate, item.externalId, item.link, item.id].filter(Boolean).join(' · ')
    return { value: item.id, label }
  })
}

function requiresReplacement(selected: Measurement[], existing: Measurement[]) {
  const keys = new Set(existing.map(measurementKey))
  return selected.some(item => {
    const key = measurementKey(item)
    if (keys.has(key)) return true
    keys.add(key)
    return false
  })
}

function ImportDialog({ platform, data, metrics, demo, close, save, done }: DialogProps & { demo: boolean }) {
  const [rows, setRows] = useState<ImportRow[]>([])
  const [error, setError] = useState('')
  const [read, setRead] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [replace, setReplace] = useState(false)
  const selected = rows.flatMap(row => row.chosen && row.measurement && (!row.reference || row.measurement.publicationId) ? [row.measurement] : [])
  const duplicates = requiresReplacement(selected, data.measurements)
  const counts = new Map<string, number>()
  for (const item of selected) {
    const key = measurementKey(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  async function load(input: string | File) {
    setRead(true); setError(''); setReplace(false); setRows([]); setLoaded(false)
    try {
      if (typeof input !== 'string' && input.size > 5_000_000) throw new Error('Выберите CSV размером до 5 МБ')
      const parsed = previewCsv(typeof input === 'string' ? input : await input.text(), platform, data.publications)
        .map(row => row.measurement
          ? { ...row, measurement: withDefinition(row.measurement, metrics) }
          : row)
      setRows(parsed.map(row => ({ ...row, chosen: !!row.measurement && (!row.reference || !!row.measurement.publicationId) })))
      setLoaded(true)
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Не удалось прочитать CSV') }
    finally { setRead(false) }
  }

  async function submit() {
    if (saving) return
    setSaving(true); setError('')
    try { await save(selected, replace); done('Принято строк: ' + selected.length + '. Пропущено: ' + (rows.length - selected.length) + '.') }
    catch { setError('Не удалось сохранить метрики. Повторите попытку') }
    finally { setSaving(false) }
  }

  return <Modal opened onClose={saving ? () => undefined : close} title="Импорт CSV" size="xl">
    <Stack>
      {demo
        ? <Button variant="light" disabled={saving || read} onClick={() => void load(sample(platform, data.publications))}>Загрузить пример CSV</Button>
        : <FileInput label="Выбрать CSV" placeholder="Выберите файл с показателями"
            description="В publication_id укажите внешний ID или ссылку; для площадки оставьте поле пустым. Дополнительный столбец window_type: calendar, age или point; без него окно определяется по датам."
            accept=".csv,text/csv" disabled={saving || read} onChange={file => { if (file) void load(file) }} />}
      {read && <Text role="status">Проверяем строки…</Text>}
      {!!rows.length && <Table.ScrollContainer minWidth={640}>
        <Table aria-label="Предпросмотр CSV"><Table.Thead><Table.Tr>{['Выбрать', 'Строка', 'Публикация', 'Метрика', 'Статус'].map(label => <Table.Th key={label}>{label}</Table.Th>)}</Table.Tr></Table.Thead>
          <Table.Tbody>{rows.map(row => <Table.Tr key={row.line}>
            <Table.Td><Checkbox aria-label={'Выбрать строку ' + row.line} checked={row.chosen} disabled={saving || !row.measurement || (!!row.reference && !row.measurement.publicationId)}
              onChange={event => { const checked = event.currentTarget.checked; setRows(current => current.map(item => item.line === row.line ? { ...item, chosen: checked } : item)); setReplace(false) }} /></Table.Td>
            <Table.Td>{row.line}</Table.Td>
            <Table.Td>{row.measurement && row.reference ? <Stack gap={4}>
              <Text size="xs" c="dimmed">{row.reference}</Text>
              <Select aria-label={'Публикация для строки ' + row.line}
              placeholder={row.reference} data={publicationOptions(data.publications)} value={row.measurement.publicationId || null} disabled={saving}
              onChange={value => { setRows(current => current.map(item => item.line === row.line && item.measurement
                ? { ...item, chosen: !!value, measurement: { ...item.measurement, publicationId: value ?? '' } } : item)); setReplace(false) }} />
            </Stack> : row.reference || 'Площадка'}</Table.Td>
            <Table.Td>{row.measurement ? <>
              <Text size="sm">{row.measurement.metric + ': ' + measurementValue(row.measurement)}</Text>
              {row.measurement.window && <Text size="xs" c="dimmed">Окно: {row.measurement.window}</Text>}
            </> : '—'}</Table.Td>
            <Table.Td>{row.error ?? (row.reference && !row.measurement?.publicationId
              ? row.ambiguous ? 'Несколько совпадений. Выберите публикацию или пропустите строку' : 'Выберите публикацию или пропустите строку'
              :
              row.measurement && data.measurements.some(item => measurementKey(item) === measurementKey(row.measurement!)) ? 'Заменит сохранённый замер' :
                row.measurement && (counts.get(measurementKey(row.measurement)) ?? 0) > 1 ? 'Повторяется в выбранных строках' : 'Готово к импорту')}</Table.Td>
          </Table.Tr>)}</Table.Tbody>
        </Table>
      </Table.ScrollContainer>}
      {loaded && !rows.some(row => row.measurement) && <Text>В файле нет строк для импорта. Исправьте ошибки и загрузите его снова</Text>}
      {duplicates && <Checkbox label="Подтвердить замену совпадающих замеров" description="Если в файле несколько строк с одним замером, сохранится последняя из выбранных." checked={replace}
        disabled={saving} onChange={event => setReplace(event.currentTarget.checked)} />}
      {error && <Alert color="red" role="alert">{error}</Alert>}
      {saving && <Text role="status">Сохраняем метрики…</Text>}
      <Group>
        <Button disabled={!selected.length || (duplicates && !replace) || read} loading={saving} onClick={() => void submit()}>Сохранить выбранные строки</Button>
        <Button variant="subtle" disabled={saving} onClick={close}>Отмена</Button>
      </Group>
    </Stack>
  </Modal>
}

function ManualDialog({ platform, data, metrics, close, save, done }: DialogProps) {
  const [target, setTarget] = useState('')
  const [metric, setMetric] = useState(metrics[0]?.name ?? 'Просмотры')
  const [value, setValue] = useState('')
  const [source, setSource] = useState('Вручную')
  const [from, setFrom] = useState(() => day())
  const [to, setTo] = useState('')
  const [replace, setReplace] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [windowType, setWindowType] = useState('auto')
  const row = withDefinition({
    platformId: platform, publicationId: target, metric: metric.trim(), source: source.trim(), from, to,
    value: value.trim() ? Number(value) : Number.NaN,
    ...(windowType !== 'auto' ? { windowType: windowType as Measurement['windowType'] } : {}),
  }, metrics)
  const duplicate = requiresReplacement([row], data.measurements)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    const reason = measurementError(row)
    if (reason) { setError(reason); return }
    setError(''); setSaving(true)
    try { await save([row], replace); done('Замер сохранён') }
    catch { setError('Не удалось сохранить метрики. Повторите попытку') }
    finally { setSaving(false) }
  }
  return <Modal opened onClose={saving ? () => undefined : close} title="Внести метрику">
    <Stack component="form" onSubmit={submit} onChangeCapture={event => {
      if (event.target instanceof HTMLInputElement && event.target.type !== 'checkbox') setReplace(false)
    }}>
      <Select label="Объект замера" disabled={saving} data={[{ value: '', label: 'Площадка целиком' }, ...publicationOptions(data.publications)]} value={target}
        allowDeselect={false} onChange={next => { setTarget(next ?? ''); setReplace(false) }} />
      <Autocomplete label="Метрика" disabled={saving} data={metrics.map(item => item.name)} value={metric} onChange={next => { setMetric(next); setReplace(false) }} />
      <TextInput label="Значение" disabled={saving} description={row.unit ? 'Единица: ' + row.unit : undefined} type="number" step="any" value={value}
        onChange={event => setValue(event.currentTarget.value)} />
      <TextInput label="Источник" disabled={saving} value={source} onChange={event => setSource(event.currentTarget.value)} />
      {target && <Select label="Тип окна" value={windowType} allowDeselect={false} onChange={next => { setWindowType(next ?? 'auto'); setReplace(false) }} data={[{ value: 'auto', label: 'По указанным датам' }, { value: 'calendar', label: 'Календарный период' }, { value: 'age', label: 'Срок после публикации' }, { value: 'point', label: 'Точечный замер' }]} />}
      <TextInput label="Дата замера или начало окна" disabled={saving} description={row.window ? 'Настроенное окно: ' + row.window : undefined} type="date" value={from} onChange={event => setFrom(event.currentTarget.value)} />
      <TextInput label="Конец окна" disabled={saving} type="date" value={to} onChange={event => setTo(event.currentTarget.value)} />
      {duplicate && <Checkbox label="Подтвердить замену совпадающего замера" disabled={saving} checked={replace} onChange={event => setReplace(event.currentTarget.checked)} />}
      {error && <Alert color="red" role="alert">{error}</Alert>}
      {saving && <Text role="status">Сохраняем метрики…</Text>}
      <Button type="submit" disabled={duplicate && !replace} loading={saving}>Сохранить метрику</Button>
    </Stack>
  </Modal>
}

function ReferenceDialog({ close, save }: { close: () => void; save: (url: string, note: string) => Promise<void> }) {
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (!validReferenceUrl(url.trim())) { setError('Введите ссылку с http:// или https://'); return }
    setError(''); setSaving(true)
    try { await save(url.trim(), note.trim()) } catch { setError('Не удалось сохранить референс. Повторите попытку') }
    finally { setSaving(false) }
  }
  return <Modal opened onClose={saving ? () => undefined : close} title="Добавить референс">
    <Stack component="form" onSubmit={submit}>
      <TextInput label="Ссылка" disabled={saving} value={url} onChange={event => setUrl(event.currentTarget.value)} />
      <Textarea label="Заметка" disabled={saving} value={note} onChange={event => setNote(event.currentTarget.value)} />
      {error && <Alert color="red" role="alert">{error}</Alert>}
      <Button type="submit" loading={saving}>Сохранить референс</Button>
    </Stack>
  </Modal>
}

function withDefinition(item: Measurement, metrics: MetricDefinition[]): Measurement {
  const definition = metrics.find(metric => metric.name === item.metric)
  return definition ? { ...item, unit: definition.unit || undefined, window: definition.window || undefined } : item
}

function measurementValue(item: Measurement) {
  return [numeric.format(item.value), item.unit].filter(Boolean).join(' ')
}

export function CardAnalytics({ workspace, projectId, cardId, published }: {
  workspace: Workspace; projectId: string; cardId: string; published: boolean
}) {
  const [measurements, setMeasurements] = useState<Measurement[]>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    void workspace.readCardMeasurements(projectId, cardId).then(items => {
      if (active) setMeasurements(items)
    }, () => {
      if (active) setFailed(true)
    })
    return () => { active = false }
  }, [projectId, cardId, workspace, attempt])

  if (failed) return <Alert color="red" role="alert">
    Не удалось загрузить замеры. <Button variant="subtle" onClick={() => { setFailed(false); setAttempt(value => value + 1) }}>Повторить попытку</Button>
  </Alert>
  if (!measurements) return published ? <Text role="status" size="sm">Обновляем результаты…</Text> : null
  if (!published && !measurements.length) return null
  return <Stack gap="xs">
    <Group>
      <Text fw={600} size="sm">Аналитика публикации</Text>
      <Badge color={measurements.length ? 'teal' : 'gray'} variant="light">{measurements.length ? 'Обновлено' : 'Ожидает данных'}</Badge>
    </Group>
    {measurements.length > 0 && <Table.ScrollContainer minWidth={420}>
      <Table aria-label="Замеры публикации">
        <Table.Thead><Table.Tr>{['Метрика', 'Значение', 'Период замера', 'Источник'].map(label => <Table.Th key={label}>{label}</Table.Th>)}</Table.Tr></Table.Thead>
        <Table.Tbody>{measurements.map(item => <Table.Tr key={measurementKey(item)}>
          <Table.Td>{item.metric}</Table.Td><Table.Td>{measurementValue(item)}</Table.Td>
          <Table.Td>{measurementWindow(item)}</Table.Td><Table.Td>{item.source}</Table.Td>
        </Table.Tr>)}</Table.Tbody>
      </Table>
    </Table.ScrollContainer>}
  </Stack>
}
