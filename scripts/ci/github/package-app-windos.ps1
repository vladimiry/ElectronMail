$ErrorActionPreference = "Stop"

echo "::group::tweak the system"
# TODO figure hot to make native modules compilable without installing "windows-build-tools" npm package
choco install --force --yes visualstudio2017buildtools --package-parameters "--passive --norestart --includeRecommended --add Microsoft.VisualStudio.Workload.VCTools"
# TODO figure hot to make native modules compilable without installing "windows-sdk-8.1" choco package
choco install --force --yes windows-sdk-8.1
# rely on "node-gyp" autodetection
npm config delete msvs_version
npm config delete msvs_version --global
$env:GYP_MSVS_VERSION = $null
[Environment]::SetEnvironmentVariable("GYP_MSVS_VERSION", $null, "User")
[Environment]::SetEnvironmentVariable("GYP_MSVS_VERSION", $null, "Machine")
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
