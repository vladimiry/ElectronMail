#!/bin/bash

set -ev

rm -rf ./output
yarn github-artifact:download $APP_GITHUB_ARTIFACT_WEBCLIENTS
unzip $APP_GITHUB_ARTIFACT_WEBCLIENTS

yarn app:dist

if [ "$TRAVIS_OS_NAME" == "linux" ]; then
    sudo yarn prepare-chrome-sandbox:node_modules
fi

yarn test:e2e

if [[ "$TRAVIS_OS_NAME" == "osx" ]]; then
    # see https://github.com/travis-ci/travis-ci/issues/4190#issuecomment-353342526
    # output something every 9 minutes (540 seconds) to prevent Travis killing the job
    while sleep 540; do echo "=====[ $SECONDS seconds still running ]====="; done &
    yarn electron-builder:publish:x64
    # killing background sleep loop
    kill %1
fi

if [ "$TRAVIS_OS_NAME" == "linux" ]; then
    docker run --rm -ti \
        --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS_TAG|TRAVIS|TRAVIS_REPO_|TRAVIS_BUILD_|TRAVIS_BRANCH|TRAVIS_PULL_REQUEST_|APPVEYOR_|CSC_|GH_|GITHUB_|BT_|AWS_|STRIP|BUILD_') \
        --env ELECTRON_CACHE="/root/.cache/electron" \
        --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
        -v ${PWD}:/project \
        -v ${PWD##*/}-node-modules:/project/node_modules \
        -v ~/.cache/electron:/root/.cache/electron \
        -v ~/.cache/electron-builder:/root/.cache/electron-builder \
        electronuserland/builder \
        /bin/bash -c "yarn --pure-lockfile install && yarn electron-builder:publish:x64:linux"
fi

yarn print-dist-packages-hashes
