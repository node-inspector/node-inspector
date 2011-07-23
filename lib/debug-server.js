var Http = require('http'),
    EventEmitter = require('events').EventEmitter,
    WebSocket = require('websocket-server'),
    paperboy = require('paperboy'),
    Session = require('./session'),
    inherits = require('util').inherits,
    WEBROOT = require('path').join(__dirname, '../front-end'),
    sessions = {},
    config = {},
    webPort;

function serveStaticFiles(req, res) {
  req.url = req.url.replace(/^\/debug/, '/');
  paperboy.deliver(WEBROOT, req, res);
}

function getDebuggerPort(url, defaultPort) {
  return parseInt((/\?port=(\d+)/.exec(url) || [null, defaultPort])[1], 10);
}

function getSession(debuggerPort) {
  var session = sessions[debuggerPort];
  if (!session) {
    session = Session.create(debuggerPort, config);
    sessions[debuggerPort] = session;
    // TODO session on close
  }
  return session;
}

function handleWebSocketConnection(conn) {
  var port = getDebuggerPort(conn._req.url, config.debugPort);
  getSession(port).join(conn);
}

function handleServerListening() {
  console.log(
    'visit http://0.0.0.0:' +
    config.webPort +
    '/debug?port=' + config.debugPort + ' to start debugging');
}

function DebugServer() {}

inherits(DebugServer, EventEmitter);

DebugServer.prototype.start = function(options) {
  config = options;
  var httpServer = Http.createServer(serveStaticFiles);
  this.wsServer = WebSocket.createServer({ server: httpServer });
  this.wsServer.on('connection', handleWebSocketConnection);
  this.wsServer.on('listening', handleServerListening);
  this.wsServer.listen(config.webPort);
}

DebugServer.prototype.close = function() {
  if (this.wsServer) {
    this.wsServer.close();
    this.emit('close');
  }
}

exports.DebugServer = DebugServer;
