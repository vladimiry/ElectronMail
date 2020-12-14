$ErrorActionPreference = 'Stop'

echo "::group::build assets"
yarn assets
echo "::endgroup::"

echo "::group::build native modules"
npm run clean:prebuilds
npx --no-install electron-builder install-app-deps --arch = x64
echo "::endgroup::"

echo "::group::test:e2e"
# errors without workflow.ts tweaks:
# ERROR webdriver: unknown error: unknown error: Chrome failed to start: exited abnormally.
# (unknown error: DevToolsActivePort file doesn't exist)

# errors with workflow.ts tweaks:
# ERROR webdriver: Request failed with status 500 due to chrome not reachable: chrome not reachable
# ERROR webdriver: chrome not reachable: chrome not reachable

# TODO enable/fix e2e/spectron tests execution on linux system
# yarn test:e2e
echo "::endgroup::"

echo "::group::package"
yarn build:electron-builder-hooks
yarn electron-builder:dist --publish onTagOrDraft
echo "::endgroup::"

echo "::group::hash & upload"
yarn scripts/dist-packages/print-hashes
yarn scripts/dist-packages/upload
echo "::endgroup::"
