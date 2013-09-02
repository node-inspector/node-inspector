# Node Inspector

[![Build Status](https://travis-ci.org/node-inspector/node-inspector.png?branch=master)](https://travis-ci.org/node-inspector/node-inspector)
[![Dependency Status](https://gemnasium.com/node-inspector/node-inspector.png)](https://gemnasium.com/node-inspector/node-inspector)
[![NPM version](https://badge.fury.io/js/node-inspector.png)](http://badge.fury.io/js/node-inspector)


## Overview
Node Inspector is a debugger interface for node.js using the
Blink Developer Tools (former WebKit Web Inspector).

## Features

The Blink DevTools debugger is a great javascript debugger interface;
it works just as well for node. Node Inspector supports almost all
of the debugging features of DevTools.

* Navigate in your source files
* Set breakpoints (and specify trigger conditions)
* Break on exceptions
* Step over, step in, step out, resume (continue)
* Continue to location
* Disable/enable all breakpoints
* Inspect scopes, variables, object properties
* Hover your mouse over an expression in your source to display its value in
  a tooltip
* Edit variables and object properties
* (etc.)

### Cool stuff
* Node Inspector uses WebSockets, so no polling for breaks.
* Remote debugging
* [Live edit of running code](http://github.com/dannycoates/node-inspector/wiki/LiveEdit),
  optionally persisting changes back to the file-system.
* Set breakpoints in files that are not loaded into V8 yet - useful for
  debugging module loading/initialization.
* Javascript from top to bottom :)
* Embeddable in other applications - see [Embedding HOWTO](docs/embedding.md)
  for more details.

## Known Issues

This is beta-quality code, so use at your own risk.

* Be careful about viewing the contents of Buffer objects,
  each byte is displayed as an individual array element;
  for most Buffers this will take too long to render.
* While not stopped at a breakpoint the console doesn't always
  behave as you might expect. See issue #146.
* Profiler is not implemented yet. Have a look at
  [node-webkit-agent](https://github.com/c4milo/node-webkit-agent)
  in the meantime.
* Break on uncaught exceptions does not work because of missing
  [support in node](https://github.com/joyent/node/pull/5713).
* Debugging multiple processes (e.g. cluster) is cumbersome.

## Getting Started

### Requirements

* [node.js](http://github.com/ry/node)
  - version 0.8 or later
* [npm](http://github.com/isaacs/npm)
* A Blink-based browser (i.e. Google Chrome)

### Install

* With [npm](http://github.com/isaacs/npm)

        $ npm install -g node-inspector

### Enable debug mode

To use node-inspector, enable debugging on the node you wish to debug.
You can either start node with a debug flag like:

    $ node --debug your/node/program.js

or, to pause your script on the first line:

    $ node --debug-brk your/short/node/script.js

Or you can enable debugging on a node that is already running by sending
it a signal:

1. Get the PID of the node process using your favorite method.
`pgrep` or `ps -ef` are good

		$ pgrep -l node
		2345 node your/node/server.js

2. Send it the USR1 signal

		$ kill -s USR1 2345

Great! Now you are ready to attach node-inspector

### Debugging

1. start the inspector. I usually put it in the background

		$ node-inspector &

2. open http://127.0.0.1:8080/debug?port=5858 in Chrome

3. you should now see the javascript source from node. If you don't, click the scripts tab.

4. select a script and set some breakpoints (far left line numbers)

5. then watch the [screencasts](http://www.youtube.com/view_play_list?p=A5216AC29A41EFA8)

For more information on getting started see the [wiki](http://github.com/dannycoates/node-inspector/wiki/Getting-Started---from-scratch)

node-inspector works almost exactly like the web inspector in
Chrome. Here's a good [overview](http://code.google.com/chrome/devtools/docs/scripts.html) of the UI

### Inspector options

Node-inspector uses [rc](https://npmjs.org/package/rc)
[[github]](https://github.com/dominictarr/rc) module to collect options.

Places for configuration:
* command line arguments (parsed by optimist)
* enviroment variables prefixed with ```node-inspector_```
* if you passed an option ```--config file``` then from that file
* a local ```.node-inspectorrc``` or the first found looking in ```./ ../ ../../
 ../../../``` etc.
* ```$HOME/.node-inspectorrc```
* ```$HOME/.node-inspector/config```
* ```$HOME/.config/node-inspector```
* ```$HOME/.config/node-inspector/config```
* ```/etc/node-inspectorrc```
* ```/etc/node-inspector/config```
* options from ```config.json``` for backward compatibility
* defaults described in Node Inspector`s [./lib/config.js](lib/config.js).

All configuration sources that where found will be flattened into one object,
so that sources earlier in this list override later ones.



List of predefined options:
```
         Option             Default                  Description
    --help            |                 |   Print information about options
    --web-port        |      8080       |   Port to host the inspector
    --web-host        |    127.0.0.1    |   Host to listen on
    --debug-port      |      5858       |   Port to connect to the debugging app
    --save-live-edit  |      false      |   Save live edit changes to disk (update the edited files)
    --hidden          |       []        |   Array of files to hide from the UI
                      |                 |   Breakpoints in these files will be ignored
```

## FAQ / WTF

1. My script runs too fast to attach the debugger.

  > use `--debug-brk` to pause the script on the first line

2. I got the ui in a weird state.

  > when in doubt, refresh

3. Can I debug remotely?

  > Yes. node-inspector must be running on the same machine,
  > but your browser can be anywhere.
  > Just make sure port 8080 is accessible

## Contributing Code

Making Node Inspector the best debugger for node.js cannot be achieved without
the help of the community. The following resources should help you to get
started.

* [Contributing](https://github.com/node-inspector/node-inspector/wiki/Contributing)
* [Developer's Guide](https://github.com/node-inspector/node-inspector/wiki/Developer%27s-Guide)
* [Easy Picks](https://github.com/node-inspector/node-inspector/issues?direction=asc&labels=Easy+Pick&page=1&sort=updated&state=open)

## Thanks

[Danny Coates](https://github.com/dannycoates) for starting the project
and maintaining it for several years.

[StrongLoop](http://strongloop.com) for upgrading to the Blink front-end
and maintaining the project onwards.

And of course all developers that contributed patches and features, as listed
in the [AUTHORS](AUTHORS) file.
