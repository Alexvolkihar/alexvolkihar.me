---
title: "Tsuta: a Git client that stays native"
date: 2026-10-14T00:00:00Z
lang: en
art: random
image: /images/tsuta-history.png
duration: 7min
description: Tsuta is a native macOS Git client in Swift. It drives the system git, stages single lines, rebases without an editor and lists your Claude Code and Codex sessions. How the parts work, and where it stops.
---

> [Version Française](/posts/tsuta-fr) | [日本語版](/posts/tsuta-ja)

[Tsuta](https://github.com/Alexvolkihar/Tsuta) is a Git client for macOS written in Swift. It draws the history as a graph, stages hunks and single lines, resolves conflicts, rebases interactively, reviews GitHub and GitLab requests, and lists the Claude Code and Codex conversations that worked in a repository. The binary is 4 MB, the license is MIT, and there is no account.

The name is the Japanese word for ivy (蔦), a plant that climbs and branches as it grows.

![Tsuta's history view: the commit graph, the selected commit and its diff](/images/tsuta-history.png)

## Try it

- Source: [GitHub](https://github.com/Alexvolkihar/Tsuta)
- Build it:

```bash
git clone https://github.com/Alexvolkihar/Tsuta.git
cd Tsuta
./scripts/build-app.sh
open build/Tsuta.app
```

Swift 6 and macOS 14 are enough, and the Command Line Tools work without Xcode. The app is not notarized, so the first launch needs a right click and Open.

## It drives git, it does not replace it

Tsuta does not reimplement Git. Every operation is a call to `/usr/bin/git` as a child process, with `--no-optional-locks` and no prompt. Hooks, config, worktrees and submodules behave as they do in a terminal, because it is the same binary.

The real work is parsing. The output of `log`, `status --porcelain=v2 -z` and `diff` becomes immutable values, and the views only read those. Every command appears in a console (⌘J), so nothing the app does is hidden.

## Staging one line

To stage a single line, Tsuta builds a patch and gives it to `git apply --cached --recount`.

The patch keeps the file header and the hunk, and neutralizes what was not selected. When staging, an unselected added line is left out, and an unselected removed line becomes context, because it stays in the index. Unstaging is the mirror image and applies the patch with `-R`. The counts in the hunk header are recomputed, and `--recount` makes git trust the lines over the header.

A test does the round trip on a real repository: stage the first hunk, unstage one line of it, stage one line from the second hunk, commit, then check what the commit contains.

Partial staging needs the exact diff, so it is disabled while "hide whitespace changes" is on.

A new file is the one case git cannot diff yet. Tsuta records it as intent to add (`git add --intent-to-add`), which turns it into an ordinary diff of added lines, and the same patch builder does the rest. Nothing is staged until you apply a line. Discarding such a file forgets the entry first, because restoring it from the index would empty the file.

## Rebase without an editor

Git opens an editor for the todo list, and another for every reword. Tsuta replaces both. `GIT_SEQUENCE_EDITOR` points to a `cp` of a todo file the app wrote, and a `reword` becomes a `pick` followed by `exec git commit --amend -F <file>`.

The rebase window is a list you reorder by dragging, with pick, reword, squash, fixup and drop on each line. It refuses a plan that starts with a squash, since there is no commit to squash into.

## Blame, history and undo

Blame is `git blame --porcelain`, parsed into lines grouped by commit, with the uncommitted ones marked. The file history runs `git log --follow` twice: once for the commits, once with `--name-only` to learn which name the file had at each commit, so the diff of an old commit is read under the right path. A click on a blame line opens that commit in the history.

Undo starts from a snapshot taken before any operation that can move HEAD (rebase, merge, pull, reset, cherry-pick, revert, amend): the commit, the branch and the index tree (`git write-tree`). Undoing a rebase, a merge or a pull is `git reset --keep` to the old commit, which keeps uncommitted changes and stops if they conflict. Undoing a reset or an amend is `git reset --soft` followed by `git read-tree` of the saved index, so what you had staged is staged again. It refuses when HEAD is no longer where the action left it, or when you changed branch.

## The graph

Commits arrive child before parent. The layout keeps an array of lanes, each one holding the hash it is waiting for. A commit takes the first lane waiting for it, or the first free one. Its first parent keeps the lane and the other parents get free lanes. Each row records which lanes arrive at the node, which pass through and which leave, and a SwiftUI `Canvas` draws the curves between them.

My first merge test expected the second lane to close on the first. The algorithm was right and the test was wrong: the lane of the merged branch joins the parent's lane with a curve, and the parent stays where it was.

## Watching the folder

An FSEvents watcher refreshes the view when something changes in the working tree, from a terminal or from an editor. It ignores git's own bookkeeping (objects, logs, lock files), because reading a repository touches those and would start a refresh loop, and it merges bursts of events into one refresh.

The first version never fired. Without `kFSEventStreamCreateFlagUseCFTypes`, the callback receives a C array of strings, and I was reading it as an `NSArray`. It produced an empty list and failed without a sound.

I found it because the app can render its own window to a PNG: `Tsuta --open <repo> --snapshot out.png`. It needs no screen recording permission, since it only draws its own views. I created a file while it ran, and the file was missing from the list. The screenshots in this article come from that command.

![The changes view: staged and modified files, a checkbox on each changed line and a button to stage the whole hunk](/images/tsuta-changes.png)

## Claude Code and Codex

Tsuta uses them in two ways.

The first is generation: a commit message from the staged diff, an explanation of a commit, a summary of a review, a suggestion for a conflict block. Tsuta starts `claude` (or `codex`) as a child process and writes the prompt to stdin. It has no key and no server. Claude runs with `-p --tools ""` from a temporary directory, so an instruction hidden in a diff cannot read or change a file: the model can only return text. The diff goes between tags and is described to the model as data.

The second is the Agents tab, which lists the conversations that worked in the repository or in one of its worktrees. Claude Code keeps them as JSONL files in `~/.claude/projects/`, in a folder named after the path with `/` and `.` replaced by `-`. Tsuta reads the title, the branch and the last activity, and Resume opens Terminal in the right directory with `claude --resume <id>`. The id comes from a file name, so it is validated before it goes into a shell command.

## No Xcode

I built it with the Command Line Tools only, and that cost three things: no XCTest, no swift-testing macros, and no `@State` macro, whose plugin ships with Xcode. The tests became an executable, `tsuta-selftest`: 148 checks that create real repositories (a merge with a conflict, an interactive rebase, a stash, a worktree, partial staging, blame through a rename, undo of a rebase). Local view state uses `@StateObject`.

## Limits

- The app is not notarized.
- The GitLab (`glab`) and Codex paths are covered by parser tests on sample output. I have not run them against the real tools.
- Blame does not follow lines moved between files.
- Undo only works while the repository is where the action left it, on the same branch. Otherwise it refuses.
- It is about 5,800 lines of Swift, 1,600 of them in the core. Expect rough edges.

The code is on [GitHub](https://github.com/Alexvolkihar/Tsuta), MIT licensed.
