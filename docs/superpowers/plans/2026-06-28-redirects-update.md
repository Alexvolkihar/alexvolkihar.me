# Redirects Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `/rss` and `/blog` manual redirects to point to `alexvolkihar.ovh` instead of `antfu.me`.

**Architecture:** Edit `_redirects` file directly and run the redirects script to update generated `_dist_redirects`.

**Tech Stack:** Netlify redirects

---

### Task 1: Update manual redirects file

**Files:**
- Modify: `_redirects:1-2`

- [ ] **Step 1: Edit the manual redirects**

Update the first two lines of `_redirects` to point to `alexvolkihar.ovh`.

Target Content in `_redirects`:
```
/rss https://antfu.me/feed.xml 301
/blog https://antfu.me/posts 301
```

Replacement Content:
```
/rss https://alexvolkihar.ovh/feed.xml 301
/blog https://alexvolkihar.ovh/posts 301
```

- [ ] **Step 2: Commit the change**

Run:
```bash
git add _redirects
git commit -m "chore: update rss and blog redirects to alexvolkihar.ovh"
```

### Task 2: Regenerate dist redirects and verify

**Files:**
- Modify: `_dist_redirects`

- [ ] **Step 1: Run redirects regeneration script**

Run:
```bash
pnpm run redirects
```
Expected: The command runs successfully and updates `_dist_redirects`.

- [ ] **Step 2: Verify `_dist_redirects` contents**

Check that `/rss` and `/blog` in `_dist_redirects` now point to `alexvolkihar.ovh`.

- [ ] **Step 3: Commit updated `_dist_redirects`**

Run:
```bash
git add _dist_redirects
git commit -m "chore: regenerate dist redirects with alexvolkihar.ovh"
```
