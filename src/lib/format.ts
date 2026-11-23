/** Display formatting in the viewer's own locale and time zone. Stored times are UTC ISO. */

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const stampFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const localDayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/** "Tue, Dec 8" — or "Today" / "Tomorrow". */
export function formatDay(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (localDayKey(d) === localDayKey(now)) return 'Today'
  if (localDayKey(d) === localDayKey(tomorrow)) return 'Tomorrow'
  return dayFmt.format(d)
}

export const dayKey = (iso: string) => localDayKey(new Date(iso))

/** ["9:00 AM", "1:00 PM"], with " (+1 day)" on the end when it falls on a later local day. */
export function formatTimeParts(startIso: string, endIso: string): [string, string] {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()
  const days = Math.round((endDay - startDay) / 86_400_000)
  const suffix = days > 0 ? ` (+${days} day${days > 1 ? 's' : ''})` : ''
  return [timeFmt.format(start), `${timeFmt.format(end)}${suffix}`]
}

/** "9:00 AM – 1:00 PM". */
export const formatTimeRange = (startIso: string, endIso: string) => formatTimeParts(startIso, endIso).join(' – ')

/** "4 h", "4 h 30 m", "45 m". */
export function formatDuration(startIso: string, endIso: string): string {
  const mins = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (!h) return `${m} m`
  return m ? `${h} h ${m} m` : `${h} h`
}

/** "Dec 8, 3:04 PM" — for audit timestamps. */
export const formatStamp = (iso: string) => stampFmt.format(new Date(iso))
