var http = require('http'),
    EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits,
    extend = require('util')._extend,
    path = require('path'),
    express = require('express'),
    WebSocketServer = require('ws').Server,
    Session = require('./session'),
    buildUrl = require('../index.js').buildInspectorUrl,
    WEBROOT = path.join(__dirname, '../front-end');

function debugAction(req, res) {
  res.sendfile(path.join(WEBROOT, 'inspector.html'));
}

function overridesAction(req, res) {
  res.sendfile(path.join(__dirname, '../front-end-node/Overrides.js'));
}

function handleWebSocketConnection(socket) {
  var debugPort = this._getDebuggerPort(socket.upgradeReq.url);
  this._createSession(debugPort).join(socket);
}

function handleServerListening() {
  this.emit('listening');
}

function handleServerError(err) {
  if (err._handledByInspector) return;
  err._handledByInspector = true;
  this.emit('error', err);
}

function DebugServer() {}

inherits(DebugServer, EventEmitter);

DebugServer.prototype.start = function(options) {
  this._config = extend({}, options);

  var app = express();
  var httpServer = http.createServer(app);
  this._httpServer = httpServer;

  app.get('/debug', debugAction.bind(this));
  app.get('/node/Overrides.js', overridesAction);
  app.use(express.static(WEBROOT));

  this.wsServer = new WebSocketServer({
    server: httpServer
  });
  this.wsServer.on('connection', handleWebSocketConnection.bind(this));
  this.wsServer.on('error', handleServerError.bind(this));

  httpServer.on('listening', handleServerListening.bind(this));
  httpServer.on('error', handleServerError.bind(this));
  httpServer.listen(this._config.webPort, this._config.webHost);
};

DebugServer.prototype._getDebuggerPort = function(url) {
  return parseInt((/\?port=(\d+)/.exec(url) || [null, this._config.debugPort])[1], 10);
};

DebugServer.prototype._createSession = function(debugPort) {
  return Session.create(debugPort, this._config);
};

DebugServer.prototype.close = function() {
  if (this.wsServer) {
    this.wsServer.close();
    this.emit('close');
  }
};

DebugServer.prototype.address = function() {
  var address = this._httpServer.address();
  var config = this._config;
  address.url = buildUrl(config.webHost, address.port, config.debugPort);
  return address;
};

exports.DebugServer = DebugServer;
