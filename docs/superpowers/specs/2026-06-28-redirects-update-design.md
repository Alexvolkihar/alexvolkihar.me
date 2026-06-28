# Design Spec: Redirects Update

Update the site's manual redirects pointing to `antfu.me` to use `alexvolkihar.ovh`, while preserving references and links related to the original repository creator.

## Context

The repository has been forked/cloned to build a custom portfolio/blog on `alexvolkihar.ovh`. However, the `/rss` and `/blog` path redirects are still pointing to the original owner's website (`https://antfu.me`).

## Proposed Changes

### `_redirects`

Modify the manual redirects at the root of the project to point to the new domain:

- `/rss` -> `https://alexvolkihar.ovh/feed.xml`
- `/blog` -> `https://alexvolkihar.ovh/posts`

Keep the `/talks/...` redirects pointing to `talks.antfu.me` since these are the original creator's presentations.

```diff
- /rss https://antfu.me/feed.xml 301
- /blog https://antfu.me/posts 301
+ /rss https://alexvolkihar.ovh/feed.xml 301
+ /blog https://alexvolkihar.ovh/posts 301
```

## Verification Plan

1. Run the build/redirect script to regenerate `_dist_redirects`.
2. Verify `_dist_redirects` has updated fields for `/rss` and `/blog`.
