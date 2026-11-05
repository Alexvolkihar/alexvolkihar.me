// Environment of the genart admin functions (api/auth/*, api/collection).
// Every secret stays on the server: nothing here is ever sent to the browser.
// When a required variable is missing the endpoints answer 503 and do nothing.

export interface AdminConfig {
  /** GitHub OAuth App (identity only, no scopes). */
  clientId: string
  clientSecret: string
  /** HMAC key for the session and state cookies (>= 32 chars). */
  sessionSecret: string
  /** The only GitHub login allowed in (compared case-insensitively). */
  allowedLogin: string
  /** Optional numeric GitHub user id, pinned in addition to the login. */
  allowedId?: number
  /** Canonical origin of the site, e.g. https://www.alexvolkihar.ovh */
  siteOrigin: string
  /** Fine-grained PAT, this repository only, Contents: read & write. */
  commitToken: string
  /** owner/name */
  repo: string
  branch: string
}

const LOGIN_RE = /^[a-z\d][a-z\d-]{0,38}$/i
const REPO_RE = /^[\w.-]{1,100}\/[\w.-]{1,100}$/
const BRANCH_RE = /^[\w./-]{1,100}$/

function env(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value || undefined
}

/** Canonical "scheme://host[:port]" of an origin, or undefined if it is not one. */
export function normalizeOrigin(value: string | undefined): string | undefined {
  if (!value)
    return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))
      return undefined
    return url.origin
  }
  catch {
    return undefined
  }
}

export function getConfig(): AdminConfig | undefined {
  const clientId = env('GITHUB_CLIENT_ID')
  const clientSecret = env('GITHUB_CLIENT_SECRET')
  const sessionSecret = env('SESSION_SECRET')
  const allowedLogin = env('ALLOWED_GITHUB_LOGIN')
  const siteOrigin = normalizeOrigin(env('SITE_ORIGIN'))
  const commitToken = env('GITHUB_COMMIT_TOKEN')
  const repo = env('GITHUB_REPO') ?? 'Alexvolkihar/alexvolkihar.me'
  const branch = env('GITHUB_BRANCH') ?? 'main'
  const idText = env('ALLOWED_GITHUB_ID')
  const allowedId = idText && /^\d{1,15}$/.test(idText) ? Number(idText) : undefined

  if (!clientId || !clientSecret || !sessionSecret || !allowedLogin || !siteOrigin || !commitToken)
    return undefined
  if (sessionSecret.length < 32 || !LOGIN_RE.test(allowedLogin) || !REPO_RE.test(repo) || !BRANCH_RE.test(branch))
    return undefined
  // A malformed ALLOWED_GITHUB_ID must not silently disable the id check.
  if (idText && allowedId === undefined)
    return undefined

  return { clientId, clientSecret, sessionSecret, allowedLogin, allowedId, siteOrigin, commitToken, repo, branch }
}
