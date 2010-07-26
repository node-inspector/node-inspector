#!/usr/bin/env node

var sys = require('sys'),
    session = require('./session');

var options = {};

process.argv.forEach(function(arg) {
  if (arg.indexOf('--') > -1) {
    var parts = arg.split('=');
    if (parts.length > 1) {
      switch(parts[0]) {
        case '--start':
          options.file = parts[1];
          break;
        case '--start-brk':
          options.file = parts[1];
          brk = true;
          break;
        case '--agent-port':
          options.webPort = parseInt(parts[1], 10);
          break;
        case '--debug-port':
          options.debugPort = parseInt(parts[1], 10);
          break;
        default:
          console.log('unknown option: ' + parts[0]);
          break;
      }
    }
    else if (parts[0] === '--fwd-io') {
      options.fwdio = true;
    }
    else if (parts[0] === '--profile') {
      options.profile = true;
    }
    else if (parts[0] === '--help') {
      console.log('Usage: node [node_options] debug-agent.js [options]');
      console.log('Options:');
      console.log('--start=[file]        starts [file] in a child process with node_g --debug');
      console.log('                      [file] path can be absolute or relative to $PWD');
      console.log('--start-brk=[file]    same as start with --debug-brk');
      console.log('--agent-port=[port]   port to host the inspector (default 8080)');
      console.log('--debug-port=[port]   v8 debug port to connect to (default 5858)');
      console.log('--fwd-io              forward stdout and stderr from the child process to inspector console');
      process.exit();
    }
  }
});

var ds = session.createSession(options);

ds.on('close', function() {
  console.log('session closed');
  process.exit();
});
console.log('visit http://127.0.0.1:' + ds.webPort + ' to start debugging');
