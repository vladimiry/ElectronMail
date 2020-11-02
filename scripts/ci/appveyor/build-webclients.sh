#!/bin/bash

set -ev

yarn scripts/ci/clean-git-output-if-needed

./scripts/ci/prepare-webclients.sh

./scripts/ci/appveyor/upload-webclients-artifact.sh $LINUX_JOB_ARTIFACT_TAR
