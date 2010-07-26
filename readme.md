Node Inspector is a debugger interface for nodeJS using the WebKit Web Inspector.

## Getting Started

### Requirements

* [nodeJS](http://github.com/ry/node)
  - versions: 0.1.100 - 0.1.101
* A WebKit based browser: Chrome, Safari, OmniWeb, etc.

### Setup

1. make a debug build of node
		./configure --debug
		make
		make install

If you get an error like: `Build failed: Missing node signature for...` try `make distclean` then try again.

### Debugging

There are two ways to use node-inspector. First I'll describe the easy way. 
As an example lets debug test/hello.js, from the root project directory (node-inspector)

1. start the inspector like this:
		node bin/inspector.js --start=test/hello.js

2. open http://127.0.0.1:8080 in your favorite WebKit based browser

3. you should now see the javascript source from nodeJS

4. set some breakpoints, see what happens


This will start a child process `node_g --debug test/hello.js` and host the inspector 
interface at http://localhost:8080. The other way is to connect the inspector to an 
external node process.

1. start a node process:
		node_g --debug=7878 test/hello.js
		
2. start the inspector:
		node bin/inspector.js --debug-port=7878 --agent-port=8000

3. open http://127.0.0.1:8000

For more information on getting started see the [wiki](http://wiki.github.com/dannycoates/node-inspector/getting-started-from-scratch)

## Options

		--start=[file]		starts [file] in a child process with node_g --debug
		--start-brk=[file]	same as start with --debug-brk
		--agent-port=[port]	port to host the inspector (default 8080)
		--debug-port=[port]	v8 debug port to connect to (default 5858)
		--fwd-io			forward stdout and stderr from the child process to inspector console

## Extensions

This project started as a Chrome extension. For more info see the [wiki](http://wiki.github.com/dannycoates/node-inspector/google-chrome-extension).

## Cool stuff

* the WebKit Web Inspector debugger is a great js debugger interface, it works just as well for node
* uses a WebSocket to connect to debug-agent, so no polling for breaks
* javascript top to bottom :)

## Known Issues

This is alpha quality code, so use at your own risk:

* be careful about viewing the contents of Buffer objects, each byte is displayed as an individual array element, for anything but tiny Buffers this will take too long to render
* if the 'this' object in a call frame is the global object, expanding it yield nothing
* while not stopped at a breakpoint the console doesn't always behave as you might expect
* pause on exceptions doesn't play nice with the node event loop
* closing the inspector does not stop debugging, you must stop inspector.js manually

## Other Ideas

* the inspector could be extended to provide collaborative debugging with
  multiple inspectors connected to the same debug session.
* use a native node extension instead of the inspector.js as a separate process

## TODOS

* save application settings
* debug-agent needs a lot of work
* try out live edit
* profiler panel

## Thanks

This project respectfully uses code from and thanks the authors of:

* [WebKit](http://webkit.org/building/checkout.html)
* [node](http://github.com/ry/node)
* [node-websocket-server](http://github.com/miksago/node-websocket-server)
* [node-paperboy](http://github.com/felixge/node-paperboy)


