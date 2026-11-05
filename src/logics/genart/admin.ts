// Client side of the collection admin (the server is api/ + server/genart-admin/).
//
// Showing or hiding the admin controls is cosmetic only: every request is
// checked again on the server (session cookie, origin, account, input), so
// nothing here grants anything. No secret ever reaches the browser; the
// session lives in an HttpOnly cookie this code cannot read.

import { ref } from 'vue'

const LOGIN_RE = /^[a-z\d][a-z\d-]{0,38}$/i

const login = ref<string>()
let started = false

async function loadSession() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    // The Vite dev server has no /api: it answers 404 or the SPA's HTML.
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json'))
      return
    const data = await res.json() as { login?: unknown }
    if (typeof data.login === 'string' && LOGIN_RE.test(data.login))
      login.value = data.login
  }
  catch {}
}

export interface AddResult {
  number: number
  commitUrl?: string
}

async function request(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      // Custom header checked by the server (CSRF defence).
      'X-Requested-With': 'genart',
    },
    body: JSON.stringify(body ?? {}),
  })
}

export function useGenArtAuth() {
  // Client only, once per page load: never during SSR.
  if (typeof window !== 'undefined' && !started) {
    started = true
    loadSession()
  }

  function signInUrl(): string {
    const here = typeof location === 'undefined' ? '/genart/collection' : `${location.pathname}${location.search}`
    return `/api/auth/login?returnTo=${encodeURIComponent(here)}`
  }

  async function signOut() {
    try {
      await request('/api/auth/logout')
    }
    finally {
      login.value = undefined
    }
  }

  async function addToCollection(entry: { name: string, series: string, hash: string, ratio: string }): Promise<AddResult> {
    let res: Response
    try {
      res = await request('/api/collection', entry)
    }
    catch {
      throw new Error('Network error, nothing was added.')
    }
    const data = await res.json().catch(() => undefined) as { number?: unknown, commitUrl?: unknown, error?: unknown } | undefined
    if (!res.ok) {
      if (res.status === 401)
        login.value = undefined
      const message = typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`
      throw new Error(message)
    }
    const commitUrl = typeof data?.commitUrl === 'string' && data.commitUrl.startsWith('https://github.com/') ? data.commitUrl : undefined
    return { number: typeof data?.number === 'number' ? data.number : 0, commitUrl }
  }

  return { login, signInUrl, signOut, addToCollection }
}
