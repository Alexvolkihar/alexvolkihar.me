// GET /api/auth/callback?code=...&state=... (GitHub redirects here).
// Checks the state, swaps the code for a token, reads the GitHub identity,
// revokes the token, and opens a session only for the allowed account.

import type { StatePayload } from '../../server/genart-admin/session.js'
import { getConfig } from '../../server/genart-admin/config.js'
import { exchangeCode, fetchUser, revokeToken } from '../../server/genart-admin/github.js'
import { clearCookie, page, parseCookies, redirect, safeReturnTo, serializeCookie, SESSION_COOKIE, STATE_COOKIE } from '../../server/genart-admin/http.js'
import { createSession, nowSeconds, safeEqual, SESSION_TTL, verify } from '../../server/genart-admin/session.js'

export async function GET(request: Request): Promise<Response> {
  const config = getConfig()
  if (!config)
    return page(503, 'Not configured', 'Sign-in is not set up on this deployment.')

  // The state cookie is single-use: cleared on every outcome.
  const clearState = { 'Set-Cookie': clearCookie(STATE_COOKIE, '/api/auth', 'Lax') }
  const params = new URL(request.url).searchParams
  const code = params.get('code')
  const state = params.get('state')

  const saved = verify('state', parseCookies(request).get(STATE_COOKIE), config.sessionSecret) as Partial<StatePayload> | undefined
  if (!state || !saved || saved.v !== 1 || typeof saved.state !== 'string' || typeof saved.exp !== 'number'
    || saved.exp <= nowSeconds() || !safeEqual(state, saved.state)) {
    return page(400, 'Sign-in failed', 'The sign-in request expired or did not start here. Please try again.', clearState)
  }
  if (!code || code.length > 100 || !/^[\w-]+$/.test(code))
    return page(400, 'Sign-in cancelled', 'GitHub did not return an authorisation code.', clearState)

  let user: { login: string, id: number }
  try {
    const token = await exchangeCode(config, code)
    try {
      user = await fetchUser(token)
    }
    finally {
      // Identity only: the token is never stored, and revoked right away.
      await revokeToken(config, token)
    }
  }
  catch {
    return page(502, 'Sign-in failed', 'GitHub could not be reached or refused the request.', clearState)
  }

  const loginOk = user.login.toLowerCase() === config.allowedLogin.toLowerCase()
  const idOk = config.allowedId === undefined || user.id === config.allowedId
  if (!loginOk || !idOk)
    return page(403, 'Not allowed', 'This GitHub account cannot manage the collection.', clearState)

  const headers = new Headers(clearState)
  headers.append('Set-Cookie', serializeCookie(SESSION_COOKIE, createSession(user.login, config.sessionSecret), {
    maxAge: SESSION_TTL,
    path: '/',
    sameSite: 'Strict',
  }))
  const returnTo = safeReturnTo(typeof saved.returnTo === 'string' ? saved.returnTo : undefined, config.siteOrigin)
  return redirect(`${config.siteOrigin}${returnTo}`, headers)
}
