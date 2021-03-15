#!/bin/bash

set -ev

sudo apt-get update
# purpose: compiling "desktop-idle" native module (issue: No package 'xscrnsaver' found)
sudo apt-get install --yes --no-install-recommends libxss-dev
