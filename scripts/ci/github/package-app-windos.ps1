$ErrorActionPreference = "Stop"

echo "::group::tweak the system"
# TODO figure hot to make native modules compilable without installing "windows-sdk-8.1" choco package
choco install windows-sdk-8.1
# TODO figure hot to make native modules compilable without installing "windows-build-tools" npm package
npm install --global --production windows-build-tools
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
