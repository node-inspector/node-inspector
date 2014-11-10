## How to release a new version

If you are running on Unix (Mac OSX, Linux), you can run `tools/release.sh`
that will run all steps for you:

    $ tools/release.sh X.Y.Z

### Manual steps

1. Make sure all tests are passing:

        $ npm test

1. Update the changelog

        $ tools/git-changelog X.Y.Z

1. Update the version in package.json

        $ npm version --git-tag-version=false X.Y.Z

1. Commit the changes to git

        $ git commit ChangeLog.md package.json -m X.Y.Z

1. Create a git tag

        $ git tag -a vX.Y.Z -m X.Y.Z

1. Push all changes to the server

        $ git push origin master vX.Y.Z

1. Publish the package

        npm publish

