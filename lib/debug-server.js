var http = require('http'),
    EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits,
    extend = require('util')._extend,
    path = require('path'),
    express = require('express'),
    io = require('socket.io'),
    Session = require('./session'),
    buildUrl = require('../index.js').buildInspectorUrl,
    WEBROOT = path.join(__dirname, '../front-end'),
    config = {};

function debugAction(req, res) {
  config.debugPort = getDebuggerPort(req.url, config.debugPort);
  res.sendfile(path.join(WEBROOT, 'inspector.html'));
}

function overridesAction(req, res) {
  res.sendfile(path.join(__dirname, '../front-end-node/Overrides.js'));
}

function fileResourceAction(req, res) {
  var filePath = req.params[0];

  if (process.platform == 'win32') {
    // On Windows, we should receive '/C:/path/to/file'.
    if (!/^\/[a-zA-Z]:\//.test(filePath)) {
      return res.send(404, '');
    }

    // Remove leading '/' and replace all other '/' with '\'
    filePath = filePath.slice(1).split('/').join(path.sep);

    // ensure there are no ".." in the path
    filePath = path.normalize(filePath);
  }

  res.sendfile(filePath);
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
  this.emit('listening');
}

function handleServerError(err) {
  this.emit('error', err);
}

function DebugServer() {}

inherits(DebugServer, EventEmitter);

DebugServer.prototype.start = function(options) {
  this._config = extend({}, options);

  var app = express();
  var httpServer = http.createServer(app);
  this._httpServer = httpServer;

  app.get('/debug', debugAction);
  app.get('/node/Overrides.js', overridesAction);
  app.get('/file-resource/*', fileResourceAction);
  app.use(express.static(WEBROOT));

  var ws = io.listen(httpServer);
  ws.configure(function() {
    ws.set('transports', ['websocket']);
    ws.set('log level', 1);
  });
  ws.sockets.on('connection', handleWebSocketConnection);
  this.wsServer = ws;
  httpServer.on('listening', handleServerListening.bind(this));
  httpServer.on('error', handleServerError.bind(this));
  httpServer.listen(this._config.webPort, this._config.webHost);
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
