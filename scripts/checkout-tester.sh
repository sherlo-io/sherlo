#!/bin/bash
# Check sherlo-io/sherlo-tester out for THE BYTE RATCHET.
#
# ==========================================================================
# WHY A SECOND REPOSITORY IS CHECKED OUT TO RUN THIS REPOSITORY'S UNIT SUITE
# ==========================================================================
#
# packages/cli's render layer is proved by byte-identity against fixtures that
# were minted from real runs and reviewed into git - and those fixtures live in
# sherlo-tester, next to the masker the capture applies. The ratchets import both
# rather than copying them, because a copied fixture proves nothing (it moves
# with the change it is supposed to catch) and a copied masker is a second
# implementation free to drift from the one the capture actually runs.
#
# Without this checkout every byte case classified as SKIPPED on every runner,
# so the program's central guarantee - an extraction cannot change what a real
# user sees - was enforced on nobody. This script is what makes it enforced.
#
# The checkout is SOURCE ONLY: nothing here installs or builds sherlo-tester. The
# masker's transitive imports reach only `node:*` builtins plus TYPE-only imports
# (`@playwright/test`, `commander`), which the test transform erases - so vitest
# loads it straight from source with no node_modules on the other side.
#
# ==========================================================================
# WHICH REF, AND WHAT A MISMATCH MEANS
# ==========================================================================
#
# The ratchet is a CROSS-REPOSITORY comparison: this repo's renderer against that
# repo's fixtures. So the pair has to be on matching refs, and the resolution
# below is the same shape sherlo-tester's own e2e-pr.yml uses in the mirror
# direction: the candidate ref (the PR's base branch, or the dispatched branch)
# is used IF sherlo-tester has a branch by that name, and otherwise falls back to
# sherlo-tester's trunk, `dev`. Epic and release branches are mirrored across both
# repositories by name, which is exactly the case the first arm covers.
#
# A mismatch does not silently pass. It REDS, with the ratchet's own message
# saying the CLI no longer produces the committed bytes - and that is the correct
# outcome, not a false alarm: a change that alters a rendered literal and re-mints
# its fixture is ONE change spanning two repositories, and until both halves are
# on their matching branches the pair genuinely is inconsistent. The remedy is to
# land the sherlo-tester half on the same-named branch first; the SDK PR then goes
# green on its next run. The resolved ref is printed on every run so a red is
# never a mystery about WHICH fixtures were compared.
#
# A repository that cannot be seen at all is a different failure and is reported
# as one: a 404 on the repo itself means the token lacks access, not that a
# branch is missing, and the two must never be confused - the second silently
# resolves to a fallback, the first must stop the run.
set -euo pipefail

CANDIDATE_REF="${1:?usage: checkout-tester.sh <candidate-ref> <destination-dir>}"
DEST="${2:?usage: checkout-tester.sh <candidate-ref> <destination-dir>}"
TESTER_REPO="sherlo-io/sherlo-tester"
TESTER_TRUNK="dev"

if [ -z "${TESTER_CLONE_TOKEN:-}" ]; then
  echo "::error::checkout-tester: TESTER_CLONE_TOKEN is not set - it authenticates both the API probe and the fetch of $TESTER_REPO (a private repo). In a workflow this comes from the SHERLO_BOT GitHub App token, the same one pr_checks.yml mints to reach sherlo-io/sherlo-api." >&2
  exit 1
fi

api() {
  curl -sS -o /tmp/checkout-tester-body -w '%{http_code}' \
    -H "Authorization: Bearer $TESTER_CLONE_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "$1"
}

# Repo-level visibility FIRST. Without this, a token with no access to
# $TESTER_REPO returns 404 for every branch, which is indistinguishable from
# "that branch does not exist" - and we would quietly fall back to a trunk we
# equally cannot fetch, failing later with a git error that names neither cause.
REPO_STATUS=$(api "https://api.github.com/repos/$TESTER_REPO")
if [ "$REPO_STATUS" = "404" ]; then
  echo "::error::checkout-tester: the token cannot see $TESTER_REPO at all (HTTP 404 on the repo itself, not on a branch). This is a permissions fact, not a missing ref: grant the SHERLO_BOT GitHub App read access to $TESTER_REPO. Until then the byte ratchet cannot run in CI, and the checkout gate in packages/cli will red rather than skip - which is the intended behaviour." >&2
  exit 1
fi
if [ "$REPO_STATUS" != "200" ]; then
  echo "::error::checkout-tester: checking $TESTER_REPO visibility returned HTTP $REPO_STATUS (expected 200). Refusing to resolve a ref against a repo whose visibility is indeterminate. Response body:" >&2
  cat /tmp/checkout-tester-body >&2
  exit 1
fi

TESTER_REF="$TESTER_TRUNK"
if [ -n "$CANDIDATE_REF" ]; then
  BRANCH_STATUS=$(api "https://api.github.com/repos/$TESTER_REPO/git/ref/heads/$CANDIDATE_REF")
  case "$BRANCH_STATUS" in
    200)
      TESTER_REF="$CANDIDATE_REF"
      echo "checkout-tester: $TESTER_REPO has a branch named '$CANDIDATE_REF' - comparing against ITS fixtures (the mirrored-branch case)."
      ;;
    404)
      echo "checkout-tester: $TESTER_REPO has no branch named '$CANDIDATE_REF' - comparing against its trunk '$TESTER_TRUNK'. If this run reds on bytes, check whether the fixture half of your change is sitting on an unmirrored branch."
      ;;
    *)
      echo "::error::checkout-tester: checking $TESTER_REPO for branch '$CANDIDATE_REF' returned HTTP $BRANCH_STATUS (expected 200 or 404). Refusing to silently fall back to '$TESTER_TRUNK'. Response body:" >&2
      cat /tmp/checkout-tester-body >&2
      exit 1
      ;;
  esac
fi

echo "checkout-tester: fetching $TESTER_REPO@$TESTER_REF into $DEST (source only - no install, no build)"
rm -rf "$DEST"
mkdir -p "$DEST"
git -C "$DEST" init -q
git -C "$DEST" remote add origin "https://x-access-token:${TESTER_CLONE_TOKEN}@github.com/${TESTER_REPO}.git"
git -C "$DEST" fetch --depth 1 origin "$TESTER_REF"
git -C "$DEST" checkout -q FETCH_HEAD

echo "checkout-tester: $TESTER_REPO@$TESTER_REF is at $(git -C "$DEST" rev-parse HEAD)"
