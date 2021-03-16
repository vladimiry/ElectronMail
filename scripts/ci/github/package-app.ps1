# enable debug output printing for "electron-builder" / "node-gyp" like modules
$env:DEBUG = "true"

echo "::group::system setup"
./scripts/ci/github/system-setup.ps1 -IncludeWin81Sdk $true
npm config set msvs_version 2017
echo "::endgroup::"

echo "::group::build native modules (electron-rebuild)"
npm run postinstall:remove:prebuild-install
npm run clean:prebuilds
npm exec --package=electron-rebuild -- electron-rebuild --version $((Get-Content ./package.json | ConvertFrom-Json).devDependencies.electron)
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
