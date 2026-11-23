/**
 * Post a shift. Local datetime inputs → UTC ISO via toISOString(); the
 * server (postShift) re-validates everything and its error is shown verbatim.
 */
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button, Input, Label, Textarea, useToast } from '@/components/ui'
import { ShiftSlip } from '@/components/ShiftSlip'
import { useAction } from '@/lib/use-action'
import { useTeam } from '@/lib/team'

const TITLE_MAX = 100
const NOTES_MAX = 500

/** "YYYY-MM-DDTHH:mm" in local time, the format datetime-local inputs use. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A datetime-local value parses as LOCAL time; null if empty/invalid. */
function localToIso(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

type Errors = Partial<Record<'title' | 'start' | 'end' | 'notes', string>>

function validate(title: string, start: string, end: string, notes: string): Errors {
  const errors: Errors = {}
  if (!title.trim()) errors.title = 'Give the shift a title.'
  else if (title.trim().length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`
  const startIso = localToIso(start)
  const endIso = localToIso(end)
  if (!startIso) errors.start = 'Pick when the shift starts.'
  else if (startIso <= new Date().toISOString()) errors.start = 'The start time has to be in the future.'
  if (!endIso) errors.end = 'Pick when the shift ends.'
  else if (startIso && endIso <= startIso) errors.end = 'The end time has to be after the start.'
  if (notes.trim().length > NOTES_MAX) errors.notes = `Keep notes under ${NOTES_MAX} characters.`
  return errors
}

export default function PostShiftPage() {
  const navigate = useNavigate()
  const team = useTeam()
  const { success } = useToast()
  const { busy, error, run } = useAction()

  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const errors = useMemo(() => validate(title, start, end, notes), [title, start, end, notes])
  const show = (k: keyof Errors) => (submitted ? errors[k] : undefined)
  const minStart = useMemo(() => toLocalInput(new Date()), [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length > 0) return
    const res = await run<{ shiftId: string }>('postShift', {
      title: title.trim(),
      startsAt: localToIso(start),
      endsAt: localToIso(end),
      notes: notes.trim(),
    })
    if (res?.success) {
      success('Shift posted', 'Your coworkers can claim it now.')
      navigate('/home')
    }
  }

  const startIso = localToIso(start)
  const endIso = localToIso(end)
  const previewReady = !!startIso && !!endIso && endIso > startIso

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-10 sm:pt-14">
      <Link to="/home" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Board
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Post a shift</h1>
      <p className="mt-2 text-muted-foreground">Need someone to cover? Post it here and a coworker can claim it.</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-5 rounded-lg border border-border bg-card p-5 sm:p-6">
        <Field id="title" label="Title" error={show('title')}>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            placeholder="Front desk — morning"
            aria-invalid={!!show('title')}
            autoComplete="off"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="start" label="Starts" error={show('start')}>
            <Input
              id="start"
              type="datetime-local"
              value={start}
              min={minStart}
              onChange={(e) => setStart(e.target.value)}
              aria-invalid={!!show('start')}
              className="font-mono"
            />
          </Field>
          <Field id="end" label="Ends" error={show('end')}>
            <Input
              id="end"
              type="datetime-local"
              value={end}
              min={start || minStart}
              onChange={(e) => setEnd(e.target.value)}
              aria-invalid={!!show('end')}
              className="font-mono"
            />
          </Field>
        </div>

        <Field
          id="notes"
          label="Notes"
          optional
          error={show('notes')}
          hint={`${notes.trim().length}/${NOTES_MAX}`}
        >
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={NOTES_MAX}
            rows={3}
            placeholder="Anything the person covering should know."
            aria-invalid={!!show('notes')}
          />
        </Field>

        <p className="text-xs text-muted-foreground">
          Times are in your local time zone. This records the handoff; it doesn&apos;t change the official schedule.
        </p>

        {error && (
          <p role="alert" data-testid="post-error" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/home')} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={team.status !== 'ready'}>
            Post shift
          </Button>
        </div>
      </form>

      {previewReady && (
        <section className="mt-8" aria-label="Preview">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Preview</h2>
          <ShiftSlip
            title={title.trim() || 'Untitled shift'}
            startsAt={startIso}
            endsAt={endIso}
            posterLabel="Posted by you"
            notes={notes.trim() || undefined}
            state="open"
          />
        </section>
      )}
    </div>
  )
}

function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  optional?: boolean
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>
          {label}
          {optional && <span className="ml-1.5 font-normal text-muted-foreground">optional</span>}
        </Label>
        {hint && <span className="font-mono text-xs tabular-nums text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
