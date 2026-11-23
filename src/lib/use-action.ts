/**
 * Call a server action with in-flight tracking and the server's error kept
 * VERBATIM for display. One request at a time per hook instance: while one is
 * pending, further calls are ignored (buttons are disabled too).
 */
import { useCallback, useRef, useState } from 'react'
import { callAction, type ActionResponse } from './actions'

export function useAction() {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const run = useCallback(async <T = unknown>(name: string, params: Record<string, unknown> = {}): Promise<ActionResponse<T> | null> => {
    if (inFlight.current) return null
    inFlight.current = true
    setPending(name)
    setError(null)
    try {
      const res = await callAction<T>(name, params)
      if (!res.success) setError(res.error)
      return res
    } finally {
      inFlight.current = false
      setPending(null)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])
  return { pending, busy: pending !== null, error, run, clearError }
}
