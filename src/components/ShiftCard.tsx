/**
 * A live board card: ShiftSlip + the actions this user may take.
 *
 * Buttons are HIDDEN when the user can't use them — purely cosmetic; every
 * action re-checks on the server. Errors are shown exactly as the server
 * returns them; all buttons on the card are disabled while a request is in flight.
 */
import { useState } from 'react'
import { Button, ConfirmModal, useToast } from '@/components/ui'
import { ShiftSlip, Tag } from './ShiftSlip'
import { useAction } from '@/lib/use-action'
import { isDemoId, type ShiftView } from '@/lib/shift-state'

export interface Viewer {
  userId: string
}

export function ShiftCard({ view, viewer, now }: { view: ShiftView; viewer: Viewer | null; now: Date }) {
  const { shift, state, claim, shiftId } = view
  const { pending, busy, error, run } = useAction()
  const { success } = useToast()
  const [confirmRelease, setConfirmRelease] = useState(false)

  const mine = viewer?.userId === shift.postedBy
  const started = Date.parse(shift.startsAt) <= now.getTime()
  const canClaim = !!viewer && state === 'open' && !mine && !started
  const canRelease = !!viewer && state === 'claimed' && claim?.data.claimantId === viewer.userId

  async function claimShift() {
    const res = await run('claimShift', { shiftId })
    if (res?.success) success('Shift claimed', 'A manager will approve or reject your claim.')
  }

  async function releaseClaim() {
    if (!claim) return
    const res = await run('releaseClaim', { claimId: claim.recordId })
    setConfirmRelease(false)
    if (res?.success) success('Claim released', 'The shift is open again.')
  }

  return (
    <>
      <ShiftSlip
        data-testid="shift-card"
        data-shift-id={shiftId}
        title={shift.title}
        startsAt={shift.startsAt}
        endsAt={shift.endsAt}
        posterLabel={mine ? 'Posted by you' : `Posted by ${shift.posterName}`}
        notes={shift.notes}
        state={state}
        claimantName={claim?.data.claimantName}
        tags={
          <>
            {isDemoId(shiftId) && <Tag>Demo</Tag>}
            {started && <Tag>In progress</Tag>}
          </>
        }
        actions={
          canClaim || canRelease ? (
            <>
              {canClaim && (
                <Button size="sm" onClick={claimShift} loading={pending === 'claimShift'} disabled={busy}>
                  Claim
                </Button>
              )}
              {canRelease && (
                <Button size="sm" variant="outline" onClick={() => setConfirmRelease(true)} disabled={busy}>
                  Release
                </Button>
              )}
            </>
          ) : undefined
        }
        message={
          error && (
            <p role="alert" data-testid="shift-error" className="text-right text-sm text-destructive">
              {error}
            </p>
          )
        }
      />
      <ConfirmModal
        open={confirmRelease}
        onClose={() => !busy && setConfirmRelease(false)}
        onConfirm={releaseClaim}
        title={`Release your claim on '${shift.title}'?`}
        description="The shift goes back to open and anyone can claim it."
        confirmText="Release"
        cancelText="Keep claim"
        loading={pending === 'releaseClaim'}
      />
    </>
  )
}
