#!/bin/bash

set -ev

# TODO consider using custom docker image with all the stuff preconfigured

# prevent "404  Not Found"-like packages fetching errors
cat /etc/apt/sources.list
sudo apt clean && sudo apt update

# dependencies needed for building protonmail/tutanota web client (don't remember which one)
sudo apt-get --yes install nasm

# dependencies needed for compiling "node-keytar" native module (if there is no prebuild binary for used node version)
sudo apt-get --yes install libsecret-1-dev
