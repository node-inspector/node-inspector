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
    localIp = require('network-address'),
    Session = require('./session'),
    remoteDebugService = require('./remoteDebugService.js'),
    buildInspectorUrl = require('../index.js').buildInspectorUrl,
    buildWebSocketUrl = require('../index.js').buildWebSocketUrl,
    buildFrontendUrl = require('../index.js').buildFrontendUrl,
    OVERRIDES = path.join(__dirname, '../front-end-node'),
    WEBROOT = path.join(__dirname, '../front-end');

function debugAction(req, res) {
  res.sendFile(path.join(WEBROOT, 'inspector.html'));
}

function handleWebSocketConnection(socket) {
  var debugPort = this._getDebuggerPort(socket.upgradeReq.url);
  this._createSession(debugPort).join(socket);
}

function handleServerListening() {
  this.emit('listening');

<<<<<<< HEAD
  if(this._shouldAnnounceEndpoint()) {

    // Register as RemoteDebug service on mDNS/Bonjour
    var websocketAddress = this.getWebSocketAddress();
    var frontendAddress = this.getInspectorAddress();
    var faviconUrl = this.getFaviconUrl();

    remoteDebugService.registerService(frontendAddress, websocketAddress, faviconUrl);

  }
=======
  // Register on mDNS/Bonjour
  var websocketAddress = this.getWebSocketAddress();
  var frontendAddress = this.getInspectorAddress();
  var faviconUrl = this.getFaviconUrl();

  remoteDebugService.registerService(frontendAddress, websocketAddress, faviconUrl);
>>>>>>> Added remoteDebugService to register the service over MDNS.

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

DebugServer.prototype._shouldAnnounceEndpoint = function() {
  var addressInfo = this._httpServer.address();
  return addressInfo.address === '0.0.0.0';
};

DebugServer.prototype.close = function() {
  if (this.wsServer) {
    this.wsServer.close();
    this.emit('close');
  }
};

DebugServer.prototype.getHttpServerAddressInfo = function() {
  var addressInfo = this._httpServer.address();

  if(this._shouldAnnounceEndpoint()) {
    // Resolve local IP, in order for computers in the network to resolve
    addressInfo.address = localIp();
  }

  return addressInfo;
};

DebugServer.prototype.getInspectorAddress = function() {
  var config = this._config;
  var info = this.getHttpServerAddressInfo();

  info.url = buildInspectorUrl(info.address, info.port, config.debugPort, this._isHTTPS);
  
  return info;
};

DebugServer.prototype.getWebSocketAddress = function() {
  var config = this._config;
  var info = this.getHttpServerAddressInfo();

  info.url = buildWebSocketUrl(info.address, info.port, config.debugPort, this._isHTTPS);
  
  return info;
};

DebugServer.prototype.getFaviconUrl = function(debugPort) {
  var config = this._config;
  var info = this.getHttpServerAddressInfo();
  
  return buildFrontendUrl(info.address, info.port, '/favicon.ico', null, this._isHTTPS);
};

exports.DebugServer = DebugServer;