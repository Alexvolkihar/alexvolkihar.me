// POST /api/auth/logout -> clears the session cookie.
// Sessions are stateless: to revoke every session at once, rotate SESSION_SECRET.

import { getConfig } from '../../server/genart-admin/config.js'
import { checkSameOrigin, clearCookie, error, json, SESSION_COOKIE } from '../../server/genart-admin/http.js'

export function POST(request: Request): Response {
  const config = getConfig()
  if (!config)
    return error(503, 'Not configured')
  const denied = checkSameOrigin(request, config)
  if (denied)
    return denied
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(SESSION_COOKIE, '/', 'Strict') })
}
