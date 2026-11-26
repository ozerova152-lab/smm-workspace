import assert from 'node:assert/strict'
import test from 'node:test'
import { audienceGrowth, comparisonWindow, mergeMeasurements, previewCsv, type Measurement } from '../../src/lib/analytics.ts'

const snap = (value: number, from: string, to: string, source = 'Отчёт'): Measurement => ({ platformId: 'video', publicationId: '', metric: 'Подписчики', value, from, to, source })

test('T04: обновление старого снимка с пустым концом должно победить более ранний снимок той же даты с равными границами', () => {
  const initial = [snap(100, '2026-11-01', ''), snap(110, '2026-11-01', '2026-11-01'), snap(150, '2026-11-30', '2026-11-30')]
  const updated = mergeMeasurements(initial, [snap(120, '2026-11-01', '')], 'video', [], true)
  assert.equal(audienceGrowth(updated, 'Отчёт', '2026-11-01', '2026-11-30'), 30)
})

test('T04: равные возрастные окна сравнимы, календарные даты и источники остаются раздельными, точечный замер не попадает в рейтинг', () => {
  const base: Measurement = { platformId: 'video', publicationId: 'a', metric: 'Просмотры', value: 10, source: 'A', from: '2026-11-01', to: '2026-11-07', windowType: 'age' }
  assert.equal(comparisonWindow(base, '2026-11-01')?.key, comparisonWindow({ ...base, publicationId: 'b', from: '2026-11-10', to: '2026-11-16' }, '2026-11-10')?.key)
  assert.notEqual(comparisonWindow(base, '2026-11-01')?.key, comparisonWindow({ ...base, windowType: 'calendar' }, '2026-11-01')?.key)
  assert.equal(comparisonWindow({ ...base, windowType: 'point', to: base.from }, '2026-11-01'), undefined)
})

test('T04: старый CSV с равными границами содержит снимки и пропуск границы не даёт прирост', () => {
  const rows = previewCsv('platform_id,publication_id,metric,value,window_start,window_end,source\nvideo,,Подписчики,100,2026-11-01,2026-11-01,Отчёт\nvideo,,Подписчики,150,2026-11-30,2026-11-30,Отчёт', 'video', [])
  const items = rows.flatMap(row => row.measurement ? [row.measurement] : [])
  assert.equal(audienceGrowth(items, 'Отчёт', '2026-11-01', '2026-11-30'), 50)
  assert.equal(audienceGrowth(items, 'Отчёт', '2026-11-02', '2026-11-30'), undefined)
  assert.equal(audienceGrowth(items, 'Другой', '2026-11-01', '2026-11-30'), undefined)
})
