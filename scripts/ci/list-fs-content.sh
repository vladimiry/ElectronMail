#!/bin/bash

set -ev

DIRS_DEFAULT=(".")

DIRS="$@"

if [ $# -eq 0 ]; then
    # no arguments passed to the script
    DIRS=$DIRS_DEFAULT
fi

for DIR in $DIRS; do
    echo listing \"${DIR}\" directory content

    if [ -d $DIR ]; then
        find $DIR \( -name "node_modules" -o -name ".git" \) -prune -o -print
    else
        echo \"${DIR}\" is not a directory
    fi
done
