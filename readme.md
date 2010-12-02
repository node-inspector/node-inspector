Node Inspector is a debugger interface for nodeJS using the WebKit Web Inspector.

## Getting Started

### Requirements

* [nodeJS](http://github.com/ry/node)
  - versions: 0.3.0 or later
* A WebKit based browser: Chrome, Safari, etc.
* Optional [v8-profiler](http://github.com/dannycoates/v8-profiler) to use the profiles panel

### Install

* With [npm](http://github.com/isaacs/npm)
		npm install node-inspector
* Or from [source](http://github.com/dannycoates/node-inspector/wiki/Getting-Started---from-scratch)

### Debugging

As an example lets debug test/hello.js, from the root project directory (node-inspector)

1. start the inspector in the background
		node-inspector &

2. start the node instance to debug
		node --debug test/hello.js

3. open http://127.0.0.1:8080/debug?port=5858 in your favorite WebKit based browser

    > Chrome 5 users **MUST** use 127.0.0.1 **NOT** localhost or the browser will not connect to the debugger

4. you should now see the javascript source from nodeJS

5. select the hello.js script and set some breakpoints (far left line numbers)

6. now open http://127.0.0.1:8124/ in a new tab then go back to inspector tab

7. click "Step over next function call" and observe changes in the RHS panel

8. then watch the [screencast](http://www.youtube.com/watch?v=AOnK3NVnxL8)

For more information on getting started see the [wiki](http://github.com/dannycoates/node-inspector/wiki/Getting-Started---from-scratch)

## Options

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
* closing the browser does not stop debugging, you must stop node-inspector manually

## Profiling

To use the profiles panel, install the v8-profiler module:

		npm install v8-profiler

To use it do something like:

		var profiler = require('v8-profiler');
		
		profiler.startProfiling('startup');
		slowStartupFoo();
		profiler.stopProfiling('startup');
		
		profiler.takeSnapshot('beforeLeak');
		leakyFoo();
		profiler.takeSnapshot('afterLeak');

Then view the profiling results with the profiles panel in node-inspector. You can
also take heap snapshots on demand from the profiles panel.



## Thanks

This project respectfully uses code from and thanks the authors of:

* [WebKit](http://webkit.org/building/checkout.html)
* [node](http://github.com/ry/node)
* [node-websocket-server](http://github.com/miksago/node-websocket-server)
* [node-paperboy](http://github.com/felixge/node-paperboy)


