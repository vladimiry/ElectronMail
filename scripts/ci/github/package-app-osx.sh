#!/bin/bash

set -ev

ARCH="${ELECTRON_MAIL_ARCH:-x64}" # defaults to "x64"

echo "::group::tweak the system"
brew install automake libtool
echo "::endgroup::"

echo "::group::build native modules"
npm_config_arch=${ARCH} pnpm run ts-node:shortcut ./scripts/ci/prepare-native-deps.ts
echo "::endgroup::"

echo "::group::test e2e"
# TODO arm64: enable e2e tests running for darwin-arm64 build, see the blocker https://github.com/actions/virtual-environments/issues/2187
if [[ ${ARCH} == "x64" ]]; then
  pnpm run test:e2e
fi
echo "::endgroup::"

echo "::group::package"
pnpm run build:electron-builder-hooks
npm run electron-builder:shortcut -- --${ARCH} --publish never
echo "::endgroup::"

echo "::group::hash & upload"
pnpm run scripts/dist-packages/print-hashes
pnpm run scripts/dist-packages/upload
echo "::endgroup::"
