#!/bin/bash

# TODO drop "yarn audit" issues skipping workaround bash script

set +e
AUDIT_OUTPUT=`yarn audit`
AUDIT_EXIT_CODE=$?
set -e

KNOWN_ISSUES_FILE="yarn-audit-known-issues"
ISSUES_FILE="yarn-audit-issues"

if [ "$AUDIT_EXIT_CODE" != 0 ]; then
  if [ -f $KNOWN_ISSUES_FILE ]; then
    set +e
    yarn audit --json | grep auditAdvisory > $ISSUES_FILE
    set -e

    if diff -q $KNOWN_ISSUES_FILE $ISSUES_FILE > /dev/null 2>&1; then
      echo
      echo Ignorning known vulnerabilities
      exit 0
    fi
  fi

  echo "$AUDIT_OUTPUT"

  echo
  echo Security vulnerabilities were found that were not ignored
  echo
  echo Check to see if these vulnerabilities apply to production
  echo and/or if they have fixes available. If they do not have
  echo fixes and they do not apply to production, you may ignore them
  echo
  echo To ignore these vulnerabilities, run:
  echo
  echo "yarn audit --json | grep auditAdvisory > $KNOWN_ISSUES_FILE"
  echo
  echo and commit the $KNOWN_ISSUES_FILE file

  exit "$AUDIT_EXIT_CODE"
fi
