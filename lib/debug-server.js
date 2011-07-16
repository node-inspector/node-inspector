var Http = require('http'),
    EventEmitter = require('events').EventEmitter,
    WebSocket = require('websocket-server'),
    paperboy = require('paperboy'),
    Session = require('./session'),
    inherits = require('util').inherits,
    WEBROOT = require('path').join(__dirname, '../front-end'),
    sessions = {},
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
    session = Session.create(debuggerPort, {}); // TODO fix config
    sessions[debuggerPort] = session;
    // TODO session on close
  }
  return session;
}

function handleWebSocketConnection(conn) {
  var port = getDebuggerPort(conn._req.url, 5858); // TODO
  getSession(port).join(conn) 
}

function handleServerListening() {
  console.log(
    'visit http://0.0.0.0:' +
    webPort +
    '/debug?port=5858 to start debugging'); // TODO port
}

function DebugServer() {
  var httpServer = Http.createServer(serveStaticFiles);
  this.wsServer = WebSocket.createServer({ server: httpServer });
  this.wsServer.on('connection', handleWebSocketConnection);
  this.wsServer.on('listening', handleServerListening);
}

inherits(DebugServer, EventEmitter);

DebugServer.prototype.close = function() {
  if (this.wsServer) {
    this.wsServer.close();
    this.emit('close');
  }
}

DebugServer.prototype.listen = function(port) {
  webPort = port;
  this.wsServer.listen(port);
}

exports.DebugServer = DebugServer;
