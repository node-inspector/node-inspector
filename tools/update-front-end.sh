#!/bin/sh

REPOURL="http://src.chromium.org/blink/branches/chromium"

BRANCH=$1

if [ -z "$BRANCH" ]; then
  echo "Missing branch id"
  echo "Usage:"
  echo "  $0 <branchId>"
  echo "Check the following URL to see the list of all branches:"
  echo "  $REPOURL"
  exit 1
fi

BRANCHURL="$REPOURL/$BRANCH"

rm -rf blink-devtools
mkdir blink-devtools

echo "Checking out front-end files"
svn checkout "$BRANCHURL/Source/devtools" blink-devtools

echo "Updating front-end"
rm -rf front-end/*
cp -r blink-devtools/front_end/* front-end
find front-end -name '.svn' -type d -exec rm -rf {} \; > /dev/null
cp blink-devtools/protocol.json tools

echo "Done."
rm -rf blink-devtools
