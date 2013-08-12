## Release steps

List of steps required to do a release.  This is a draft that will be refined
while doing the next relase.

1. Make sure all tests are passing:

        npm test

1. Update changelog

        tools/git-changelog

1. Commit the changes to git and push them to the server

        git commit ChangeLog -m 'ChangeLog: updated for version vX.Y.Z'
        git push origin master

1. Create and publish a git tag

        git tag -a vX.Y.Z -m 'tagged version vX.Y.Z'
        git push origin vX.Y.Z

1. Publish the package

        npm publish

1. Bump up the module version in `package.json` to the next patch version

        # edit the module version in package.json, e.g. 0.3.0 -> 0.3.1
        git commit package.json -m 'started work on vX.Y.Z'
        git push origin master
