#!/bin/bash

set -ev

yarn app:dist:base
npm run clean:prebuilds
npx --no-install electron-builder install-app-deps --arch=x64

# needed for e2e starts with SUID sandbox if user namespacing disabled
# https://github.com/electron/electron/issues/16631#issuecomment-476082063
# https://github.com/electron/electron/issues/17972
sudo ./scripts/prepare-chrome-sandbox.sh ./node_modules/electron/dist/chrome-sandbox

yarn test:e2e

# --env-file: https://github.com/electron-userland/electron-builder/issues/2450

# TODO use own docker image
docker run --rm -ti \
    --env-file <(env | grep -vE '\r|\n' | grep -iE '^(DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS|APPVEYOR|BUILD_)[A-Z_]*=') \
    -v ${PWD}:/project \
    -v ${PWD##*/}-node-modules:/project/node_modules \
    -v ~/.cache/electron:/root/.cache/electron \
    -v ~/.cache/electron-builder:/root/.cache/electron-builder \
    electronuserland/builder \
    /bin/bash ./scripts/ci/travis/build-linux-docker.sh
