import type { ContentCard } from './content-records.ts'
import { validDate } from './dates.ts'

export { validDate } from './dates.ts'

export type Measurement = {
  platformId: string
  publicationId: string
  metric: string
  value: number
  from: string
  to: string
  source: string
  unit?: string
  window?: string
  windowType?: 'calendar' | 'age' | 'point'
}
export type PreviewRow = { line: number; reference: string; measurement?: Measurement; error?: string; ambiguous?: boolean }
export type AnalyticsReference = { id: string; url: string; note: string }
export type StrategyNote = { goal: string; audience: string; hypothesis: string; period: string }
export type AnalyticsSnapshot = {
  measurements: Measurement[]
  references: [string, AnalyticsReference[]][]
  notes: [string, StrategyNote][]
}

export function emptyAnalytics(): AnalyticsSnapshot {
  return { measurements: [], references: [], notes: [] }
}

export const csvHeader = 'platform_id,publication_id,metric,value,window_start,window_end,source'
const required = csvHeader.split(',')

export function measurementKey(item: Measurement) {
  return JSON.stringify([item.platformId, item.publicationId, item.metric, item.source, item.from, item.to, item.windowType === 'age' ? 'age' : ''])
}

export function measurementError(item: Measurement) {
  if (item.windowType && !['calendar', 'age', 'point'].includes(item.windowType)) return 'Проверьте тип окна'
  if (item.windowType === 'age' && (!item.publicationId || !item.to)) return 'Для срока после публикации укажите публикацию и границы окна'
  if (item.windowType === 'calendar' && !item.to) return 'Укажите конец окна'
  if (item.windowType === 'point' && item.to && item.to !== item.from) return 'Для точечного замера укажите одну дату'
  if (!item.metric.trim() || !item.source.trim()) return 'Укажите метрику и источник'
  if (!Number.isFinite(item.value) || item.value < 0) return 'Укажите неотрицательное число'
  if (!validDate(item.from) || (item.to && (!validDate(item.to) || item.to < item.from))) return 'Проверьте дату или границы периода'
  return ''
}

function records(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { value += '"'; i += 1 }
      else if (ch === '"') quoted = false
      else value += ch
    } else if (ch === '"' && value === '') quoted = true
    else if (ch === ',') { row.push(value); value = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(value); rows.push(row); row = []; value = ''
    } else value += ch
  }
  if (quoted) throw new Error('В CSV осталась незакрытая кавычка')
  if (row.length || value) rows.push([...row, value])
  return rows
}

export function previewCsv(text: string, platformId: string, known: ContentCard[]): PreviewRow[] {
  const [headers = [], ...rows] = records(text.replace(/^\uFEFF/, ''))
  const keys = headers.map(value => value.trim())
  if (required.some(key => keys.indexOf(key) === -1 || keys.lastIndexOf(key) !== keys.indexOf(key)) || keys.indexOf('window_type') !== keys.lastIndexOf('window_type')) {
    throw new Error('Не найдены столбцы шаблона CSV. Скачайте шаблон и проверьте заголовки')
  }
  return rows.flatMap((row, index) => {
    if (!row.some(value => value.trim())) return []
    const read = (key: string) => row[keys.indexOf(key)]?.trim() ?? ''
    const reference = read('publication_id')
    const rowPlatform = read('platform_id')
    const rawValue = read('value')
    const matches = reference ? known.filter(card => card.externalId === reference || card.link === reference || card.id === reference) : []
    const measurement: Measurement = {
      platformId, publicationId: matches.length === 1 ? matches[0].id : '', metric: read('metric'),
      value: /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(rawValue) ? Number(rawValue.replace(',', '.')) : Number.NaN,
      from: read('window_start'), to: read('window_end'), source: read('source'),
      ...(read('window_type') ? { windowType: read('window_type') as Measurement['windowType'] } : {}),
    }
    const error = row.length !== keys.length ? 'Количество полей не совпадает с заголовком'
      : rowPlatform && rowPlatform !== platformId ? 'Другая площадка. Выберите её для импорта' : measurementError(reference && !measurement.publicationId ? { ...measurement, publicationId: reference } : measurement)
    return [{ line: index + 2, reference, measurement: error ? undefined : measurement, error: error || undefined, ambiguous: matches.length > 1 }]
  })
}

export function mergeMeasurements(
  current: Measurement[], selected: Measurement[], platformId: string, publications: ContentCard[], replace: boolean,
) {
  const next = new Map(current.map(row => [measurementKey(row), row]))
  const publicationIds = new Set(publications.map(card => card.id))
  for (const row of selected) {
    if (row.platformId !== platformId || measurementError(row) || (row.publicationId && !publicationIds.has(row.publicationId))) {
      throw new Error('Invalid measurement')
    }
    const key = measurementKey(row)
    if (!replace && next.has(key)) throw new Error('Replacement must be confirmed')
    next.delete(key)
    next.set(key, row)
  }
  return [...next.values()]
}

export function validReferenceUrl(url: string) {
  try {
    const parsed = new URL(url)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && /^https?:\/\//i.test(url)
  } catch {
    return false
  }
}

export function comparisonWindow(item: Measurement, publishedDate: string): { key: string; label: string } | undefined {
  if (!item.publicationId || item.windowType === 'point' || !item.to) return undefined
  if (item.windowType === 'age') {
    if (!validDate(publishedDate)) return undefined
    const offset = (date: string) => (Date.parse(date + 'T00:00:00Z') - Date.parse(publishedDate + 'T00:00:00Z')) / 86400000
    const start = offset(item.from), end = offset(item.to)
    if (start < 0 || end < 0) return undefined
    return { key: JSON.stringify(['age', start, end]), label: `После публикации: дни ${start}–${end}` }
  }
  return { key: JSON.stringify(['calendar', item.from, item.to]), label: `Календарное: ${item.from} — ${item.to}` }
}

export function audienceGrowth(items: Measurement[], source: string, from: string, to: string): number | undefined {
  const snapshots = items.filter(item => !item.publicationId && (!item.to || item.to === item.from) && /^(подписчики|followers)$/i.test(item.metric) && item.source === source)
  const last = (date: string) => snapshots.filter(item => item.from === date).at(-1)
  const first = last(from), final = last(to)
  return first && final ? final.value - first.value : undefined
}
