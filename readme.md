Node Inspector is a debugger interface for nodeJS using the WebKit Web Inspector.

## Getting Started

### Requirements

* [nodeJS](http://github.com/ry/node)
  - versions: 0.1.100 - 0.1.101

### Setup

1. make a debug build of node
    > ./configure --debug
    
    > make
    
    > make install

### Debugging

(NEW) There are two ways to use node-inspector. First I'll describe the easy way. 
As an example lets debug test/hello.js, from the root project directory (node-inspector)

1. start the inspector like this:
    > node bin/inspector.js --start=test/hello.js

2. open http://localhost:8080 in your favorite WebKit based browser

3. you should now see the javascript source from nodeJS

4. set some breakpoints, see what happens


This will start a child process (node_g --debug test/hello.js) and host the inspector 
interface at http://localhost:8080. The other way is to connect the inspector to an 
external node process.

1. start a node process:
		> node_g --debug=7878 test/hello.js
		
2. start the inspector:
		> node bin/inspector.js --debug-port=7878 --agent-port=8000

3. open http://localhost:8000

## Options

		--start=[file]		starts [file] in a child process with node_g --debug
		--start-brk=[file]	same as start with --debug-brk
		--agent-port=[port]	port to host the inspector (default 8080)
		--debug-port=[port]	v8 debug port to connect to (default 5858)

## Extensions

This project started as a Chrome extension. For more info see the wiki.

## Cool stuff

* the WebKit Web Inspector debugger is a great js debugger interface, it works just as well for node
* uses a WebSocket to connect to debug-agent, so no polling for breaks
* javascript top to bottom :)

## Known Issues

This is pre-alpha quality code, so use at your own risk:

* while not stopped at a breakpoint the console doesn't always behave as you might expect
* pause on exceptions doesn't play nice with the node event loop
* closing the inspector does not stop debugging, you must stop inspector.js manually
* opening more than one inspector window causes trouble

## Other Ideas

* the inspector could be extended to provide collaborative debugging with
  multiple inspectors connected to the same debug session.
* use a native node extension instead of the inspector.js as a separate process

## TODOS

* save application settings
* single instance only
* debug-agent needs a lot of work
* try out live edit
* Safari 5 extension

## Thanks

This project respectfully uses code from and thanks the authors of:

* [WebKit](http://webkit.org/building/checkout.html)
* [node](http://github.com/ry/node)
* [node-websocket-server](http://github.com/miksago/node-websocket-server)
* [node-paperboy](http://github.com/felixge/node-paperboy)


