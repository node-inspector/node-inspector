#!/usr/bin/env node

var DebugServer = require('../lib/debug-server').DebugServer,
    fs = require('fs'),
    path = require('path'),
    config = require('../lib/config'),
    packageJson = require('../package.json');

console.log('Node Inspector v%s', packageJson.version);

var debugServer = new DebugServer();
debugServer.on('close', function () {
  console.log('session closed');
  process.exit();
});
debugServer.start(config);
