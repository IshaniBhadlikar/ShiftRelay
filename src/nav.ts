/**
 * Navigation Config
 *
 * Add one entry per nav item. Routes are handled by generouted
 * (file-based routing in src/pages/), this just controls what
 * appears in the navigation bar.
 */

import type { Role } from './constants'

export interface NavItem {
  path: string
  label: string
  roles?: Role[]
  devOnly?: boolean
  /** Shown only to team managers (team_members.role). Cosmetic — actions enforce. */
  managerOnly?: boolean
}

export const nav: NavItem[] = [
  { path: '/home', label: 'Board' },
  { path: '/post', label: 'Post a shift' },
  { path: '/activity', label: 'My activity' },
  { path: '/queue', label: 'Queue', managerOnly: true },
  { path: '/settings', label: 'Settings' },
  // The /api-status debug page still exists — add
  // `{ path: '/api-status', label: 'API Status', devOnly: true }` to surface it.
  // ── Features add nav items below this line ──
]
