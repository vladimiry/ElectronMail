#!/bin/bash

set -ev

echo "::group::tweak the system"
brew install automake libtool
echo "::endgroup::"

echo "::group::build native modules"
pnpm run prepare:remove:prebuild-install
pnpm run clean:prebuilds
npm exec --package=electron-builder -- electron-builder install-app-deps --arch=x64
echo "::endgroup::"

echo "::group::test:e2e"
pnpm run test:e2e
echo "::endgroup::"

echo "::group::package"
pnpm run build:electron-builder-hooks
pnpm run electron-builder:dist
echo "::endgroup::"

echo "::group::hash & upload"
pnpm run scripts/dist-packages/print-hashes
pnpm run scripts/dist-packages/upload
echo "::endgroup::"
