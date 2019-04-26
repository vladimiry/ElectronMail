#!/bin/bash

set -ev

yarn scripts/transfer travis-download

yarn app:dist

# https://github.com/electron/electron/issues/16631#issuecomment-476082063
sudo ./scripts/prepare-chrome-sandbox.sh ./node_modules/electron/dist/chrome-sandbox

yarn test:e2e

# --env-file: https://github.com/electron-userland/electron-builder/issues/2450

docker run --rm -ti \
    --env-file <(env | grep -vE '\r|\n' | grep -iE '^(DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS|APPVEYOR|BUILD_)[A-Z_]*=') \
    -v ${PWD}:/project \
    -v ${PWD##*/}-node-modules:/project/node_modules \
    electronuserland/builder \
    /bin/bash -c "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash && export NVM_DIR=~/.nvm && source ~/.nvm/nvm.sh && nvm install $TRAVIS_NODE_VERSION && nvm use $TRAVIS_NODE_VERSION && yarn --pure-lockfile && yarn clean:sodium-native:prebuilds && apt-get install --yes libtool automake && yarn electron-builder:dist:linux:electron:5"

yarn scripts/dist-packages/print-hashes
yarn scripts/dist-packages/upload
