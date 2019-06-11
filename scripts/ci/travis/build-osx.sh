#!/bin/bash

set -ev

./scripts/ci/prepare-webclients.sh

yarn app:dist

yarn test:e2e

# see https://github.com/travis-ci/travis-ci/issues/4190#issuecomment-353342526
# output something every 9 minutes (540 seconds) to prevent Travis killing the job
while sleep 540; do echo "=====[ $SECONDS seconds still running ]====="; done &
npx electron-builder --publish onTagOrDraft --x64
# killing background sleep loop
kill %1

yarn scripts/dist-packages/print-hashes
yarn scripts/dist-packages/upload
