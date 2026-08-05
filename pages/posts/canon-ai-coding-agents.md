---
title: "The Canon Is Right: A Year of Agentic Coding Under Real Constraints"
date: 2026-08-05T00:00:00Z
lang: en
art: random
duration: 7min
description: Federico Bartoli's "The Canon" lays out twelve rules for working with AI coding agents. Writing Symfony for medical software made me agree with every one of them.
---

> [Version Française](/posts/canon-ai-coding-agents-fr) | [日本語版](/posts/canon-ai-coding-agents-ja)

A few days ago I read [*The Canon*](https://federicobartoli.it/canon/) by Federico Bartoli, a short manifesto laying out twelve rules for working with AI coding agents. It's tight, opinionated, and closes on the same line it opens with: "None of these are new. All of them are now mandatory." I read it twice in a row, which for me is the real test of whether a piece of writing about engineering discipline is worth anything.

Bartoli's twelve patterns fall into roughly four moves: decide the shape of the solution before you open the prompt box, work in small reviewable slices instead of one giant generation, verify everything the agent claims instead of trusting the summary, and write your standards down somewhere the agent will actually read them instead of retyping them every session. I spend my days writing Symfony for medical software, and reading the list felt less like discovering new advice and more like watching someone describe habits I already can't skip. IEC 62304 and a static analyzer that fails the build don't leave much room for shortcuts, so every one of Bartoli's twelve rules had already been forced on me by something other than good intentions.

## Deciding before you prompt

Bartoli's second pattern is "decide before you ask," and it maps directly onto something medical-device engineering has required for decades: you don't touch code until you know the pre-conditions, the failure modes, and the acceptance criteria. An AI agent will happily generate a plausible-looking implementation for a half-formed idea, and that's exactly why the rule holds. If I can't state, in one sentence, what a function must reject before it's allowed to succeed, I'm not ready to prompt anything. I need to go find the actual requirement first.

The agent doesn't know this discipline exists for safety reasons. It just pattern-matches to the prompt. A vague prompt gets you a vague implementation dressed up in confident syntax, and you won't notice the vagueness until it's someone else's incident.

## Small batches, and the diff as the only witness

"Small batches" and "read the diff" are, if anything, understated. On a project where every write path runs through a transaction manager and every object can only be built through its factory, a change that touches twelve files in one shot simply isn't reviewable. I've started asking agents for one layer at a time (domain object, then loader, then writer, then handler) so the diff at each step stays small enough to hold in my head and check against the actual rule, not against my memory of the rule.

The line from Bartoli I keep coming back to is "comprehension debt": every line you accept without reading is a small loan against a future incident, and unlike financial debt, you don't get to see the interest rate up front. It's the best explanation I've read for why "it compiles" was never a good enough bar.

## Verification is the part that doesn't compress

"Run it before you believe it" sounds obvious until you notice how often it gets skipped under deadline pressure, agent-assisted or not. What's changed with agents isn't the principle, it's the volume: you're reviewing more claims of "done" per hour than you used to, so the temptation to spot-check instead of verify grows right along with it. I've settled on a rule that's blunt but effective: if there's no test, no log, and no trace I can point to, "it works" is a hypothesis, not a fact, no matter how fluently the agent phrases it.

## Encoding the rules

Bartoli's eleventh pattern is "encode the rules": put your conventions in a file the agent will load, not in prompt text you retype every session. My day job is the extreme case of why this works. The rulebook isn't advisory there, it's enforced. Architecture constraints, which layer can depend on which, which classes may only be instantiated through their factory, which fields must never reach a log line, are backed by custom static-analysis rules with their own numbered IDs, checked on every commit. The written convention and the automated check are two halves of the same idea: a style guide an agent can ignore is a suggestion, and a style guide a linter enforces is a contract. Bartoli's version of this rule is the general case; mine is what it looks like once the stakes make it non-optional.

## Where I land

The twelve patterns hold up. In regulated, safety-relevant software, they stop being a choice and become the reason the software is allowed to exist at all, which is a strange thing to notice in a manifesto meant for a much broader audience than mine. If you write code with an agent at all, read the original: it's short, and it's the kind of short that's actually earned.
