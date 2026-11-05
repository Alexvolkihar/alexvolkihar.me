// Best-effort, in-memory write limiter. Vercel may run several instances and
// recycles them, so this only slows down a runaway client or a stolen session;
// it is not a hard quota. The real limits are the single allowed account and
// the GitHub token's own rate limit.

const WINDOWS = [
  { ms: 60_000, max: 3 },
  { ms: 60 * 60_000, max: 20 },
]

const hits = new Map<string, number[]>()

export function allowWrite(key: string, now = Date.now()): boolean {
  const longest = WINDOWS[WINDOWS.length - 1].ms
  const recent = (hits.get(key) ?? []).filter(t => now - t < longest)
  for (const w of WINDOWS) {
    if (recent.filter(t => now - t < w.ms).length >= w.max) {
      hits.set(key, recent)
      return false
    }
  }
  recent.push(now)
  hits.set(key, recent)
  // Keep the map small on a long-lived instance.
  if (hits.size > 1000) {
    for (const [k, v] of hits) {
      if (v.every(t => now - t >= longest))
        hits.delete(k)
    }
  }
  return true
}

/** Test helper. */
export function resetRateLimit(): void {
  hits.clear()
}
