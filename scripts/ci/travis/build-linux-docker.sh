#!/bin/bash

set -ev

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash

export NVM_DIR=~/.nvm
source ~/.nvm/nvm.sh
nvm install $TRAVIS_NODE_VERSION
nvm use $TRAVIS_NODE_VERSION

apt-get update
apt-get install --yes --no-install-recommends libtool automake squashfs-tools libxss-dev snapcraft

yarn --pure-lockfile

npm run clean:prebuilds
npx --no-install electron-builder install-app-deps --arch=x64

yarn scripts/electron-builder/sequential-dist-linux

yarn scripts/dist-packages/print-hashes

# preventing "No output has been received in the last 10m0s" error occurring on travis-ci
# see https://github.com/travis-ci/travis-ci/issues/4190#issuecomment-353342526
# output something every 9 minutes (540 seconds) to prevent Travis killing the job
while sleep 540; do echo "=====[ $SECONDS seconds still running ]====="; done &
    yarn scripts/dist-packages/upload
# killing background sleep loop
kill %1
