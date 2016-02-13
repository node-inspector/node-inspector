'use strict';

var url = require('url');
var EventEmitter = require('events');
var inherits = require('util').inherits;
var DebuggerClient = require('./DebuggerClient');
var ScriptManager = require('./ScriptManager');
var FrontendClient = require('./FrontendClient');
var InjectorClient = require('./InjectorClient');

function Session(config, socket) {
  this.port = port(config, socket);
  this.client = socket;

  this.debuggerClient = new DebuggerClient(config, this);
  this.frontendClient = new FrontendClient(config, this);
  this.injectorClient = new InjectorClient(config, this);
  this.scriptManager = new ScriptManager(config, this);

  this.frontendClient.on('close', this.close.bind(this));
  this.debuggerClient.on('close', this._onDebuggerClientClose.bind(this));
  this.debuggerClient.on('error', this._onDebuggerClientError.bind(this));

  this._pingInterval = setInterval(() => socket.ping(null, null, true), 1000);
  process.on('SIGINT', () => this.close().then(() => process.exit(0)));
  process.on('SIGQUIT', () => this.close().then(() => process.exit(0)));
}

inherits(Session, EventEmitter);

Session.prototype.close = function() {
  clearInterval(this._pingInterval);
  return this.debuggerClient.close()
    .then(() => this.emit('close'));
};

Session.prototype._onDebuggerClientClose = function(reason) {
  if (this.frontendClient.isConnected)
    this.frontendClient.sendInspectorDetached(reason);
  this.close();
};

Session.prototype._onDebuggerClientError = function(e) {
  var err = e.toString();
  if (e.helpString) {
    err += '\n' + e.helpString;
  }
  this.frontendClient.sendLogToConsole('error', err);
};

function port(config, socket) {
  const query = url.parse(socket.upgradeReq.url, true).query;
  return query && query.port || config.debugPort;
}

module.exports = Session;
