var http = require('http'),
    EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits,
    path = require('path'),
    express = require('express'),
    io = require('socket.io'),
    Session = require('./session'),
    WEBROOT = path.join(__dirname, '../front-end'),
    config = {};

function debugAction(req, res) {
  config.debugPort = getDebuggerPort(req.url, config.debugPort);
  res.sendfile(path.join(WEBROOT, 'inspector.html'));
}

function overridesAction(req, res) {
  res.sendfile(path.join(__dirname, '../front-end-node/Overrides.js'));
}

function getDebuggerPort(url, defaultPort) {
  return parseInt((/\?port=(\d+)/.exec(url) || [null, defaultPort])[1], 10);
}

function createSession(debuggerPort) {
  return Session.create(debuggerPort, config);
}

function handleWebSocketConnection(socket) {
  createSession(config.debugPort).join(socket);
}

function handleServerListening() {
  console.log(
    'visit http://' + (config.webHost || '0.0.0.0') + ':' +
    config.webPort +
    '/debug?port=' + config.debugPort + ' to start debugging');
}

function DebugServer() {}

inherits(DebugServer, EventEmitter);

DebugServer.prototype.start = function(options) {
  config = options;

  var app = express();
  var httpServer = http.createServer(app);

  app.get('/debug', debugAction);
  app.get('/node/Overrides.js', overridesAction);
  app.use(express.static(WEBROOT));

  var ws = io.listen(httpServer);
  ws.configure(function() {
    ws.set('transports', ['websocket']);
    ws.set('log level', 1);
  });
  ws.sockets.on('connection', handleWebSocketConnection);
  this.wsServer = ws;
  httpServer.on('listening', handleServerListening);
  httpServer.listen(config.webPort, config.webHost);
};

DebugServer.prototype.close = function() {
  if (this.wsServer) {
    this.wsServer.close();
    this.emit('close');
  }
};

exports.DebugServer = DebugServer;
