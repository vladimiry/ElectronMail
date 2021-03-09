#!/bin/bash

set -ev

echo "::group::tweak the system"
brew install automake libtool
echo "::endgroup::"

echo "::group::build native modules"
npm run postinstall:remove:prebuild-install
npm run clean:prebuilds
npm exec --package=electron-builder -- electron-builder install-app-deps --arch=x64
echo "::endgroup::"

echo "::group::test:e2e"
yarn test:e2e
echo "::endgroup::"

echo "::group::package"
yarn build:electron-builder-hooks
npm run electron-builder:dist
echo "::endgroup::"

echo "::group::hash & upload"
yarn scripts/dist-packages/print-hashes
yarn scripts/dist-packages/upload
echo "::endgroup::"
