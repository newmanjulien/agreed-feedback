# Agent Instructions

## Tests

- Do not create new tests or expand the test suite unless the user explicitly asks for new tests.
- Only use the existing tests if it's absolutely necessary.
- Do not use Playwright or another similar framework unless it's absolutely necessary.

## Planning changes

when evaluating a change. focus on the target outcome, not the migration cost. lots of churn is fine. lots of work is fine. but we need clean/simple outcomes. less code is good

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`src/convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
