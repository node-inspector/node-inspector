#!/usr/bin/env node

var DebugServer = require('../lib/debug-server').DebugServer,
    fs = require('fs'),
    path = require('path'),
    Config = require('../lib/config'),
    packageJson = require('../package.json'),
    notifyParentProcess = getNotifyParentProcessFn();

var config = new Config(process.argv.slice(2));

if (config.help) {
  config.showHelp();
  process.exit();
}

if (config.version) {
  config.showVersion();
  process.exit();
}

console.log('Node Inspector v%s', packageJson.version);

var debugServer = new DebugServer();
debugServer.on('error', onError);
debugServer.on('listening', onListening);
debugServer.on('close', function () {
  process.exit();
});
debugServer.start(config);

function onError(err) {
  console.error(
    'Cannot start the server at %s:%s. Error: %s.',
    config.webHost,
    config.webPort,
    err.message || err
  );

  if (err.code === 'EADDRINUSE') {
    console.error(
      'There is another process already listening at this address.\n' +
      'Run `node-inspector --web-port={port}` to use a different port.'
    );
  }

  notifyParentProcess({
    event: 'SERVER.ERROR',
    error: err
  });
}

function onListening() {
  var address = this.address();
  console.log('Visit %s to start debugging.', address.url);

  notifyParentProcess({
    event: 'SERVER.LISTENING',
    address: address
  });
}

function getNotifyParentProcessFn() {
  if (!process.send) {
    return function(msg) {};
  }

  return function(msg) {
    process.send(msg);
  };
}
