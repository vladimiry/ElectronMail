#!/bin/bash

set -ev

./scripts/ci/prepare-webclients.sh

./scripts/ci/appveyor/upload-webclients-artifact.sh $LINUX_JOB_ARTIFACT_TAR
