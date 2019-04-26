#!/bin/sh

set -ev

CHROME_SANDBOX_FILE=$1

echo processing $CHROME_SANDBOX_FILE file

chown root $CHROME_SANDBOX_FILE
chmod 4755 $CHROME_SANDBOX_FILE
