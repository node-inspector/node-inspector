Node Inspector is a debugger interface for nodeJS using the WebKit Web Inspector.

## Getting Started

### Requirements

* [nodeJS](http://github.com/ry/node)
  - versions: 0.3.0 or later
* [npm](http://github.com/isaacs/npm)
* A WebKit based browser: Chrome, Safari, etc.

* Optional [v8-profiler](http://github.com/dannycoates/v8-profiler) to use the profiles panel

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

1. Get the PID of the node process using your favorite method. `pgrep` or `ps -ef` are good

		$ pgrep -l node
		2345 node your/node/server.js

2. Send it the USR1 signal

		$ kill -s USR1 2345

Great! Now you are ready to attach node-inspector

### Debugging

1. start the inspector. I usually put it in the background

		$ node-inspector &

2. open http://127.0.0.1:8080/debug?port=5858 in your favorite WebKit based browser

3. you should now see the javascript source from node. If you don't, click the scripts tab.

4. select a script and set some breakpoints (far left line numbers)

5. then watch the [screencasts](http://www.youtube.com/view_play_list?p=A5216AC29A41EFA8)

For more information on getting started see the [wiki](http://github.com/dannycoates/node-inspector/wiki/Getting-Started---from-scratch)

node-inspector works almost exactly like the web inspector in Safari and
Chrome. Here's a good [overview](http://code.google.com/chrome/devtools/docs/scripts.html) of the UI

## FAQ / WTF

1. I don't see one of my script files in the file list.

    > try refreshing the browser (F5 or command-r)

2. My script runs too fast to attach the debugger.

    > use `--debug-brk` to pause the script on the first line

3. I got the ui in a weird state.

    > when in doubt, refresh
    
4. Can I debug remotely?

    > Yes. node-inspector must be running on the same machine, but your browser can be anywhere. Just make sure port 8080 is accessible

## Inspector options

    --web-port=[port]     port to host the inspector (default 8080)

## Cool stuff

* the WebKit Web Inspector debugger is a great js debugger interface, it works just as well for node
* uses WebSockets, so no polling for breaks
* remote debugging
* javascript top to bottom :)
* [edit running code](http://github.com/dannycoates/node-inspector/wiki/LiveEdit)

## Known Issues

This is beta quality code, so use at your own risk:

* be careful about viewing the contents of Buffer objects, each byte is displayed as an individual array element, for anything but tiny Buffers this will take too long to render
* while not stopped at a breakpoint the console doesn't always behave as you might expect

## Profiling

**VERY EXPERIMENTAL**
I don't recommend using this yet

To use the profiles panel, install the v8-profiler module:

    npm install v8-profiler

To use it do something like:

```javascript
var profiler = require('v8-profiler');

profiler.startProfiling('startup');
slowStartupFoo();
profiler.stopProfiling('startup');

profiler.takeSnapshot('beforeLeak');
leakyFoo();
profiler.takeSnapshot('afterLeak');
```

Then view the profiling results with the profiles panel in node-inspector. You can
also take heap snapshots on demand from the profiles panel.

## Thanks

This project respectfully uses code from and thanks the authors of:

* [WebKit](http://webkit.org/building/checkout.html)
* [node](http://github.com/ry/node)
* [socket.io](http://github.com/LearnBoost/socket.io)
* [node-paperboy](http://github.com/felixge/node-paperboy)


