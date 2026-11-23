import { describe, expect, it } from 'vitest'
import { buildBoard, deriveShiftState, type ClaimData, type DecisionData, type ShiftData } from './shift-state'

describe('deriveShiftState', () => {
  it('no claim → open', () => expect(deriveShiftState(false, undefined)).toBe('open'))
  it('claim, no decision → claimed', () => expect(deriveShiftState(true, undefined)).toBe('claimed'))
  it('claim + approved → covered', () => expect(deriveShiftState(true, 'approved')).toBe('covered'))
  it('claim + rejected → open', () => expect(deriveShiftState(true, 'rejected')).toBe('open'))
  it('claim + released → open', () => expect(deriveShiftState(true, 'released')).toBe('open'))
  it('a decision without a claim is ignored → open', () => expect(deriveShiftState(false, 'approved')).toBe('open'))
})

const shift = (id: string): { recordId: string; data: ShiftData } => ({
  recordId: id,
  data: { title: id, startsAt: '2030-01-01T09:00:00.000Z', endsAt: '2030-01-01T13:00:00.000Z', postedBy: 'p', posterName: 'P' },
})
const claim = (id: string, shiftId: string): { recordId: string; data: ClaimData } => ({
  recordId: id,
  data: { shiftId, claimantId: 'c', claimantName: 'C', createdAt: '2029-12-31T00:00:00.000Z' },
})
const decision = (claimId: string, shiftId: string, outcome: DecisionData['outcome']) => ({
  recordId: `d-${claimId}`,
  data: { claimId, shiftId, outcome, actorId: 'm', at: '2029-12-31T01:00:00.000Z', claimantId: 'c' },
})

describe('buildBoard', () => {
  it('joins each shift with its claim and decision', () => {
    const views = buildBoard(
      [shift('s1'), shift('s2'), shift('s3'), shift('s4')],
      [claim('c2', 's2'), claim('c3', 's3'), claim('c4', 's4')],
      [decision('c3', 's3', 'approved'), decision('c4', 's4', 'rejected')],
    )
    expect(views.map((v) => [v.shiftId, v.state, v.claim?.recordId])).toEqual([
      ['s1', 'open', undefined],
      ['s2', 'claimed', 'c2'],
      ['s3', 'covered', 'c3'],
      ['s4', 'open', undefined], // stale claim is not exposed
    ])
  })
})
