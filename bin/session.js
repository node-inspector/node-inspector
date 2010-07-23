var http = require('http'),
    events = require('events'),
    sys = require('sys'),
    path = require('path'),
    ws = require('../lib/ws'),
    paperboy = require('../lib/paperboy'),
    spawn = require('child_process').spawn,
    debugr = require('./debugger');

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

function override(options, defaults) {
  var result = {};
  Object.keys(defaults).forEach(function(key) {
    result[key] = options[key] || defaults[key];
  });
  return result;
}

///////////////////////////////////////////////////////////
// exports

exports.createSession = function(options) {
  var defaults = {
    debugPort: 5858,
    webPort: 8080,
    fwdio: false,
    brk: false,
    file: null
  };
  var settings = override(options || {}, defaults);
  var httpServer = http.createServer(staticFile);
  var wsServer = ws.createServer(null, httpServer);
  var debug = null;

  wsServer.on('connection', function(conn) {
    if (!debug) {
      // first connection
      debug = debugr.attachDebugger(settings.debugPort);
      debug.on('data', function(data) {
        wsServer.broadcast(JSON.stringify(data));
      });
      debug.on('close', function() {
        debug = null;
        session.close();
      });
    }
    conn.on('message', function(msg) {
      debug.request(msg);
    });
    session.emit('connection', conn);
  });

  if (settings.file) {
    var flag = '--debug=';
    if (options.brk) flag = '--debug-brk=';
    flag += settings.debugPort;
    var proc = spawn('node_g', [flag, settings.file]);
    proc.on('exit', function(code, signal) {
      proc = null;
      console.log('proc exited with code: ' + code + ' signal: ' + signal);
    });
    if (settings.fwdio) {
      function sendIo(event, data) {
        wsServer.broadcast(JSON.stringify({
          seq: 0,
          type: 'event',
          event: event,
          body: data
        }));
      }
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', function(data) {
        sys.print(data);
        sendIo('stdout', data);
      });

      proc.stderr.setEncoding('utf8');
      proc.stderr.on('data', function(data) {
        console.error(data);
        sendIo('stderr', data);
      });
    }
  }
  wsServer.listen(settings.webPort);

  var session = Object.create(events.EventEmitter.prototype, {
    close: {
      value: function()
      {
        if (proc) proc.kill();
        if (debug && debug.connected) debug.close();
        if (wsServer) wsServer.close();
        session.emit('close');
      }}});
  session.__defineGetter__('webPort', function() { return settings.webPort; });
  session.__defineGetter__('debugPort', function() { return settings.debugPort; });

  return session;
};
