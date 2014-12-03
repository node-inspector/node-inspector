#!/bin/bash

set -e

VERSION=${1:?version is mandatory}
TAG=v${VERSION}

echo --RELEASE $VERSION AS TAG $TAG--

echo --Pull remote changes--
git pull

echo --Reinstall all dependencies--
rm -rf node_modules && npm install

echo --Run the tests--
npm test

echo --Update ChangeLog.md--
tools/git-changelog -t "$VERSION"

echo --Update the version in package.json--
npm version --git-tag-version=false "$VERSION"

echo --Commit the changes--
git commit -m "$VERSION" ChangeLog.md package.json

echo --Tag the release--
tools/git-changelog -l -t "$VERSION" | git tag -a "$TAG" -F-

echo --Push to github--
git push && git push origin "$TAG"

echo --Publish to npmjs.org--
npm publish
