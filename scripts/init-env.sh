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
API="https://8gbu9wv7jd.execute-api.eu-central-1.amazonaws.com/dev/get-package-endpoint"
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

  # sherlo-api chooses its own Yarn - Classic (1.x) or Berry (4) - through its package.json
  # `packageManager` and its `yarnPath`, unrelated to this repo's yarn@4. Bare `yarn` run
  # inside it follows those. A Berry sherlo-api reads its @sherlo-io packages from GitHub's
  # package registry with GITHUB_PACKAGES_TOKEN, which this script's caller exports.
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

# The review page the CLI serves locally: a static build (no .map files) the frontend publishes
# as sherlo-local-page.tgz beside the libraries, files at the tarball root. Fetched from the S3
# canon in BOTH modes above (a source-built libs run has no other source for it) when
# PACKAGE_TOKEN is set. It is optional: a missing token or a tarball not published yet skips
# it with a note, so the install never breaks; packages/cli's build copies it in when present.
if [ -n "${PACKAGE_TOKEN:-}" ]; then
  if page_url=$(curl -sf "$API?token=$PACKAGE_TOKEN&objectKey=$STAGE/sherlo-local-page.tgz") \
    && curl -sfL -o sherlo-lib/sherlo-local-page.tgz "$page_url"; then
    mkdir -p sherlo-lib/extracted/local-page
    tar -xzf sherlo-lib/sherlo-local-page.tgz -C sherlo-lib/extracted/local-page
  else
    rm -f sherlo-lib/sherlo-local-page.tgz
    echo "Note: sherlo-local-page.tgz is not available for stage $STAGE - continuing without the local page" >&2
  fi
else
  echo "Note: PACKAGE_TOKEN is not set - continuing without the local page" >&2
fi

yarn install
