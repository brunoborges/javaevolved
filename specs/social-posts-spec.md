# Automated Twice-Weekly Social Posts — Specification

## Problem
Post one pattern twice a week to X/Twitter, covering all 113+ patterns. Fully automated via GitHub Actions with no manual steps.

## Approach
Use a **GitHub Actions scheduled workflow** that:
1. Reconciles a pre-shuffled pending queue (`social/queue.txt`)
2. Each Monday and Thursday, picks the next unposted pattern, posts to X/Twitter
3. Removes the posted entry and records it in `social/state.yaml`
4. When all patterns are exhausted, reshuffles and starts over

### Why a queue file?
- Deterministic: you can review/reorder upcoming posts
- Resumable: survives workflow failures, repo changes
- Auditable: git history shows what was posted when

### Pre-drafted tweets
Each tweet is stored in `social/tweets/{category}/{slug}.yaml` so pattern pull requests edit only their own draft. The queue generator builds a draft from content fields and validates it fits within 280 characters.

## Post Format
```
☕ {title}

{summary}

{oldLabel} → {modernLabel} (JDK {jdkVersion}+)

🔗 https://javaevolved.dev/{category}/{slug}.html

#Java #JavaEvolved
```

## Implementation

### 1. Queue & Tweet Generator
**File:** `html-generators/generatesocialqueue.java`

JBang script with three modes:
- Default — reconcile `social/queue.txt`, preserving pending order, pruning deleted patterns, and appending new patterns.
- `--file content/{category}/{slug}.yaml` — generate that pattern's `social/tweets/{category}/{slug}.yaml` draft.
- `--reshuffle` — start a fresh cycle containing every pattern.

`social/state.yaml` tracks `postedKeys` for the current cycle plus the last successful post metadata. A new cycle starts automatically after the pending queue is exhausted.

### 2. Post Script
**File:** `html-generators/socialpost.java`

JBang script that:
- Reads the first entry from the pending queue
- Looks up its pre-drafted text under `social/tweets/{category}/`
- Posts to X/Twitter via API v2 (OAuth 1.0a with HMAC-SHA1 signing)
- Adds the key to `postedKeys` and removes it from the pending queue only after confirmed API success
- Supports `--dry-run` to preview without posting

### 3. GitHub Actions Workflow
**File:** `.github/workflows/social-post.yml`

- Schedule: every Monday and Thursday at 14:00 UTC (10 AM ET)
- Manual dispatch support (`workflow_dispatch`)
- Concurrency group prevents double-posts
- Reconciles the queue before posting and commits updated queue/state back to the repo

## Required GitHub Secrets
| Secret | Purpose |
|--------|---------|
| `TWITTER_CONSUMER_KEY` | X API v2 OAuth 1.0a consumer key |
| `TWITTER_CONSUMER_KEY_SECRET` | X API v2 OAuth 1.0a consumer secret |
| `TWITTER_ACCESS_TOKEN` | X API v2 user access token |
| `TWITTER_ACCESS_TOKEN_SECRET` | X API v2 user access token secret |

## Design Decisions
- **Twitter/X only** — Bluesky support can be added later
- **Text-only posts** with URL — platform unfurls the OG card automatically from `og:image` meta tags
- **Pre-drafted tweets** — one reviewable file per pattern, preventing aggregate-file merge conflicts
- **Random order** via pre-shuffled queue for variety across categories
- **Reshuffles** when all patterns are exhausted
- **JBang/Java for posting** — consistent with the rest of the project; safer for OAuth 1.0a signing than shell
- **State tracked** via `social/state.yaml` with `postedKeys`, `lastPostedKey`, `lastTweetId`, `lastPostedAt`
- **Social files in `social/`** (not `content/`) to avoid triggering site deploys
- **New patterns** appended to the pending queue by serialized automation; deleted pending patterns pruned
- **Tweet length validation** — generator truncates summaries to fit 280 chars
