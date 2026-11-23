import { expect, type APIRequestContext } from '@playwright/test'

/** Bearer token for a signed-in context (same call as the client's getAuthToken). */
export async function bearer(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/auth/token', { headers: { 'Content-Type': 'application/json' } })
  expect(res.ok(), `token status ${res.status()}`).toBeTruthy()
  const { token } = (await res.json()) as { token?: string }
  expect(token).toBeTruthy()
  return token!
}

/** The `sub` (userId) of a JWT. Test-side decode only; the worker verifies. */
export function tokenSubject(token: string): string {
  const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  const payload = JSON.parse(atob(part)) as { sub: string }
  return payload.sub
}

/** POST /api/actions/<name> as the token's user; logs the raw response. */
export async function callAction(request: APIRequestContext, token: string, name: string, params: object = {}): Promise<any> {
  const res = await request.post(`/api/actions/${name}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: params,
  })
  const body = await res.json()
  console.log(`[${name}] HTTP ${res.status()} ${JSON.stringify(body)}`)
  expect(res.status()).toBe(200)
  return body
}
