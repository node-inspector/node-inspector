Before opening a pull request
=============================

- [Wiki article on contributing to Node Inspector](https://github.com/node-inspector/node-inspector/wiki/Contributing)
- [Developer's guide](https://github.com/node-inspector/node-inspector/wiki/Developer%27s-Guide)

Before opening an issue
=======================

In order to facilitate reproduction of issues, please always provide the following info:

- node-inspector version (`node-inspector --version`)
- node.js version (`node --version`)
- operating system name and version

Please upgrade to the newest version before opening an issue:

`npm install -g node-inspector`

and check if it still is reproducible.

If the issue started happening after a recent upgrade, you can downgrade to an older version
of Node Inspector with a command like this:

`npm install -g node-inspector@0.8.3`

Providing information if the bug is a recent regression will also facilitate its handling.

Click [here](https://github.com/node-inspector/node-inspector/releases) to find out
what are the available versions.
Alternatively you can also use the following command:

`npm view node-inspector`
