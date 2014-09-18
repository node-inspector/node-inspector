var http = require('http'),
    https = require('https'),
    EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits,
    extend = require('util')._extend,
    fs = require('fs'),
    path = require('path'),
    express = require('express'),
    favicon = require('serve-favicon'),
    WebSocketServer = require('ws').Server,
    Session = require('./session'),
    buildUrl = require('../index.js').buildInspectorUrl,
    OVERRIDES = path.join(__dirname, '../front-end-node'),
    WEBROOT = path.join(__dirname, '../front-end');

function debugAction(req, res) {
  res.sendfile(path.join(WEBROOT, 'inspector.html'));
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
  this._isHTTPS = this._config.sslKey && this._config.sslCert ? true : false;

  var app = express();
  var httpServer;

  if (this._isHTTPS) {
    httpServer = https.createServer({
      key: fs.readFileSync(this._config.sslKey, {encoding: 'utf8'}),
      cert: fs.readFileSync(this._config.sslCert, {encoding: 'utf8'})
    }, app);
  } else {
    httpServer = http.createServer(app);
  }

  this._httpServer = httpServer;

  app.use(favicon(path.join(__dirname, '../front-end-node/Images/favicon.png')));
  app.get('/debug', debugAction.bind(this));
  app.use('/node', express.static(OVERRIDES));
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
  address.url = buildUrl(config.webHost, address.port, config.debugPort, null, this._isHTTPS);
  return address;
};

exports.DebugServer = DebugServer;
