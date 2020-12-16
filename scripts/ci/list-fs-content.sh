#!/bin/bash

set -ev

# listing starts from "." if no arguments passed to the script
for DIR in "${@:-.}"; do
    echo listing \"$DIR\" directory content

    if [ -d "$DIR" ]; then
        find $DIR \( -name "node_modules" -o -name ".git" \) -prune -o -print
    else
        echo \"$DIR\" is not a directory
    fi
done
