#!/bin/bash

set -ev

# the script builds the web clients and then removes all the generated files except the actual dists
# so then only the actual dists without extra stuff could be cached by CI system

ARCHIVE_FILE=webclients.tar

# build
yarn assets:webclient:protonmail

# create archive
./scripts/ci/archive-webclients-dist-only.sh $ARCHIVE_FILE

# keep only prepared web clients in the cache (we cache only "./output" folder)
rm -rf ./output
tar -xf $ARCHIVE_FILE
