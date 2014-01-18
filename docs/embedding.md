# HOWTO embed Node Inspector

Node Inspector provides two ways of embedding in third-party
applications.

## 1. Running in a new node process

1. Start the Node Inspector in a new process using
  [child_process.fork()](http://nodejs.org/api/child_process.html#child_process_child_process_fork_modulepath_args_options)
2. Add `message` handler to get notified about Node Inspector events, use
  `msg.event` to check which event was emitted.

```js
var fork = require('child_process').fork;

var inspectorArgs = [];
var forkOptions = { silent: true };
var inspector = fork(
  require.resolve('node-inspector/bin/inspector'),
  inspectorArgs,
  forkOptions
);

inspector.on('message', handleInspectorMessage);

function handleInspectorMessage(msg) {
  switch(msg.event) {
    case 'SERVER.LISTENING':
      console.log('Visit %s to start debugging.', msg.address.url);
      break;
    case 'SERVER.ERROR':
      console.log('Cannot start the server: %s.', msg.error.code);
      break;
  }
}
```

### Event: 'SERVER.LISTENING'

Emitted when the HTTP server was bound and is ready to accept connections.

Properties:

 * `address` - Server address as returned by `DebugServer.address()` (see
   below).

### Event: 'SERVER.ERROR'

Emitted when there was an error while setting up the HTTP server.

Properties:

 * `error` - The error.

## 2. Running in an existing process

To be done. [index.js](../index.js) should expose method for creating and starting
a DebugServer instance with a given config.

DebugServer is already exposing the following API:

### debugServer.address()

Returns the result of `server.address()` plus the URL of the Node Inspector
page to open in browser.

Example:
```js
{
  port: 8080,
  address: '0.0.0.0',
  url: 'http://localhost:8080/debug?port=5858'
}
```

### Event: 'listening'

Emitted when the HTTP server was bound and is ready to accept connections.

### Event: 'error'

* Error Object

Emitted when there is an error in setting up the HTTP server.

