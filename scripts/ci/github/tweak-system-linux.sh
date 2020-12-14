#!/bin/bash

set -ev

sudo apt-get update
# purpose: compiling "desktop-idle" native module
sudo apt-get install --yes --no-install-recommends libxss-dev
