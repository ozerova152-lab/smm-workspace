export function dateKey(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset, 12).toLocaleDateString('sv-SE')
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = new Date(value + 'T00:00:00Z')
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 10) === value
}
