// Small Web-standard helpers shared by the admin functions: cookies,
// responses with safe default headers, and the same-origin checks.

import type { AdminConfig } from './config.js'

export const SESSION_COOKIE = 'ga_session'
export const STATE_COOKIE = 'ga_oauth_state'

/** Header every state-changing request from our own pages carries. */
export const CSRF_HEADER = 'x-requested-with'
export const CSRF_VALUE = 'genart'

const BASE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
}

export function parseCookies(request: Request): Map<string, string> {
  const out = new Map<string, string>()
  const header = request.headers.get('cookie')
  if (!header)
    return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 1)
      continue
    const name = part.slice(0, i).trim()
    // First occurrence wins (the most specific path is sent first).
    if (!out.has(name))
      out.set(name, part.slice(i + 1).trim())
  }
  return out
}

interface CookieOptions {
  maxAge: number
  path: string
  sameSite: 'Strict' | 'Lax'
}

export function serializeCookie(name: string, value: string, { maxAge, path, sameSite }: CookieOptions): string {
  return `${name}=${value}; Max-Age=${maxAge}; Path=${path}; HttpOnly; Secure; SameSite=${sameSite}`
}

export function clearCookie(name: string, path: string, sameSite: 'Strict' | 'Lax'): string {
  return serializeCookie(name, '', { maxAge: 0, path, sameSite })
}

function withHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(BASE_HEADERS)
  if (extra) {
    for (const [k, v] of new Headers(extra))
      headers.append(k, v)
  }
  return headers
}

export function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = withHeaders(extra)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { status, headers })
}

export function error(status: number, message: string, extra?: HeadersInit): Response {
  return json({ ok: false, error: message }, status, extra)
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

/** Minimal static HTML page (no script, no external resources). */
export function page(status: number, title: string, message: string, extra?: HeadersInit): Response {
  const headers = withHeaders(extra)
  headers.set('Content-Type', 'text/html; charset=utf-8')
  headers.set('Content-Security-Policy', 'default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'; frame-ancestors \'none\'')
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem">
<h1 style="font-size:1.25rem">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="/genart/collection">Back to the collection</a></p>`
  return new Response(html, { status, headers })
}

export function redirect(location: string, extra?: HeadersInit): Response {
  const headers = withHeaders(extra)
  headers.set('Location', location)
  return new Response(null, { status: 303, headers })
}

/**
 * Same-path return target on our own site, or the default. Rejects absolute
 * URLs, protocol-relative ("//evil", "/\\evil") and anything with control
 * characters, then re-checks the resolved origin: no open redirect.
 */
export function safeReturnTo(value: string | null | undefined, siteOrigin: string, fallback = '/genart/collection'): string {
  if (!value || value.length > 512 || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return fallback
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(value))
    return fallback
  try {
    const url = new URL(value, siteOrigin)
    if (url.origin !== siteOrigin || url.pathname.startsWith('/api/'))
      return fallback
    return `${url.pathname}${url.search}${url.hash}`
  }
  catch {
    return fallback
  }
}

/**
 * CSRF defence for state-changing requests, on top of the SameSite=Strict
 * session cookie: the request must come from our own origin (Origin header)
 * and carry a custom header, which a cross-site form or <img> cannot send and
 * which forces a CORS preflight we never answer.
 */
export function checkSameOrigin(request: Request, config: AdminConfig): Response | undefined {
  const origin = request.headers.get('origin')
  if (!origin || origin !== config.siteOrigin)
    return error(403, 'Forbidden origin')
  if (request.headers.get(CSRF_HEADER) !== CSRF_VALUE)
    return error(403, 'Missing request header')
  const secFetchSite = request.headers.get('sec-fetch-site')
  if (secFetchSite && secFetchSite !== 'same-origin')
    return error(403, 'Forbidden origin')
  return undefined
}
