#!/bin/bash

set -e  # exit on error
set -v  # verbose output

if [ -z "${ELECTRON_MAIL_NODE_DEST_ARCH}" ]; then
  echo "❌ Error: Environment variable ELECTRON_MAIL_NODE_DEST_ARCH is not set." >&2
  exit 1
fi

echo "::group::tweak the system"
if [[ "$ELECTRON_MAIL_NODE_DEST_ARCH" == "arm64" ]]; then
  brew install automake libtool
fi
echo "::endgroup::"

echo "::group::compile native modules"
pnpm run prepare-native-deps
echo "::endgroup::"

echo "::group::test e2e"
pnpm run test:e2e
echo "::endgroup::"

echo "::group::package"
pnpm run build:electron-builder-hooks
pnpm run electron-builder:dist --${ELECTRON_MAIL_NODE_DEST_ARCH}
echo "::endgroup::"

echo "::group::hash & upload"
pnpm run scripts/dist-packages/print-hashes
pnpm run scripts/dist-packages/upload
echo "::endgroup::"
