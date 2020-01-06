#!/bin/bash

set -ev

ARCHIVE_FILE=$1 # archive file

# create archive
./scripts/ci/archive-webclients-dist-only.sh $ARCHIVE_FILE

# upload artifact tar
appveyor PushArtifact $ARCHIVE_FILE
