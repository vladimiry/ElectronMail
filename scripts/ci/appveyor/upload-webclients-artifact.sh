#!/bin/bash

set -ev

WEBCLIENTS_ARTIFACT_TAR=$1

# create artifact tar
yarn --silent scripts/print-provider-repo-commit-hash protonmail \
    | { read commit; find output/git/protonmail/webclient/$commit/*/dist -maxdepth 0 -type d; } \
    | tar -cvf $WEBCLIENTS_ARTIFACT_TAR -T -
# append artifact tar
yarn --silent scripts/print-provider-repo-commit-hash tutanota \
    | { read commit; find output/git/tutanota/webclient/$commit/*/build/dist -maxdepth 0 -type d; } \
    | tar -rvf $WEBCLIENTS_ARTIFACT_TAR -T -

# upload artifact tar
appveyor PushArtifact $WEBCLIENTS_ARTIFACT_TAR
