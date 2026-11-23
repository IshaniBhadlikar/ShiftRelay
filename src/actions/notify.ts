/**
 * Email notifications (P1) via the platform's `email/send` integration,
 * billed to the app owner (developer billing — `email` is not listed in
 * src/integrations.ts, so it defaults to 'developer').
 *
 * Rules (CLAUDE.md + approved plan):
 * - Called ONLY by the action that won its unique write (claimShift, decide()).
 * - Recipients are resolved server-side (users rows, team_members) — never params.
 *   Demo ids (`demo-*`), users without an email, and the actor are skipped.
 * - One email per recipient (no one sees another's address), max 10 per event.
 * - notify() never throws and its outcome never changes the action's result;
 *   failures are logged with the user id (never the address).
 * - Dry run (nothing sent): every DEV build (dev server + all tests — `vite build`
 *   replaces import.meta.env.DEV with false), or EMAIL_DRY_RUN="true" as a
 *   production off switch.
 *
 * Sender: the docs require `<app>@app.space`; the live catalog says `from` is
 * ignored and mail comes from "DeepSpace Apps <notifications@updates.app.space>".
 * We send FROM below either way (see NOTES "Report to DeepSpace").
 */
import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'

export const FROM = 'ShiftRelay <shiftrelay@app.space>'
export const BOARD_URL = 'https://shiftrelay.app.space/home'
export const MAX_RECIPIENTS = 10
const SEND_TIMEOUT_MS = 5_000

export type EmailKind = 'claimed' | 'approved' | 'rejected' | 'released'
type Role = 'poster' | 'manager' | 'claimant'

export type ShiftInfo = {
  title: string
  startsAt: string
  endsAt: string
  postedBy: string
  posterName: string
}

export interface EmailEvent {
  kind: EmailKind
  shiftId: string
  actorId: string
  actorName: string
  claimantId: string
  claimantName: string
}

export interface PlannedEmail {
  toUserId: string
  to: string
  subject: string
  text: string
}

export interface NotifyResult {
  mode: 'sent' | 'dry-run'
  emails: PlannedEmail[]
  failed: number
}

/** True when nothing may be sent: any DEV build, or the production off switch. */
export function emailDryRun(env: Pick<Env, 'EMAIL_DRY_RUN'>): boolean {
  return import.meta.env.DEV || env.EMAIL_DRY_RUN === 'true'
}

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')
const utcDay = (d: Date) => `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
const utcTime = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`

/** "Tue 8 Dec 2026, 19:00–23:00 UTC", or "Tue 8 Dec 2026, 21:00 – Wed 9 Dec 05:00 UTC" overnight. */
export function formatUtcRange(startIso: string, endIso: string): string {
  const s = new Date(startIso)
  const e = new Date(endIso)
  const sameDay = s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth() && s.getUTCDate() === e.getUTCDate()
  const head = `${utcDay(s)} ${s.getUTCFullYear()}, ${utcTime(s)}`
  return sameDay ? `${head}–${utcTime(e)} UTC` : `${head} – ${utcDay(e)} ${utcTime(e)} UTC`
}

/**
 * Who gets an email, in priority order (first role wins when one person holds
 * two, e.g. a poster who is also a manager). Skips demo ids and the actor;
 * de-duplicates; caps at MAX_RECIPIENTS.
 */
export function pickRecipients(
  kind: EmailKind,
  ids: { posterId: string; claimantId: string; actorId: string; managerIds: string[] },
): { userId: string; role: Role }[] {
  const candidates: { userId: string; role: Role }[] =
    kind === 'claimed'
      ? [{ userId: ids.posterId, role: 'poster' }, ...ids.managerIds.map((userId) => ({ userId, role: 'manager' as const }))]
      : kind === 'released'
        ? [{ userId: ids.posterId, role: 'poster' }]
        : [
            { userId: ids.claimantId, role: 'claimant' },
            { userId: ids.posterId, role: 'poster' },
          ]
  const seen = new Set<string>()
  const out: { userId: string; role: Role }[] = []
  for (const c of candidates) {
    if (!c.userId || c.userId.startsWith('demo-') || c.userId === ids.actorId || seen.has(c.userId)) continue
    seen.add(c.userId)
    out.push(c)
    if (out.length >= MAX_RECIPIENTS) break
  }
  return out
}

