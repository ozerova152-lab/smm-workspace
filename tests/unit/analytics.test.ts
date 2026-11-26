import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { mergeMeasurements, previewCsv, type Measurement } from '../../src/lib/analytics.ts'
import { newCard, type ContentCard } from '../../src/lib/content-records.ts'

const header = 'platform_id,publication_id,metric,value,window_start,window_end,source'
const from = '2026-11-20'
const to = '2026-11-21'
const platformId = 'video'

function publication(id: string, externalId: string, link: string): ContentCard {
  return {
    ...newCard('Публикация', { title: id, status: 'Опубликовано', platformId, externalId, link }),
    id, projectId: 'project', archived: false,
  }
}

const known = [
  publication('alpha', 'clip', 'https://example.test/alpha'),
  publication('beta', 'shared-id', 'https://example.test/beta'),
  publication('gamma', 'shared-id', 'https://example.test/gamma'),
]

test('CSV matches external IDs and exact links and leaves an ambiguous or missing match for manual review', () => {
  const rows = previewCsv([
    '﻿' + header,
    'video,clip,views,0,' + from + ',' + to + ',"Report, ""November"""',
    'video,https://example.test/beta,views,"17,5",' + from + ',' + to + ',Report',
    'video,shared-id,views,21,' + from + ',' + to + ',Report',
    'video,https://example.test/beta/extra,views,8,' + from + ',' + to + ',Report',
    'video,,followers,22,' + from + ',,Report',
  ].join('\r\n'), platformId, known)

  assert.deepEqual(rows.map(row => [row.line, row.measurement?.publicationId, row.measurement?.value, row.error, row.ambiguous]), [
    [2, 'alpha', 0, undefined, false],
    [3, 'beta', 17.5, undefined, false],
    [4, '', 21, undefined, true],
    [5, '', 8, undefined, false],
    [6, '', 22, undefined, false],
  ])
  assert.equal(rows[0].measurement?.source, 'Report, "November"')
  assert.equal(rows[5]?.measurement, undefined)
})

test('CSV rejects malformed headers or quotes and reports invalid rows without hiding valid rows', () => {
  assert.throws(() => previewCsv('', platformId, known), /столбцы/)
  assert.throws(() => previewCsv(header.replace('metric', 'value'), platformId, known), /столбцы/)
  assert.throws(() => previewCsv(header + '\nvideo,"clip', platformId, known), /кавычка/)
  assert.deepEqual(previewCsv(header + '\r\n\r\n', platformId, known), [])

  const rows = previewCsv([
    header,
    'video,clip,views,,' + from + ',' + to + ',Report',
    'video,clip,views,-1,' + from + ',' + to + ',Report',
    'video,clip,views,Infinity,' + from + ',' + to + ',Report',
    'video,clip,views,5,2026-02-30,' + to + ',Report',
    'video,clip,views,5,' + to + ',' + from + ',Report',
    'other,clip,views,5,' + from + ',' + to + ',Report',
    'video,clip,views,5,' + from + ',' + to + ',Report,extra',
    'video,clip,views,5,' + from + ',' + to + ',',
    'video,clip,views,5,' + from + ',' + to + ',Report',
  ].join('\n'), platformId, known)

  assert.deepEqual(rows.map(row => row.error), [
    'Укажите неотрицательное число',
    'Укажите неотрицательное число',
    'Укажите неотрицательное число',
    'Проверьте дату или границы периода',
    'Проверьте дату или границы периода',
    'Другая площадка. Выберите её для импорта',
    'Количество полей не совпадает с заголовком',
    'Укажите метрику и источник',
    undefined,
  ])
  assert.deepEqual(rows.flatMap(row => row.measurement ? [row.measurement.value] : []), [5])
})

test('repeated CSV writes need consent and preserve distinct windows, snapshots and the previous set on rejection', () => {
  const text = readFileSync(new URL('../../fixtures/sample-metrics.csv', import.meta.url), 'utf8')
  const rows = previewCsv(text, platformId, known)
  assert.equal(rows.length, 7)
  assert.match(rows[2].error ?? '', /неотрицательное число/)
  assert.equal(rows[3].reference, 'unknown')
  assert.equal(rows[3].measurement?.publicationId, '')

  const eligible = rows.flatMap(row => row.measurement && (row.measurement.publicationId || !row.reference) ? [row.measurement] : [])
  assert.throws(() => mergeMeasurements([], eligible, platformId, known, false), /confirmed/)
  const saved = mergeMeasurements([], eligible, platformId, known, true)
  assert.deepEqual(saved.map(item => [item.publicationId, item.value, item.from, item.to]), [
    ['alpha', 150, from, to],
    ['alpha', 280, from, '2026-11-27'],
    ['', 100, from, from],
    ['', 112, '2026-11-27', '2026-11-27'],
  ])
  assert.throws(() => mergeMeasurements(saved, eligible, platformId, known, false), /confirmed/)
  assert.deepEqual(mergeMeasurements(saved, eligible, platformId, known, true), saved)

  const foreign: Measurement = { ...saved[0], publicationId: 'foreign-card' }
  const previous = structuredClone(saved)
  assert.throws(() => mergeMeasurements(saved, [{ ...saved[0], value: 999 }, foreign], platformId, known, true), /Invalid measurement/)
  assert.deepEqual(saved, previous)
})
