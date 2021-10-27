# $env:DEBUG = "*"
# $env:DEBUG = $null

echo "::group::vs build tools setup"
./scripts/ci/github/install-vs-build-tools.ps1 -IncludeWin81Sdk $true
npm config set msvs_version 2017
echo "::endgroup::"

echo "::group::build native modules"
npm run prepare:remove:prebuild-install
npm run clean:prebuilds
npm exec --package=electron-builder -- electron-builder install-app-deps --arch=x64
echo "::endgroup::"

echo "::group::test:e2e"
yarn test:e2e
echo "::endgroup::"

echo "::group::package"
yarn build:electron-builder-hooks
npm exec --package=electron-builder -- electron-builder
echo "::endgroup::"

echo "::group::hash & upload"
yarn scripts/dist-packages/print-hashes
yarn scripts/dist-packages/upload
echo "::endgroup::"
