#!/bin/bash

set -ev

yarn scripts/ci/clean-git-output-if-needed

./scripts/ci/prepare-webclients.sh
