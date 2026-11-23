/**
 * Team membership for the signed-in user, read live from `team_members`.
 *
 * First visit: if the signed-in user has no team_members row, call joinTeam
 * ONCE (per user id, per page load), then the row arrives over useQuery.
 * joinTeam is idempotent server-side, so a spurious extra call is harmless.
 *
 * Reading the row relies on team_members `member: { read: 'own' }`: the SDK
 * stamps `_created_by` with the action caller's id (src/server/action-routes.ts
 * sends X-User-Id = ctx.userId), and joinTeam is the only action that creates
 * a user's own row, so `own` matches.
 *
 * The role here only decides what UI to SHOW. Every action re-checks it.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth, useQuery } from 'deepspace'
import { callAction } from './actions'

export type TeamRole = 'worker' | 'manager'

export type TeamState =
  | { status: 'signed-out' }
  | { status: 'loading' }
  | { status: 'joining' }
  | { status: 'error'; error: string; retry: () => void }
  | { status: 'ready'; userId: string; role: TeamRole; displayName: string; isManager: boolean }

const TeamContext = createContext<TeamState>({ status: 'loading' })

export function TeamProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth()
  const { records, status, error: queryError } = useQuery<{ role: string; displayName: string }>('team_members')
  const row = userId ? records.find((r) => r.recordId === userId) : undefined

  const attemptedFor = useRef<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const join = useCallback(async () => {
    setJoining(true)
    setJoinError(null)
    const res = await callAction('joinTeam')
    setJoining(false)
    if (!res.success) setJoinError(res.error)
  }, [])

  useEffect(() => {
    if (!isSignedIn || !userId || status !== 'ready' || row) return
    if (attemptedFor.current === userId) return
    attemptedFor.current = userId
    void join()
  }, [isSignedIn, userId, status, row, join])

  let value: TeamState
  if (!isLoaded) value = { status: 'loading' }
  else if (!isSignedIn || !userId) value = { status: 'signed-out' }
  else if (row && (row.data.role === 'worker' || row.data.role === 'manager')) {
    value = {
      status: 'ready',
      userId,
      role: row.data.role,
      displayName: row.data.displayName || 'Team member',
      isManager: row.data.role === 'manager',
    }
  } else if (joinError) value = { status: 'error', error: joinError, retry: () => void join() }
  else if (status === 'error') value = { status: 'error', error: queryError ?? 'Could not load your team membership.', retry: () => window.location.reload() }
  else if (joining || status === 'ready') value = { status: 'joining' }
  else value = { status: 'loading' }

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>
}

export function useTeam(): TeamState {
  return useContext(TeamContext)
}
