#!/usr/bin/env node

var net = require('net'),
    http = require('http'),
    sys = require('sys'),
    path = require('path'),
    ws = require('../lib/ws'),
    paperboy = require('../lib/paperboy'),
    spawn = require('child_process').spawn;

//////////////////////////////////////////////////////////
//	Node side

var seq = 0;
var buffer = '';
var current = false;

function request(data) {
  var message = 'Content-Length: ' + data.length + '\r\n\r\n' + data;
  debug.write(message);
}

function makeMessage() {
  return {
    headersDone: false,
    headers: null,
    contentLength: 0,
    body: ''
  };
}

function parseBody() {
  if (buffer.length >= current.contentLength) {
    current.body = buffer.slice(0, current.contentLength);
    buffer = buffer.slice(current.contentLength);
    if (current.body.length > 0 && wsServer) {
      if (wsServer.manager.length === 0) {
        var msg = JSON.parse(current.body);
        if (msg.type === 'event' && msg.event === 'break') {
          request('{"seq":0,"type":"request","command":"continue"}');
        }
      }
      else {
        wsServer.broadcast(current.body);
      }
    }
    current = false;
    parse();
  }
}

function parse() {
  if (current && current.headersDone) {
    parseBody();
    return;
  }

  if (!current) current = makeMessage();

  var offset = buffer.indexOf('\r\n\r\n');
  if (offset > 0) {
    current.headersDone = true;
    current.headers = buffer.substr(0, offset+4);
    var m = /Content-Length: (\d+)/.exec(current.headers);
    if (m[1]) {
      current.contentLength = parseInt(m[1], 10);
    }
    else {
      sys.debug('no Content-Length');
    }
    buffer = buffer.slice(offset+4);
    parse();
  }
}

function attachDebugger() {
  var conn = conn = net.createConnection(debugPort);
  conn.setEncoding('ascii');

  conn.on('data', function(data) {
    buffer += data;
    parse();
  });

  conn.on('end', function() {
    process.exit();
  });
  return conn;
}

var debug = null;

///////////////////////////////////////////////////////////
//	Browser side

var WEBROOT = path.join(path.dirname(__filename), '../front-end');

function staticFile(req, res) {
  paperboy
    .deliver(WEBROOT, req, res)
    .error(function(statCode,msg) {
      res.writeHead(statCode, {'Content-Type': 'text/plain'});
      res.end("Error: " + statCode);
    })
    .otherwise(function(err) {
      var statCode = 404;
      res.writeHead(statCode, {'Content-Type': 'text/plain'});
      res.end();
    });
}

var httpServer = http.createServer(staticFile);

var wsServer = ws.createServer({ debug: false }, httpServer);

wsServer.on('connection', function(conn) {
  if (debug == null) {
    debug = attachDebugger();
  }
  conn.on('message', function(msg) {
    request(msg);
  });
});

////////////////////////////////////////////////////////
//	Startup

var fileToDebug = null;
var port = 8080;
var flag = '--debug=';
var debugPort = 5858;
var fwd = false;

process.argv.forEach(function(arg) {
  if (arg.indexOf('--') > -1) {
    var parts = arg.split('=');
    if (parts.length > 1) {
      switch(parts[0]) {
        case '--start':
          fileToDebug = parts[1];
          break;
        case '--start-brk':
          fileToDebug = parts[1];
          flag = '--debug-brk=';
          break;
        case '--agent-port':
          port = parseInt(parts[1], 10);
          break;
        case '--debug-port':
          debugPort = parseInt(parts[1], 10);
          break;
        default:
          console.log('unknown option: ' + parts[0]);
          break;
      }
    }
    else if (parts[0] === '--fwd-io') {
      fwd = true;
    }
    else if (parts[0] === '--help') {
      console.log('Usage: node [node_options] debug-agent.js [options]');
      console.log('Options:');
      console.log('--start=[file]\t\tstarts [file] in a child process with node_g --debug');
      console.log('--start-brk=[file]\tsame as start with --debug-brk');
      console.log('--agent-port=[port]\tport to host the inspector (default 8080)');
      console.log('--debug-port=[port]\tv8 debug port to connect to (default 5858)');
      console.log('--fwd-io\t\t\tforward stdout and stderr from the child process to inspector console');
      process.exit();
    }
  }
});

// spawn the process to debug
if (fileToDebug != null) {
  console.log('starting ' + fileToDebug);

  flag = flag + debugPort;
  var debugProcess = spawn('node_g', [flag, fileToDebug]);

  if (fwd) {
    debugProcess.stdout.setEncoding('utf8');
    debugProcess.stdout.on('data', function(data) {
      sys.print(data);
      wsServer.broadcast(JSON.stringify({
        seq: 0,
        type: 'event',
        event: 'stdout',
        body: data
      }));
    });

    debugProcess.stderr.setEncoding('utf8');
    debugProcess.stderr.on('data', function(data) {
      console.error(data);
      wsServer.broadcast(JSON.stringify({
        seq: 0,
        type: 'event',
        event: 'stderr',
        body: data
      }));
    });
  }

  debugProcess.on('exit', function(code) {
    console.log(fileToDebug + ' exited with code ' + code);
  });
}

// listen for clients
console.log('visit http://localhost:' + port + ' to start debugging');
wsServer.listen(port);
