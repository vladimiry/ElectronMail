#!/bin/bash

set -ev

yarn scripts/transfer travis-download

yarn app:dist

# TODO make below lines work with electron@v5 / travis@windows
# yarn test:e2e

yarn electron-builder:dist

yarn scripts/dist-packages/print-hashes
yarn scripts/dist-packages/upload