/** Subject + plain-text body for one recipient. */
export function buildEmail(event: EmailEvent, shift: ShiftInfo, role: Role): { subject: string; text: string } {
  const t = `"${shift.title}"`
  const claimant = event.claimantName || 'A teammate'
  const actor = event.actorName || 'A manager'
  const poster = shift.posterName || 'a teammate'
  const label = { claimed: 'Claimed', approved: 'Approved', rejected: 'Rejected', released: 'Released' }[event.kind]

  let line: string
  let next: string
  switch (event.kind) {
    case 'claimed':
      line = role === 'poster' ? `${claimant} claimed your shift ${t}.` : `${claimant} claimed ${poster}'s shift ${t}.`
      next = role === 'manager' ? 'It needs a manager to approve or reject it.' : "It's waiting for a manager to approve or reject it."
      break
    case 'approved':
      line = role === 'claimant' ? `${actor} approved your claim on ${t}.` : `${actor} approved ${claimant}'s claim on your shift ${t}.`
      next = role === 'claimant' ? "You're covering this shift." : 'The shift is covered.'
      break
    case 'rejected':
      line = role === 'claimant' ? `${actor} rejected your claim on ${t}.` : `${actor} rejected ${claimant}'s claim on your shift ${t}.`
      next = 'The shift is open again.'
      break
    case 'released':
      line = `${claimant} released their claim on your shift ${t}.`
      next = 'The shift is open again.'
      break
  }

  const when = formatUtcRange(shift.startsAt, shift.endsAt)
  const subject = `${label}: ${shift.title} (${utcDay(new Date(shift.startsAt))})`
  const text = [
    line,
    `When: ${when}`,
    next,
    '',
    `Open the board: ${BOARD_URL}`,
    '',
    "— ShiftRelay records the handoff; it doesn't change the official schedule.",
  ].join('\n')
  return { subject, text }
}

// ── I/O ────────────────────────────────────────────────────────────────────

async function emailOf(tools: ActionTools, userId: string): Promise<string | null> {
  const res = await tools.get<{ email?: string }>('users', userId)
  const email = res.success ? res.data.record.data.email : undefined
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+$/.test(email) ? email : null
}

async function managerIds(tools: ActionTools): Promise<string[]> {
  const res = await tools.query('team_members', { where: { role: 'manager' }, limit: 200 })
  return res.success ? res.data.records.map((r) => r.recordId) : []
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Resolve recipients, build each email, and send (or, in dry run, only plan).
 * NEVER throws; the caller ignores the outcome except to expose `emails` in DEV.
 */
export async function notify(tools: ActionTools, event: EmailEvent, opts: { dryRun: boolean }): Promise<NotifyResult> {
  const mode = opts.dryRun ? 'dry-run' : 'sent'
  try {
    const shiftRes = await tools.get<ShiftInfo>('shifts', event.shiftId)
    if (!shiftRes.success) {
      console.error(`[email] ${event.kind} for shift ${event.shiftId}: shift not readable (${shiftRes.error}); nothing sent`)
      return { mode, emails: [], failed: 0 }
    }
    const shift = shiftRes.data.record.data
    const recipients = pickRecipients(event.kind, {
      posterId: shift.postedBy,
      claimantId: event.claimantId,
      actorId: event.actorId,
      managerIds: event.kind === 'claimed' ? await managerIds(tools) : [],
    })

    const emails: PlannedEmail[] = []
    for (const r of recipients) {
      const to = await emailOf(tools, r.userId)
      if (!to) continue // no users row / no email: skip quietly
      emails.push({ toUserId: r.userId, to, ...buildEmail(event, shift, r.role) })
    }

    if (opts.dryRun) return { mode, emails, failed: 0 }

    const results = await Promise.allSettled(
      emails.map((e) =>
        withTimeout(tools.integration('email/send', { from: FROM, to: e.to, subject: e.subject, text: e.text }), SEND_TIMEOUT_MS),
      ),
    )
    let failed = 0
    results.forEach((r, i) => {
      const reason = r.status === 'rejected' ? String(r.reason) : r.value.success ? null : r.value.error
      if (reason !== null) {
        failed++
        console.error(`[email] ${event.kind} to user ${emails[i].toUserId} (shift ${event.shiftId}) failed: ${reason}`)
      }
    })
    return { mode, emails, failed }
  } catch (err) {
    console.error(`[email] ${event.kind} for shift ${event.shiftId} aborted: ${err instanceof Error ? err.message : String(err)}`)
    return { mode, emails: [], failed: 0 }
  }
}
