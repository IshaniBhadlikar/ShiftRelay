/**
 * Design Direction
 *
 * Product: A shift board for one workplace — you post a shift you can't make,
 *   a coworker claims it, a manager approves or rejects, and everyone sees the
 *   same answer.
 * Emotion: The exhale when the slip on the break-room board says "Covered" and
 *   you can stop texting around.
 * Metaphor: A paper swap slip pinned to a break-room corkboard, stamped in green
 *   ink by the manager.
 * References: Punch-clock timecards; library due-date slips; Swiss railway
 *   departure boards.
 * Signature: The timecard slip — a perforated mono time column beside the
 *   shift, with a state stamp (Open → Claimed → Covered).
 * Hero: Nothing animates. One slip shown at its three stations, top to bottom,
 *   so the relay reads at a glance.
 *
 * Style Tile
 * - Color: Warm paper dominant, graphite ink, one deep-green stamp accent
 *   (Covered + primary actions), muted ochre for Claimed; muted everywhere.
 * - Type: IBM Plex Sans (headings + body) + IBM Plex Mono (times only) — plain,
 *   legible on a phone in a back room; the mono gives the timecard.
 * - Theme: Light — read on phones under bright fluorescent back-room lights.
 * - Art direction: Modern minimalism — whitespace, borders not shadows, one accent.
 * - Motion: Stillness — a handoff should feel settled, not urgent.
 * - Voice: Second person; no exclamation points; never starts with "we".
 *
 * Static landing (top level of src/pages/): no providers, no auth fetch, no
 * WebSocket. ShiftSlip is presentational (no SDK imports), and the mockup
 * uses fixed time labels so the prerendered HTML matches every time zone.
 */

import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Seo } from '../components/Seo'
import { ShiftSlip } from '../components/ShiftSlip'
import { APP_NAME } from '../constants'
import { seo } from '../seo'
import type { ShiftState } from '../lib/shift-state'

// Placeholder instants; display comes from LABELS, never from these.
const T0 = '2030-01-01T09:00:00.000Z'
const T1 = '2030-01-01T13:00:00.000Z'
const LABELS = { start: 'Sat 9:00 AM', end: '1:00 PM', duration: '4 h' }

const STATIONS: { step: string; state: ShiftState; claimant?: string; caption: string }[] = [
  { step: '1', state: 'open', caption: 'You post it' },
  { step: '2', state: 'claimed', claimant: 'Sam', caption: 'A coworker claims it' },
  { step: '3', state: 'covered', claimant: 'Sam', caption: 'A manager approves' },
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="flex min-h-screen flex-col">
        <header className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <span className="text-[15px] font-semibold tracking-tight text-foreground">{APP_NAME}</span>
          <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        </header>

        <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 px-4 py-12 md:grid-cols-[1fr_minmax(0,26rem)] md:gap-16 md:py-20">
          <div>
            <h1 className="max-w-lg text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
              Hand off a shift without the group chat.
            </h1>
            <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-muted-foreground">
              {APP_NAME} is a shift board for one workplace. When you can&apos;t make a shift, post it. A coworker
              claims it, a manager approves or rejects the claim, and everyone sees the same answer the moment
              it&apos;s decided. One claim per shift and one decision per claim, so two people never both think
              they&apos;re covering Saturday. It records the handoff; your official schedule stays where it is.
            </p>
            <Link
              to="/home"
              className="mt-8 inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Open the board <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>

          <ol aria-label="How a handoff moves" className="flex flex-col gap-3">
            {STATIONS.map((s, i) => (
              <li key={s.step} className="flex flex-col gap-2">
                <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  <span className="inline-flex size-5 items-center justify-center rounded-full border border-border text-[11px]">
                    {s.step}
                  </span>
                  {s.caption}
                </p>
                <ShiftSlip
                  title="Front desk — morning"
                  startsAt={T0}
                  endsAt={T1}
                  timeLabels={LABELS}
                  posterLabel="Posted by Alex"
                  state={s.state}
                  claimantName={s.claimant}
                  className={i < STATIONS.length - 1 ? 'opacity-80' : undefined}
                />
              </li>
            ))}
          </ol>
        </main>

        <footer className="mx-auto w-full max-w-5xl border-t border-border px-4 py-6 text-xs text-muted-foreground">
          {APP_NAME} records who covers a shift. It doesn&apos;t change the official schedule.
        </footer>
      </div>
    </>
  )
}
