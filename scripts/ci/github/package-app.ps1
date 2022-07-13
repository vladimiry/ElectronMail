# $env:DEBUG = "*"
# $env:DEBUG = $null

echo "::group::vs build tools setup"
./scripts/ci/github/install-vs-build-tools.ps1 -IncludeWin81Sdk $true
npm config set msvs_version 2017
echo "::endgroup::"

echo "::group::build native modules"
pnpm run ts-node:shortcut ./scripts/ci/prepare-native-deps.ts
echo "::endgroup::"

echo "::group::test e2e"
pnpm run test:e2e
echo "::endgroup::"

echo "::group::package"
pnpm run build:electron-builder-hooks
npm run electron-builder:shortcut -- --publish never
echo "::endgroup::"

echo "::group::hash & upload"
pnpm run scripts/dist-packages/print-hashes
pnpm run scripts/dist-packages/upload
echo "::endgroup::"
