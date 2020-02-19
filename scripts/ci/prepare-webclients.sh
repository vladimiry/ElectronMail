#!/bin/bash

set -ev

# the script builds the web clients and then removes all the generated files except the actual dists
# so then only the actual dists without extra stuff could be cached by CI system

ARCHIVE_FILE=webclients.tar

# build
# preventing "No output has been received in the last 10m0s" error occuring on travis-ci
# see https://github.com/travis-ci/travis-ci/issues/4190#issuecomment-353342526
# output something every 9 minutes (540 seconds) to prevent Travis killing the job
while sleep 540; do echo "=====[ $SECONDS seconds still running ]====="; done &
    yarn assets:webclient:protonmail
# killing background sleep loop
kill %1

# create archive
./scripts/ci/archive-webclients-dist-only.sh $ARCHIVE_FILE
ls -lh

# keep only prepared web clients in the cache (we cache only "./output" folder)
rm -rf ./output
tar -xf $ARCHIVE_FILE
find ./output/git \( -name "node_modules" -o -name ".git" \) -prune -o -print
