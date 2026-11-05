// POST /api/collection -> commits a new entry to data/genart-collection.ts.
//
// Gate, in order: configuration, same-origin + custom header (CSRF), JSON
// content type, valid session of the allowed account, rate limit, strict body
// validation, series file exists in the repo, no duplicate. The commit is made
// with a server-side fine-grained token limited to this repository.

import { appendEntry, FileShapeError, hasEntry, parseCollectionFile } from '../server/genart-admin/collection-file.js'
import { getConfig } from '../server/genart-admin/config.js'
import { fileExists, getFile, GitHubError, putFile } from '../server/genart-admin/github.js'
import { checkSameOrigin, error, json } from '../server/genart-admin/http.js'
import { allowWrite } from '../server/genart-admin/rate-limit.js'
import { readSession } from '../server/genart-admin/session.js'
import { validateEntry } from '../server/genart-admin/validate.js'

const DATA_PATH = 'data/genart-collection.ts'
const MAX_BODY = 2048

export async function POST(request: Request): Promise<Response> {
  const config = getConfig()
  if (!config)
    return error(503, 'Not configured')

  const denied = checkSameOrigin(request, config)
  if (denied)
    return denied
  const type = request.headers.get('content-type') ?? ''
  if (!/^application\/json\s*(?:;|$)/i.test(type))
    return error(415, 'Content-Type must be application/json')

  const session = readSession(request, config)
  if (!session)
    return error(401, 'Not signed in')

  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BODY)
    return error(413, 'Body too large')
  const raw = await request.text()
  if (raw.length > MAX_BODY)
    return error(413, 'Body too large')
  let body: unknown
  try {
    body = JSON.parse(raw)
  }
  catch {
    return error(400, 'Invalid JSON')
  }
  const result = validateEntry(body)
  if (!result.ok)
    return error(400, result.error)
  const entry = result.entry

  if (!allowWrite(`login:${session.login.toLowerCase()}`))
    return error(429, 'Too many additions, wait a minute', { 'Retry-After': '60' })

  try {
    if (!await fileExists(config, `src/logics/genart/series/${entry.series}.ts`))
      return error(400, 'Unknown series')

    const date = new Date().toISOString().slice(0, 7)
    const message = `Add "${entry.name}" to the genart collection`
    for (let attempt = 0; ; attempt++) {
      const { text, sha } = await getFile(config, DATA_PATH)
      if (hasEntry(parseCollectionFile(text), entry.series, entry.hash))
        return error(409, 'This piece is already in the collection')
      const next = appendEntry(text, entry, date)
      try {
        const commitUrl = await putFile(config, DATA_PATH, next.text, sha, message)
        return json({ ok: true, number: next.number, commitUrl }, 201)
      }
      catch (e) {
        // Someone committed in between: re-read and try once more.
        if (e instanceof GitHubError && e.status === 409 && attempt === 0)
          continue
        throw e
      }
    }
  }
  catch (e) {
    if (e instanceof FileShapeError) {
      console.error('[genart-admin] collection file has an unexpected shape:', e.message)
      return error(500, 'The collection file has an unexpected shape, nothing was committed')
    }
    if (e instanceof GitHubError) {
      console.error('[genart-admin] GitHub error', e.status, e.message)
      return error(502, 'GitHub refused the request')
    }
    console.error('[genart-admin] unexpected error', e instanceof Error ? e.name : typeof e)
    return error(500, 'Unexpected error')
  }
}
