Node Inspector is a debugger interface for nodeJS using the WebKit Web Inspector.

## Getting Started

### Requirements

* [nodeJS](http://github.com/ry/node)
  - versions: 0.1.101 or later
* A WebKit based browser: Chrome, Safari, OmniWeb, etc.

### Install

* With npm
  - npm install node-inspector

* From source
  - git clone http://github.com/dannycoates/node-inspector.git

### Debugging

As an example lets debug test/hello.js, from the root project directory (node-inspector)

2. start the inspector in the background
		node bin/inspector.js &

    > or with npm just run `node-inspector &`

1. start the node instance to debug
		node --debug test/hello.js

3. open http://127.0.0.1:8080 in your favorite WebKit based browser

    > Chrome 5 users **MUST** use 127.0.0.1 **NOT** localhost or the browser will not connect to the debugger

4. you should now see the javascript source from nodeJS

5. set some breakpoints, see what happens

For more information on getting started see the [wiki](http://github.com/dannycoates/node-inspector/wiki/Getting-Started---from-scratch)

## Options

		--web-port=[port]     port to host the inspector (default 8080)

## Extensions

This project started as a Chrome extension. For more info see the [wiki](http://github.com/dannycoates/node-inspector/wiki/Google-Chrome-Extension).

## Cool stuff

* the WebKit Web Inspector debugger is a great js debugger interface, it works just as well for node
* uses a WebSocket to connect to debug-agent, so no polling for breaks
* remote debugging
* javascript top to bottom :)

## Known Issues

This is alpha quality code, so use at your own risk:

* be careful about viewing the contents of Buffer objects, each byte is displayed as an individual array element, for anything but tiny Buffers this will take too long to render
* while not stopped at a breakpoint the console doesn't always behave as you might expect
* pause on exceptions doesn't play nice with the node event loop
* closing the inspector does not stop debugging, you must stop inspector.js manually

## TODOS

* save application settings
* profiler panel

## Thanks

This project respectfully uses code from and thanks the authors of:

* [WebKit](http://webkit.org/building/checkout.html)
* [node](http://github.com/ry/node)
* [node-websocket-server](http://github.com/miksago/node-websocket-server)
* [node-paperboy](http://github.com/felixge/node-paperboy)


