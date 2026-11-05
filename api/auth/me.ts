// GET /api/auth/me -> { login } with a valid session, 401 otherwise.

import { getConfig } from '../../server/genart-admin/config.js'
import { error, json } from '../../server/genart-admin/http.js'
import { readSession } from '../../server/genart-admin/session.js'

export function GET(request: Request): Response {
  const config = getConfig()
  const session = config && readSession(request, config)
  if (!session)
    return error(401, 'Not signed in')
  return json({ login: session.login })
}
