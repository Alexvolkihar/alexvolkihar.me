// Signed, stateless cookies: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
// The HMAC input is prefixed with the cookie's purpose, so an OAuth state
// cookie can never be replayed as a session cookie (or the other way round).
// Nothing secret is stored in them: they only prove "signed by this server".

import type { AdminConfig } from './config.js'
import { Buffer } from 'node:buffer'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { parseCookies, SESSION_COOKIE } from './http.js'

export const SESSION_TTL = 12 * 60 * 60 // seconds
export const STATE_TTL = 10 * 60

type Purpose = 'session' | 'state'

export interface SessionPayload {
  v: 1
  login: string
  /** Random id: keys the rate limiter, never reused across sign-ins. */
  sid: string
  iat: number
  exp: number
}

export interface StatePayload {
  v: 1
  state: string
  returnTo: string
  exp: number
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function mac(purpose: Purpose, data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`genart-admin:${purpose}:${data}`).digest()
}

export function sign(purpose: Purpose, payload: object, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${data}.${mac(purpose, data, secret).toString('base64url')}`
}

/** Constant-time comparison of two strings (false when lengths differ). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function verify(purpose: Purpose, token: string | undefined, secret: string): unknown {
  if (!token || token.length > 2048)
    return undefined
  const parts = token.split('.')
  if (parts.length !== 2 || !/^[\w-]+$/.test(parts[0]) || !/^[\w-]+$/.test(parts[1]))
    return undefined
  const expected = mac(purpose, parts[0], secret)
  const given = Buffer.from(parts[1], 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return undefined
  try {
    return JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  }
  catch {
    return undefined
  }
}

export function createSession(login: string, secret: string): string {
  const iat = nowSeconds()
  const payload: SessionPayload = { v: 1, login, sid: randomToken(16), iat, exp: iat + SESSION_TTL }
  return sign('session', payload, secret)
}

/** The valid session of this request, or undefined. Re-checks the allowed login every time. */
export function readSession(request: Request, config: AdminConfig): SessionPayload | undefined {
  const p = verify('session', parseCookies(request).get(SESSION_COOKIE), config.sessionSecret) as Partial<SessionPayload> | undefined
  if (!p || p.v !== 1 || typeof p.login !== 'string' || typeof p.sid !== 'string'
    || typeof p.exp !== 'number' || typeof p.iat !== 'number') {
    return undefined
  }
  const now = nowSeconds()
  if (p.exp <= now || p.iat > now + 60 || p.exp - p.iat > SESSION_TTL)
    return undefined
  if (p.login.toLowerCase() !== config.allowedLogin.toLowerCase())
    return undefined
  return p as SessionPayload
}
