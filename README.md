# Node Inspector

[![Build Status](https://travis-ci.org/node-inspector/node-inspector.png?branch=master)](https://travis-ci.org/node-inspector/node-inspector)
[![NPM version](https://badge.fury.io/js/node-inspector.png)](http://badge.fury.io/js/node-inspector)
[![Bountysource](https://www.bountysource.com/badge/tracker?tracker_id=195817)](https://www.bountysource.com/trackers/195817-node-inspector?utm_source=195817&utm_medium=shield&utm_campaign=TRACKER_BADGE)

[![Join the chat at https://gitter.im/node-inspector/node-inspector](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/node-inspector/node-inspector?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

## Overview

Node Inspector is a debugger interface for Node.js applications that uses the
Blink Developer Tools (formerly WebKit Web Inspector).

The project maintenance and support is sponsored by
[StrongLoop](http://strongloop.com).

### Table of Content

 * [Quick Start](#quick-start)
 * [Features](#features)
 * [Known Issues](#known-issues)
 * [Troubleshooting](#troubleshooting)
 * [Advanced Use](#advanced-use)
 * [Configuration](#configuration)
 * [Contributing](#contributing-code)
 * [Credits](#credits)

## Quick Start

#### Install

```sh
$ npm install -g node-inspector
```

#### Start

```sh
$ node-debug app.js
```

where ```app.js``` is the name of your main Node application JavaScript file.

See available configuration options [here](https://github.com/node-inspector/node-inspector#configuration)

#### Debug

The `node-debug` command will load Node Inspector in your default browser.

> **NOTE:** Node Inspector works in Chrome and Opera only. You have to re-open
the inspector page in one of those browsers if another browser
is your default web browser (e.g. Safari or Internet Explorer).

Node Inspector works almost exactly as the Chrome Developer Tools. Read the
excellent
[DevTools overview](https://developer.chrome.com/devtools/index)
to get started.

Other useful resources:
 - Documentation specific to Node Inspector provided by StrongLoop:
  [Debugging with Node Inspector](http://docs.strongloop.com/display/SLC/Debugging+applications)
 - Miroslav's talk
  [How to Debug Node Apps with Node Inspector](https://vimeo.com/77870960)
 - Danny's [screencasts](http://www.youtube.com/view_play_list?p=A5216AC29A41EFA8)
   (most likely outdated by now)
 - [Getting Started from scratch](http://github.com/node-inspector/node-inspector/wiki/Getting-Started---from-scratch)
   on wiki (most likely outdated by now)

## Features

The Blink DevTools debugger is a powerful JavaScript debugger interface.
Node Inspector supports almost all of the debugging features of DevTools, including:

* Navigate in your source files
* Set breakpoints (and specify trigger conditions)
* Step over, step in, step out, resume (continue)
* Inspect scopes, variables, object properties
* Hover your mouse over an expression in your source to display its value in
  a tooltip
* Edit variables and object properties
* Continue to location
* Break on exceptions
* Disable/enable all breakpoints
* CPU and HEAP profiling
* Network client requests inspection
* Console output inspection

### Cool stuff
* Node Inspector uses WebSockets, so no polling for breaks.
* Remote debugging
* [Live edit of running code](http://github.com/node-inspector/node-inspector/wiki/LiveEdit),
  optionally persisting changes back to the file-system.
* Set breakpoints in files that are not loaded into V8 yet - useful for
  debugging module loading/initialization.
* Embeddable in other applications - see [Embedding HOWTO](docs/embedding.md)
  for more details.

## Known Issues

* Be careful about viewing the contents of Buffer objects,
  each byte is displayed as an individual array element;
  for most Buffers this will take too long to render.
* While not stopped at a breakpoint the console doesn't always
  behave as you might expect. See the
  [issue #146](https://github.com/node-inspector/node-inspector/issues/146).
* Break on uncaught exceptions does not work in all Node versions,
  you need at least v0.11.3 (see
  [node#5713](https://github.com/joyent/node/pull/5713)).
* Debugging multiple processes (e.g. cluster) is cumbersome.
  Read the following blog post for instructions:
  [Debugging Clustered Apps with Node-Inspector](http://strongloop.com/strongblog/whats-new-nodejs-v0-12-debugging-clusters/)

## Troubleshooting

#### My script runs too fast to attach the debugger.

The debugged process must be started with `--debug-brk`, this way the script is paused on the first line.

Note: `node-debug` adds this option for you by default.

#### I got the UI in a weird state.

When in doubt, refresh the page in browser

#### Can I debug remotely?

Yes. Node Inspector must be running on the same machine, but your browser can be anywhere.
Just make sure port 8080 is accessible.

#### How do I specify files to hide?

Create a JSON-encoded array.  You must escape quote characters when using a command-line option.

```sh
$ node-inspector --hidden='["node_modules/framework"]'
```

Note that the array items are interpreted as regular expressions.

#### UI doesn't load or doesn't work and refresh didn't help

Make sure that you have adblock disabled as well as any other content blocking scripts and plugins.

#### How can I (selectively) delete debug session metadata?

You may want to delete debug session metadata if for example Node Inspector gets in a bad state with some
watch variables that were function calls (possibly into some special c-bindings).  In such cases, even restarting
the application/debug session may not fix the problem.

Node Inspector stores debug session metadata in the HTML5 local storage.
You can inspect the contents of local storage and remove any items as
needed. In Google Chrome, you can execute any of the following in the JavaScript console:

```js
// Remove all
window.localStorage.clear()
// Or, to list keys so you can selectively remove them with removeItem()
window.localStorage
// Remove all the watch expressions
window.localStorage.removeItem('watchExpressions')
// Remove all the breakpoints
window.localStorage.removeItem('breakpoints')
```

When you are done cleaning up, hit refresh in the browser.

#### Node Inspector takes a long time to start up.

Try setting --no-preload to true. This option disables searching disk for *.js at startup.
Code will still be loaded into Node Inspector at runtime, as modules are required.

#### How do I debug Mocha unit-tests?

You have to start `_mocha` as the debugged process and make sure
the execution pauses on the first line. This way you have enough
time to set your breakpoints before the tests are run.

```sh
$ node-debug _mocha
```

#### How do I debug Gulp tasks?

If you are running on a Unix system you can simply run the following command.
The `$(which ..)` statement gets replaced with the full path to the gulp-cli.

```sh
$ node-debug $(which gulp) task
```

If you are running on Windows, you have to get the full path of `gulp.js`
to make an equivalent command:

```sh
> node-debug %appdata%\npm\node_modules\gulp\bin\gulp.js task
```
*You can omit the `task` part to run the `default` task.*

## Advanced Use

While running `node-debug` is a convenient way to start your debugging
session, there may come time when you need to tweak the default setup.

There are three steps needed to get you up and debugging:

#### 1. Start the Node Inspector server

```sh
$ node-inspector
```

You can leave the server running in background, it's possible to debug
multiple processes using the same server instance.

#### 2. Enable debug mode in your Node process

You can either start Node with a debug flag like:

```sh
$ node --debug your/node/program.js
```

or, to pause your script on the first line:

```sh
$ node --debug-brk your/short/node/script.js
```

Or you can enable debugging on a node that is already running by sending
it a signal:

1. Get the PID of the node process using your favorite method.
`pgrep` or `ps -ef` are good

    ```sh
    $ pgrep -l node
    2345 node your/node/server.js
    ```

2. Send it the USR1 signal

    ```sh
    $ kill -s USR1 2345
    ```

##### Windows

Windows does not support UNIX signals. To enable debugging, you can use
an undocumented API function `process._debugProcess(pid)`:

1. Get the PID of the node process using your favorite method, e.g.

    ```sh
    > tasklist /FI "IMAGENAME eq node.exe"

    Image Name                     PID Session Name        Session#    Mem Usage
    ========================= ======== ================ =========== ============
    node.exe                      3084 Console                    1     11,964 K
    ```

2. Call the API:

    ```sh
    > node -e "process._debugProcess(3084)"
    ```

#### 3. Load the debugger UI

Open http://127.0.0.1:8080/?port=5858 in the Chrome browser.

## Configuration

Both `node-inspector` and `node-debug` use [rc](https://npmjs.org/package/rc) module
to manage configuration options.

Places for configuration:
* command line arguments (parsed by [yargs](https://github.com/chevex/yargs))
* environment variables prefixed with ```node-inspector_```
* if you passed an option ```--config file``` then from that file
* a local ```.node-inspectorrc``` or the first found looking in ```./ ../ ../../
 ../../../``` etc.
* ```$HOME/.node-inspectorrc```
* ```$HOME/.node-inspector/config```
* ```$HOME/.config/node-inspector```
* ```$HOME/.config/node-inspector/config```
* ```/etc/node-inspectorrc```
* ```/etc/node-inspector/config```

All configuration sources that where found will be flattened into one object,
so that sources earlier in this list override later ones.

### Options

| Option | Alias | Default | Description |
| :------------------ | :-: | :-----: | :-------- |
| **general**
| --help              | -h  |         | Display information about available options.<br/>Use `--help -l` to display full usage info.<br/>Use `--help <option>` to display quick help on `option`.
| --version           | -v  |         | Display Node Inspector's version.
| --debug-port        | -d  | 5858    | Node/V8 debugger port.<br/>(`node --debug={port}`)
| --web-host          |     | 0.0.0.0 | Host to listen on for Node Inspector's web interface.<br/>`node-debug` listens on `127.0.0.1` by default.
| --web-port          | -p  | 8080    | Port to listen on for Node Inspector's web interface.
| **node-debug**
| --debug-brk         | -b  | true    | Break on the first line.<br/>(`node --debug-brk`)
| --nodejs            |     | []      | Pass NodeJS options to debugged process.<br/>(`node --option={value}`)
| --script            |     | []      | Pass options to debugged process.<br/>(`node app --option={value}`)
| --cli               | -c  | false   | CLI mode, do not open browser.
| **node-inspector**
| --save-live-edit    |     | false   | Save live edit changes to disk (update the edited files).
| --preload           |     | true    | Preload *.js files. You can disable this option<br/>to speed up the startup.
| --inject            |     | true    | Enable injection of debugger extensions into the debugged process. It's possible disable only part of injections using subkeys `--no-inject.network`. Allowed keys : `network`, `profiles`, `console`.
| --hidden            |     | []      | Array of files to hide from the UI,<br/>breakpoints in these files will be ignored.<br/>All paths are interpreted as regular expressions.
| --stack-trace-limit |     | 50      | Number of stack frames to show on a breakpoint.
| --ssl-key           |     |         | Path to file containing a valid SSL key.
| --ssl-cert          |     |         | Path to file containing a valid SSL certificate.

### Usage examples

#### Command line
##### Format
```
$ node-debug [general-options] [node-debug-options] [node-inspector-options] [script]
```

```
$ node-inspector [general-options] [node-inspector-options]
```
##### Usage

Display full usage info:
```
$ node-debug --help -l
```
Set debug port of debugging process to `5859`:
```
$ node-debug -p 5859 app
```
Pass `--web-host=127.0.0.2` to node-inspector. Start node-inspector to listen on `127.0.0.2`:
```
$ node-debug --web-host 127.0.0.2 app
```
Pass `--option=value` to debugging process:
```
$ node-debug app --option value
```
Start node-inspector to listen on HTTPS:
```
$ node-debug --ssl-key ./ssl/key.pem --ssl-cert ./ssl/cert.pem app
```
Ignore breakpoints in files stored in `node_modules` folder or ending in `.test.js`:
```
$ node-debug --hidden node_modules/ --hidden \.test\.js$ app
```
Add `--harmony` flag to the node process running the debugged script:
```
$ node-debug --nodejs --harmony app
```
Disable preloading of `.js` files:
```
$ node-debug --no-preload app
```

#### RC Configuration

Use dashed option names in RC files. Sample config file:
```js
{
  "web-port": 8088,
  "web-host": null,
  "debug-port": 5858,
  "save-live-edit": true,
  "preload": false,
  "hidden": ["\.test\.js$", "node_modules/"],
  "nodejs": ["--harmony"],
  "stack-trace-limit": 50,
  "ssl-key": "./ssl/key.pem",
  "ssl-cert": "./ssl/cert.pem"
}
```

## Contributing Code

Making Node Inspector the best debugger for node.js cannot be achieved without
the help of the community. The following resources should help you to get
started.

* [Contributing](https://github.com/node-inspector/node-inspector/wiki/Contributing)
* [Developer's Guide](https://github.com/node-inspector/node-inspector/wiki/Developer%27s-Guide)
* [Easy Picks](https://github.com/node-inspector/node-inspector/issues?direction=asc&labels=Easy+Pick&page=1&sort=updated&state=open)

## Credits

Maintainers

 - [Danny Coates](https://github.com/dannycoates) - the original author
   and a sole maintainer for several years.
 - [Miroslav Bajtoš](https://github.com/bajtos) - a current maintainer,
   sponsored by [StrongLoop](http://strongloop.com).
 - [3y3](https://github.com/3y3) - a current maintainer

Big thanks to the many contributors to the project, see [AUTHORS](AUTHORS).
