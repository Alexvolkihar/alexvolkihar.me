// GET /api/auth/login?returnTo=/genart/... -> GitHub authorize page.
// A random `state` goes to GitHub and, signed, into a short-lived cookie.

import { getConfig } from '../../server/genart-admin/config.js'
import { authorizeUrl } from '../../server/genart-admin/github.js'
import { page, redirect, safeReturnTo, serializeCookie, STATE_COOKIE } from '../../server/genart-admin/http.js'
import { nowSeconds, randomToken, sign, STATE_TTL } from '../../server/genart-admin/session.js'

export function GET(request: Request): Response {
  const config = getConfig()
  if (!config)
    return page(503, 'Not configured', 'Sign-in is not set up on this deployment.')

  const returnTo = safeReturnTo(new URL(request.url).searchParams.get('returnTo'), config.siteOrigin)
  const state = randomToken(32)
  const cookie = sign('state', { v: 1, state, returnTo, exp: nowSeconds() + STATE_TTL }, config.sessionSecret)

  return redirect(authorizeUrl(config, state), {
    // Lax: it must come back on the top-level redirect from github.com.
    'Set-Cookie': serializeCookie(STATE_COOKIE, cookie, { maxAge: STATE_TTL, path: '/api/auth', sameSite: 'Lax' }),
  })
}
