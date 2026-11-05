// GitHub calls made by the functions. Tokens only ever travel in the
// Authorization header of requests to github.com / api.github.com; they are
// never logged, stored or returned to the browser.

import type { AdminConfig } from './config.js'
import { Buffer } from 'node:buffer'

const API = 'https://api.github.com'
const TIMEOUT = 10_000

export class GitHubError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function apiHeaders(token: string): HeadersInit {
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'alexvolkihar-genart-admin',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

// ---- OAuth (identity) ---------------------------------------------------

export function authorizeUrl(config: AdminConfig, state: string): string {
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', `${config.siteOrigin}/api/auth/callback`)
  // No `scope` parameter on purpose: the token can only read public profile data.
  url.searchParams.set('state', state)
  url.searchParams.set('allow_signup', 'false')
  return url.toString()
}

export async function exchangeCode(config: AdminConfig, code: string): Promise<string> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'alexvolkihar-genart-admin' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: `${config.siteOrigin}/api/auth/callback`,
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  })
  const data = await res.json().catch(() => undefined) as { access_token?: unknown } | undefined
  if (!res.ok || typeof data?.access_token !== 'string' || !data.access_token)
    throw new GitHubError(res.status, 'OAuth code exchange failed')
  return data.access_token
}

export async function fetchUser(token: string): Promise<{ login: string, id: number }> {
  const res = await fetch(`${API}/user`, { headers: apiHeaders(token), signal: AbortSignal.timeout(TIMEOUT) })
  const data = await res.json().catch(() => undefined) as { login?: unknown, id?: unknown } | undefined
  if (!res.ok || typeof data?.login !== 'string' || typeof data.id !== 'number')
    throw new GitHubError(res.status, 'GitHub user lookup failed')
  return { login: data.login, id: data.id }
}

/** Revoke the identity token right away: it has served its purpose. Best effort. */
export async function revokeToken(config: AdminConfig, token: string): Promise<void> {
  try {
    await fetch(`${API}/applications/${encodeURIComponent(config.clientId)}/token`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        'User-Agent': 'alexvolkihar-genart-admin',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ access_token: token }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
  }
  catch {}
}

// ---- Contents API (commit) ----------------------------------------------

function contentsUrl(config: AdminConfig, path: string): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `${API}/repos/${config.repo}/contents/${encoded}`
}

export async function fileExists(config: AdminConfig, path: string): Promise<boolean> {
  const res = await fetch(`${contentsUrl(config, path)}?ref=${encodeURIComponent(config.branch)}`, {
    headers: apiHeaders(config.commitToken),
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (res.status === 404)
    return false
  const data = await res.json().catch(() => undefined) as { type?: unknown } | undefined
  if (!res.ok)
    throw new GitHubError(res.status, 'GitHub contents lookup failed')
  return data?.type === 'file'
}

export async function getFile(config: AdminConfig, path: string): Promise<{ text: string, sha: string }> {
  const res = await fetch(`${contentsUrl(config, path)}?ref=${encodeURIComponent(config.branch)}`, {
    headers: apiHeaders(config.commitToken),
    signal: AbortSignal.timeout(TIMEOUT),
  })
  const data = await res.json().catch(() => undefined) as { type?: unknown, encoding?: unknown, content?: unknown, sha?: unknown } | undefined
  if (!res.ok || data?.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string' || typeof data.sha !== 'string')
    throw new GitHubError(res.status, 'Could not read the collection file')
  return { text: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.sha }
}

/** Returns the commit URL, or throws GitHubError (status 409 = the file moved on). */
export async function putFile(config: AdminConfig, path: string, text: string, sha: string, message: string): Promise<string> {
  const res = await fetch(contentsUrl(config, path), {
    method: 'PUT',
    headers: { ...apiHeaders(config.commitToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: Buffer.from(text, 'utf8').toString('base64'),
      sha,
      branch: config.branch,
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  })
  const data = await res.json().catch(() => undefined) as { commit?: { html_url?: unknown } } | undefined
  if (!res.ok)
    throw new GitHubError(res.status, 'Commit failed')
  const url = data?.commit?.html_url
  return typeof url === 'string' && url.startsWith('https://github.com/') ? url : `https://github.com/${config.repo}/commits/${config.branch}`
}
