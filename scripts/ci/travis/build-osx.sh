#!/bin/bash

set -ev

npm exec --package=npm-run-all -- npm-run-all lint test:electron-main build assets

npm run clean:prebuilds
npm exec --package=electron-builder -- electron-builder install-app-deps --arch=x64

yarn test:e2e

# preventing "No output has been received in the last 10m0s" error occurring on travis-ci
# see https://github.com/travis-ci/travis-ci/issues/4190#issuecomment-353342526
# output something every 9 minutes (540 seconds) to prevent Travis killing the job
while sleep 540; do echo "=====[ $SECONDS seconds still running ]====="; done &
yarn build:electron-builder-hooks
npm run electron-builder:dist
# killing background sleep loop
kill %1

yarn scripts/dist-packages/print-hashes

# preventing "No output has been received in the last 10m0s" error occurring on travis-ci
# see https://github.com/travis-ci/travis-ci/issues/4190#issuecomment-353342526
# output something every 9 minutes (540 seconds) to prevent Travis killing the job
while sleep 540; do echo "=====[ $SECONDS seconds still running ]====="; done &
yarn scripts/dist-packages/upload
# killing background sleep loop
kill %1
