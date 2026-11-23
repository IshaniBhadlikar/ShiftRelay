/**
 * The shift "slip": a timecard column (mono times, perforated edge) beside
 * the shift details and its state stamp. Purely presentational — no SDK
 * imports — so the static landing page can render it too.
 */
import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDuration, formatTimeParts } from '@/lib/format'
import type { ShiftState } from '@/lib/shift-state'

export function StateStamp({ state, name }: { state: ShiftState; name?: string }) {
  const label = state === 'open' ? 'Open' : `${state === 'claimed' ? 'Claimed' : 'Covered'} by ${name ?? 'a teammate'}`
  return (
    <span
      data-testid="shift-state"
      data-state={state}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium',
        state === 'open' && 'border-border text-muted-foreground',
        state === 'claimed' && 'border-claimed/30 bg-claimed-soft text-claimed',
        state === 'covered' && 'border-covered/40 bg-covered-soft text-covered',
      )}
    >
      {state === 'covered' && <Check className="size-3.5" aria-hidden />}
      {label}
    </span>
  )
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-sm bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground">{children}</span>
  )
}

export interface ShiftSlipProps {
  title: string
  startsAt: string
  endsAt: string
  posterLabel: string
  notes?: string
  state: ShiftState
  claimantName?: string
  tags?: ReactNode
  /** Buttons, stacked under the state stamp. */
  actions?: ReactNode
  /** Fade the slip (e.g. the shift is already in progress). */
  dimmed?: boolean
  /** Rendered under the action row (e.g. a verbatim server error). */
  message?: ReactNode
  className?: string
  'data-testid'?: string
  'data-shift-id'?: string
}

export function ShiftSlip({
  title,
  startsAt,
  endsAt,
  posterLabel,
  notes,
  state,
  claimantName,
  tags,
  actions,
  message,
  dimmed = false,
  className,
  ...rest
}: ShiftSlipProps) {
  const [startTime, endTime] = formatTimeParts(startsAt, endsAt)
  return (
    <article
      {...rest}
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground transition-opacity sm:flex-row',
        dimmed && 'opacity-60',
        className,
      )}
    >
      {/* Fixed-width timecard column. From sm up, start and "– end" are always
          their own lines, so every card breaks the same way. */}
      <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-border px-4 py-3 sm:w-48 sm:shrink-0 sm:flex-col sm:justify-start sm:gap-1 sm:border-b-0 sm:border-r">
        <p className="font-mono text-[13px] font-medium tabular-nums leading-5 text-foreground" data-testid="shift-time">
          <span className="whitespace-nowrap sm:block">{startTime}</span>
          <span className="sm:hidden"> </span>
          <span className="whitespace-nowrap sm:block">– {endTime}</span>
        </p>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">{formatDuration(startsAt, endsAt)}</p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="break-words text-[15px] font-semibold leading-snug" data-testid="shift-title">
              {title}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span data-testid="shift-poster">{posterLabel}</span>
              {tags}
            </div>
            {notes && <p className="line-clamp-2 text-sm text-muted-foreground">{notes}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <StateStamp state={state} name={claimantName} />
            {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
          </div>
        </div>
        {message}
      </div>
    </article>
  )
}
