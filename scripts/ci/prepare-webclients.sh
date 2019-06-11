#!/bin/bash

set -ev

# the script builds the web clients and then removes all the generated files except the actual dists
# so then only the actual dists without extra stuff could be cached by CI system

WEBCLIENTS_TMP_TAR=webclients.tar

yarn assets:webclient:protonmail
yarn assets:webclient:tutanota

# create cache tar
find output/git/protonmail/webclient/*/*/ -maxdepth 0 -type d \
    | awk '{print $1"dist/"}' \
    | tar -cf $WEBCLIENTS_TMP_TAR -T -
# append cache tar
find output/git/tutanota/webclient/*/*/ -maxdepth 0 -type d \
    | awk '{print $1"build/dist"}' \
    | tar -rf $WEBCLIENTS_TMP_TAR -T -

# keep only prepared web clients in the cache
rm -rf ./output
tar -xf $WEBCLIENTS_TMP_TAR
