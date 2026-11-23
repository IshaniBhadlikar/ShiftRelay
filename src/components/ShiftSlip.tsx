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
  /** Right-aligned action row (buttons). */
  actions?: ReactNode
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
  className,
  ...rest
}: ShiftSlipProps) {
  const [startTime, endTime] = formatTimeParts(startsAt, endsAt)
  return (
    <article
      {...rest}
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground sm:flex-row',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-border px-4 py-3 sm:w-44 sm:shrink-0 sm:flex-col sm:justify-start sm:gap-1 sm:border-b-0 sm:border-r">
        <p className="font-mono text-[13px] font-medium tabular-nums text-foreground" data-testid="shift-time">
          <span className="whitespace-nowrap">{startTime}</span>{' '}
          <span className="whitespace-nowrap">– {endTime}</span>
        </p>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">{formatDuration(startsAt, endsAt)}</p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 break-words text-[15px] font-semibold leading-snug" data-testid="shift-title">
            {title}
          </h3>
          <StateStamp state={state} name={claimantName} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span data-testid="shift-poster">{posterLabel}</span>
          {tags}
        </div>
        {notes && <p className="line-clamp-2 text-sm text-muted-foreground">{notes}</p>}
        {actions && <div className="mt-1 flex flex-wrap justify-end gap-2">{actions}</div>}
        {message}
      </div>
    </article>
  )
}
