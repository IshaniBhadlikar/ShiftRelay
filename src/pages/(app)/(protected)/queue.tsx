/**
 * Manager queue: pending claims (claim, no decision) with Approve / Reject,
 * plus recent decisions. Hiding this page and its buttons is cosmetic —
 * approveClaim / rejectClaim check the manager role and "not your own claim".
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox, ShieldCheck } from 'lucide-react'
import { Button, ConfirmModal, EmptyState, useToast } from '@/components/ui'
import { ShiftSlip, Tag } from '@/components/ShiftSlip'
import { DecisionList } from '@/components/DecisionList'
import { useTeam } from '@/lib/team'
import { useAction } from '@/lib/use-action'
import { useBoardData, useNow } from '@/lib/use-board'
import { isDemoId, type ShiftView } from '@/lib/shift-state'

const HISTORY_LIMIT = 10

export default function QueuePage() {
  const team = useTeam()
  const navigate = useNavigate()

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10 sm:pt-14">
      <h1 className="text-3xl font-semibold tracking-tight">Approval queue</h1>
      <p className="mt-2 text-muted-foreground">Claims waiting for a manager. Approve to mark the shift covered.</p>
      {team.status !== 'ready' ? (
        <div aria-busy="true" className="mt-10 h-28 animate-pulse rounded-lg bg-muted" />
      ) : team.isManager ? (
        <Queue viewerId={team.userId} />
      ) : (
        <EmptyState
          className="mt-10 rounded-lg border border-dashed border-border"
          icon={<ShieldCheck />}
          title="Managers only"
          description="Approving and rejecting claims is for managers. If you have a manager invite code, redeem it in Settings."
          action={{ label: 'Go to Settings', onClick: () => navigate('/settings') }}
        />
      )}
    </div>
  )
}

function Queue({ viewerId }: { viewerId: string }) {
  const now = useNow()
  const { status, error, views, decisions, shifts } = useBoardData()

  const pending = useMemo(
    () => views.filter((v) => v.state === 'claimed' && Date.parse(v.shift.endsAt) > now.getTime()),
    [views, now],
  )

  if (status === 'loading') return <div aria-busy="true" className="mt-10 h-28 animate-pulse rounded-lg bg-muted" />
  if (status === 'error') {
    return (
      <p role="alert" className="mt-10 rounded-lg border border-border bg-card p-4 text-sm text-destructive">
        {error ?? 'Could not load the queue.'}
      </p>
    )
  }

  return (
    <div className="mt-10 flex flex-col gap-12">
      <section aria-label="Pending claims" data-testid="queue-pending">
        <h2 className="mb-4 flex items-baseline gap-2 text-lg font-semibold">
          Pending
          <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">{pending.length}</span>
        </h2>
        {pending.length ? (
          <ul className="flex flex-col gap-3">
            {pending.map((v) => (
              <li key={v.shiftId}>
                <PendingClaim view={v} viewerId={viewerId} now={now} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            className="rounded-lg border border-dashed border-border py-10"
            icon={<Inbox />}
            title="Nothing to review"
            description="When a coworker claims a shift, it waits here for approval."
          />
        )}
      </section>

      <section aria-label="Recent decisions">
        <h2 className="mb-4 text-lg font-semibold">Recent decisions</h2>
        {decisions.length ? (
          <DecisionList
            data-testid="queue-history"
            decisions={decisions}
            shifts={shifts}
            viewerId={viewerId}
            limit={HISTORY_LIMIT}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No decisions yet.</p>
        )}
      </section>
    </div>
  )
}

function PendingClaim({ view, viewerId, now }: { view: ShiftView; viewerId: string; now: Date }) {
  const { shift, shiftId, claim } = view
  const { pending, busy, error, run } = useAction()
  const { success } = useToast()
  const [confirmReject, setConfirmReject] = useState(false)
  if (!claim) return null

  const claimant = claim.data.claimantName
  const ownClaim = claim.data.claimantId === viewerId
  const started = Date.parse(shift.startsAt) <= now.getTime()

  async function approve() {
    const res = await run('approveClaim', { claimId: claim!.recordId })
    if (res?.success) success('Claim approved', `${claimant} is covering ${shift.title}.`)
  }
  async function reject() {
    const res = await run('rejectClaim', { claimId: claim!.recordId })
    setConfirmReject(false)
    if (res?.success) success('Claim rejected', 'The shift is open again.')
  }

  return (
    <>
      <ShiftSlip
        data-testid="queue-item"
        data-shift-id={shiftId}
        title={shift.title}
        startsAt={shift.startsAt}
        endsAt={shift.endsAt}
        posterLabel={shift.postedBy === viewerId ? 'Posted by you' : `Posted by ${shift.posterName}`}
        notes={shift.notes}
        state="claimed"
        claimantName={claimant}
        dimmed={started}
        tags={
          <>
            {isDemoId(shiftId) && <Tag>Demo</Tag>}
            {started && <Tag>In progress</Tag>}
          </>
        }
        actions={
          ownClaim ? undefined : (
            <>
              <Button size="sm" variant="outline" onClick={() => setConfirmReject(true)} disabled={busy}>
                Reject
              </Button>
              <Button size="sm" onClick={approve} loading={pending === 'approveClaim'} disabled={busy}>
                Approve
              </Button>
            </>
          )
        }
        message={
          <>
            {ownClaim && (
              <p className="text-right text-sm text-muted-foreground">This is your claim. Another manager has to decide it.</p>
            )}
            {error && (
              <p role="alert" data-testid="queue-error" className="text-right text-sm text-destructive">
                {error}
              </p>
            )}
          </>
        }
      />
      <ConfirmModal
        open={confirmReject}
        onClose={() => !busy && setConfirmReject(false)}
        onConfirm={reject}
        title={`Reject ${claimant}'s claim on '${shift.title}'?`}
        description="The shift goes back to open and anyone can claim it."
        confirmText="Reject"
        cancelText="Cancel"
        loading={pending === 'rejectClaim'}
      />
    </>
  )
}
