#!/bin/bash
# Populate sherlo-lib/extracted/@sherlo/<name> - the portal: targets packages/cli's
# package.json resolves @sherlo/{sdk-client,api-types,common-client,shared} through -
# then install + build. Used by CI and local development. Self-contained (no
# switch-env.sh dependency).
#
# Two ways to populate sherlo-lib/extracted:
#   - default: download the four packages from the S3 dev/test/prod canon (PACKAGE_TOKEN).
#   - LIBS_REF set: build them from sherlo-io/sherlo-api@LIBS_REF's own workspace instead
#     (SHERLO_API_CLONE_TOKEN - a token with clone access to that private repo). For a PR
#     whose S3 canon predates the lib/SDK changes it depends on (the "epic's CLI still
#     links against pre-epic canon libs" composition gap) - see pr_checks.yml for when
#     this is set. Same law as everywhere else this pattern is used: a missing/inaccessible
#     ref or a broken build FAILS the script - it never falls back to the S3 canon, which
#     would silently re-create the exact gap this branch exists to close.
set -euo pipefail
STAGE="${CLIENT_STAGE:-dev}"
PKGS=("sherlo-sdk-client" "sherlo-api-types" "sherlo-common-client" "sherlo-shared")
NAMES=("@sherlo/sdk-client" "@sherlo/api-types" "@sherlo/common-client" "@sherlo/shared")
SHERLO_API_REPO="sherlo-io/sherlo-api"

mkdir -p sherlo-lib
rm -rf sherlo-lib/extracted

if [ -n "${LIBS_REF:-}" ]; then
  if [ -z "${SHERLO_API_CLONE_TOKEN:-}" ]; then
    echo "Error: LIBS_REF is set but SHERLO_API_CLONE_TOKEN is not - it authenticates the git fetch of $SHERLO_API_REPO (a private repo)" >&2
    exit 1
  fi

  echo "Building sherlo-lib/extracted/@sherlo/* from $SHERLO_API_REPO@$LIBS_REF (source build, not S3 canon)"
  API_BUILD_DIR=$(mktemp -d)
  trap 'rm -rf "$API_BUILD_DIR"' EXIT

  git -C "$API_BUILD_DIR" init -q
  git -C "$API_BUILD_DIR" remote add origin "https://x-access-token:${SHERLO_API_CLONE_TOKEN}@github.com/${SHERLO_API_REPO}.git"
  git -C "$API_BUILD_DIR" fetch --depth 1 origin "$LIBS_REF"
  git -C "$API_BUILD_DIR" checkout -q FETCH_HEAD

  # Repoint the client packages' env.json at $STAGE before building - the same repoint
  # sherlo-api's own release workflows do before publishing to S3 canon.
  # --caller-restores is irrelevant here (this checkout is deleted regardless via the
  # trap above), but is the mode meant for an ephemeral caller, matching upstream usage.
  (cd "$API_BUILD_DIR" && bash scripts/set-package-env.sh "$STAGE" --caller-restores)

  # sherlo-api pins yarn@1.22.22 (Classic) via its own package.json `packageManager` -
  # unrelated to this repo's yarn@4 (Berry). Bare `yarn` here resolves whatever this
  # runner has on PATH for a repo with no `.yarnrc.yml`/`yarnPath` override, which is
  # sherlo-api's own pin.
  #
  # `yarn install`'s postinstall (scripts/build-unless-ci.sh) skips the build whenever
  # CI=true (GitHub Actions sets this) - it exists purely for a local bare `yarn` to
  # produce working dist/ output, and defers to CI's own explicit build step otherwise
  # (see that script's own comment). sherlo-api's own workflows always follow `yarn`
  # with an explicit `yarn build` for exactly this reason; skipping it here left
  # `dist/` empty on every real (CI=true) runner, unnoticed locally only because a
  # bare `yarn` outside CI builds anyway. `yarn build` (scripts/build.sh) builds every
  # client package in DEPENDENCY order (api-types, shared, then the *-client packages
  # that import shared) - required before scripts/prepare-packages.sh below, whose own
  # per-package rebuild loop is ordered admin/app/sdk/runner-client THEN shared last,
  # so admin-client/app-client's rebuild fails resolving `@sherlo/shared` types unless
  # shared's dist already exists on disk from this step.
  (cd "$API_BUILD_DIR" && yarn install)
  (cd "$API_BUILD_DIR" && yarn build)
  (cd "$API_BUILD_DIR" && bash scripts/prepare-packages.sh)

  for i in "${!PKGS[@]}"; do
    dir="sherlo-lib/extracted/${NAMES[$i]}"; mkdir -p "$dir"
    tar -xzf "$API_BUILD_DIR/sherlo-lib/${PKGS[$i]}.tgz" -C "$dir" --strip-components=1
    touch "$dir/yarn.lock"
  done
else
  API="https://8gbu9wv7jd.execute-api.eu-central-1.amazonaws.com/dev/get-package-endpoint"
  if [ -z "${PACKAGE_TOKEN:-}" ] && [ -f .env ]; then source .env; fi
  if [ -z "${PACKAGE_TOKEN:-}" ]; then echo "Error: PACKAGE_TOKEN not set" >&2; exit 1; fi

  for i in "${!PKGS[@]}"; do
    url=$(curl -sf "$API?token=$PACKAGE_TOKEN&objectKey=$STAGE/${PKGS[$i]}.tgz")
    curl -sfL -o "sherlo-lib/${PKGS[$i]}.tgz" "$url"
    dir="sherlo-lib/extracted/${NAMES[$i]}"; mkdir -p "$dir"
    tar -xzf "sherlo-lib/${PKGS[$i]}.tgz" -C "$dir" --strip-components=1
    touch "$dir/yarn.lock"
  done
fi

yarn install
