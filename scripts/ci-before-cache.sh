#!/bin/bash

set -ev

ZIP_FILE=output-cache.zip

zip $ZIP_FILE $(cat output/git/tutanota/webclient/dist-folders.txt) -r
zip $ZIP_FILE $(cat output/git/protonmail/webclient/dist-folders.txt) -r
rm -rf ./output
ls
unzip $ZIP_FILE
ls
