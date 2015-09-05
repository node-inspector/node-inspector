#!/bin/bash

set -e

VERSION=${1:?version is mandatory}
TAG=v${VERSION}

PREPUBLISH=true
VERIFY=true
while [ "$1" != "" ]; do
  case $1 in
    -f | --forse | --no-verify )
      VERIFY=false
      ;;
    -p | --publish )
      PREPUBLISH=false
      ;;
  esac
  shift
done

echo --RELEASE $VERSION AS TAG $TAG--


if $PREPUBLISH; then

  if $VERIFY; then
    echo --Pull remote changes--
    git pull

    echo --Reinstall all dependencies--
    rm -rf node_modules && npm install

    echo --Run the tests--
    npm test
  fi


  echo --Update the version in package.json--
  npm version --git-tag-version=false "$VERSION"

  echo --Update ChangeLog.md--
  tools/git-changelog.sh -t "$VERSION"

  echo --Commit the changes--
  git commit -m "$VERSION" ChangeLog.md package.json

  echo --Tag the release--
  tools/git-changelog.sh -l -t "$VERSION" | git tag -a "$TAG" -F-
fi

echo --Push to github--
git push && git push origin "$TAG"

echo --Publish to npmjs.org--
npm publish

echo --RELEASED $VERSION--
