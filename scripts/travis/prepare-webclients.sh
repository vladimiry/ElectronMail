#!/bin/bash

set -ev

WEBCLIENTS_CACHE_TAR=webclients.tar
WEBCLIENTS_ARTIFACT_TAR=webclients-artifact.tar

yarn assets:webclient:tutanota
yarn assets:webclient:protonmail

# create cache tar
find output/git/protonmail/webclient/*/*/ -maxdepth 0 -type d \
    | awk '{print $1"dist/"}' \
    | tar -cvf $WEBCLIENTS_CACHE_TAR -T -
# append cache tar
find output/git/tutanota/webclient/*/*/ -maxdepth 0 -type d \
    | awk '{print $1"build/dist"}' \
    | tar -rvf $WEBCLIENTS_CACHE_TAR -T -

# keep only prepared web clients in the cache
rm -rf ./output
tar -xvf $WEBCLIENTS_CACHE_TAR

# create artifact tar
yarn --silent scripts/print-provider-repo-commit-hash protonmail \
    | { read commit; find output/git/protonmail/webclient/$commit/*/dist -maxdepth 0 -type d; } \
    | tar -cvf $WEBCLIENTS_ARTIFACT_TAR -T -
# append artifact tar
yarn --silent scripts/print-provider-repo-commit-hash tutanota \
    | { read commit; find output/git/tutanota/webclient/$commit/*/build/dist -maxdepth 0 -type d; } \
    | tar -rvf $WEBCLIENTS_ARTIFACT_TAR -T -

# upload artifact tar
yarn scripts/transfer travis-upload $WEBCLIENTS_ARTIFACT_TAR
