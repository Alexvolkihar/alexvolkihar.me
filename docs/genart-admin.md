# Genart collection admin

On the deployed site, the owner can add the piece currently shown on a series
page (`/genart/<series>?hash=…`) to the numbered collection without touching
the code: sign in with GitHub, press **Add to collection**, give it a name. The
site commits the new entry to `data/genart-collection.ts` on `main`, and Vercel
redeploys about a minute later.

Everything else on the site stays static. The write path is five small Vercel
Functions:

| Route                            | Method | Does                                                                                    |
| -------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `/api/auth/login?returnTo=/path` | GET    | Redirects to GitHub (OAuth App, no scopes) with a random `state`                        |
| `/api/auth/callback`             | GET    | Checks `state`, reads the GitHub identity, opens a session for the allowed account only |
| `/api/auth/me`                   | GET    | `{ login }` with a valid session, 401 otherwise                                         |
| `/api/auth/logout`               | POST   | Clears the session cookie                                                               |
| `/api/collection`                | POST   | Validates the piece and commits it through the GitHub Contents API                      |

Code: `api/` (entry points), `server/genart-admin/` (shared, not routed),
`src/logics/genart/admin.ts` (client), `src/components/GenArtGallery.vue` and
`GenArtLicense.vue` (UI: the lock icon at the end of the licence line on every
`/genart` page).

## Setup

You need: owner access to the GitHub repository and to the Vercel project.
Production origin found on 2026-11-05: `https://www.alexvolkihar.ovh`
(`alexvolkihar.ovh` redirects there; `alexvolkihar.me` does not resolve).
Confirm it before using it below: it must be exactly the origin in the
browser's address bar, scheme included, no trailing slash.

### 1. GitHub OAuth App (sign-in, identity only)

GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**:

- Application name: `alexvolkihar.ovh admin` (anything)
- Homepage URL: `https://www.alexvolkihar.ovh`
- Authorization callback URL: `https://www.alexvolkihar.ovh/api/auth/callback`
- Enable Device Flow: off

Create it, then **Generate a new client secret**. Keep the Client ID and the
secret for step 3. The app requests no scope: the token it yields can only read
public profile data, and the callback revokes it immediately.

### 2. Fine-grained personal access token (commits)

GitHub → Settings → Developer settings → Personal access tokens →
**Fine-grained tokens** → Generate new token:

- Token name: `genart collection commits`
- Expiration: 90 days or one year (put a reminder to renew it)
- Resource owner: `Alexvolkihar`
- Repository access: **Only select repositories** → `Alexvolkihar/alexvolkihar.me`
- Repository permissions: **Contents: Read and write** (Metadata: read-only is
  added automatically). Nothing else.

Commits will be authored by your account with the message
`Add "<name>" to the genart collection`.

### 3. Vercel environment variables

Vercel → the project → Settings → Environment Variables. Add each one with
environment **Production only** (not Preview, not Development: preview builds
run branch code and must not see the commit token).

| Name                   | Value                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `GITHUB_CLIENT_ID`     | Client ID from step 1                                                                |
| `GITHUB_CLIENT_SECRET` | Client secret from step 1 (mark Sensitive)                                           |
| `SESSION_SECRET`       | output of `openssl rand -hex 32` (mark Sensitive)                                    |
| `ALLOWED_GITHUB_LOGIN` | `Alexvolkihar`                                                                       |
| `ALLOWED_GITHUB_ID`    | optional but recommended: your numeric id, from `gh api users/Alexvolkihar --jq .id` |
| `SITE_ORIGIN`          | `https://www.alexvolkihar.ovh`                                                       |
| `GITHUB_COMMIT_TOKEN`  | token from step 2 (mark Sensitive)                                                   |
| `GITHUB_REPO`          | `Alexvolkihar/alexvolkihar.me` (default)                                             |
| `GITHUB_BRANCH`        | `main` (default)                                                                     |

Then redeploy production (Deployments → … → Redeploy) so the functions see the
variables. If any required variable is missing or malformed, every endpoint
answers 503 and nothing can be written.

### 4. Check

1. Open `https://www.alexvolkihar.ovh/genart/collection`, click the small lock
   at the end of the licence line, authorise on GitHub.
2. You come back to the same page; the licence line reads
   "Signed in as Alexvolkihar · Sign out".
3. Open a series, press **New seed** until you like one, pick the ratio in the
   export control, press **Add to collection**, type a name, **Add**.
4. A link to the commit appears; the piece shows up after the next deploy.

## Security model

- **Who can write**: only a session for `ALLOWED_GITHUB_LOGIN` (and
  `ALLOWED_GITHUB_ID` when set). The session is an HMAC-SHA256-signed cookie
  (`ga_session`, HttpOnly, Secure, SameSite=Strict, 12 h); the login is
  re-checked against the environment on every request. Rotate `SESSION_SECRET`
  to sign every session out at once.
- **OAuth**: `state` is 32 random bytes, kept signed in a 10-minute HttpOnly
  cookie scoped to `/api/auth`, compared in constant time, single use. The
  GitHub token is used once to read `/user`, then revoked; it is never stored.
  `returnTo` must be a path on the site (no open redirect).
- **CSRF**: SameSite=Strict cookie, plus `Origin` must equal `SITE_ORIGIN`, plus
  the custom header `X-Requested-With: genart` (forces a CORS preflight that
  is never granted), plus `Content-Type: application/json`, plus
  `Sec-Fetch-Site` must be `same-origin` when the browser sends it.
- **Input**: only `name`, `series`, `hash`, `ratio`, `note` are accepted. Series
  slug `^[a-z0-9-]{1,40}$` and `src/logics/genart/series/<slug>.ts` must exist
  in the repository; hash as `isValidHash`; ratio from the export list; name
  1–60 characters and note ≤ 200 with control, bidi and brace characters
  removed, then escaped as a TypeScript string. Duplicates (same series and
  hash) get 409. The file edit is re-parsed before committing; an unexpected
  file shape aborts with 500 instead of committing.
- **Blast radius**: the commit token can only touch the contents of this one
  repository, lives only in Vercel's Production environment, and is never sent
  to the browser. The worst a stolen session can do is append entries to the
  collection file, visible in the git history and revertible.
- **Rate limit**: 3 additions per minute and 20 per hour per account, in memory.
  Best effort only: Vercel can run several instances and recycles them.

Residual risks: a stolen, still-valid session cookie (12 h) can add entries;
anyone with access to the Vercel project or the GitHub account bypasses all of
this anyway; if `ALLOWED_GITHUB_ID` is not set and the GitHub login is ever
renamed, someone could register the old name.

## Local development

`pnpm dev` (Vite) has no `/api`: the lock link leads to the site's 404 page and
the admin controls stay hidden. The dev-only **Copy for collection** button is
still there for adding pieces by hand.

To run the functions locally, use the Vercel CLI: `vercel link`, then
`vercel dev` (serves the Vite app and `api/` on http://localhost:3000). It needs
its own OAuth App whose callback is `http://localhost:3000/api/auth/callback`,
and local variables in `.env.local` (never committed: `*.local` is ignored)
with `SITE_ORIGIN=http://localhost:3000`. Point `GITHUB_BRANCH` at a scratch
branch while testing, so test entries do not land on `main`.
