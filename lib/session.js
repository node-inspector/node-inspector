'use strict';

var EventEmitter = require('events');
var inherits = require('util').inherits;
var DebuggerClient = require('./DebuggerClient');
var ScriptManager = require('./ScriptManager');
var ScriptFileStorage = require('./ScriptFileStorage');
var FrontendClient = require('./FrontendClient');
var BreakEventHandler = require('./BreakEventHandler');
var InjectorClient = require('./InjectorClient');

function Session(config, debuggerPort, wsConnection) {
  this.client = wsConnection;

  this.debuggerClient = new DebuggerClient(debuggerPort);
  this.frontendClient = new FrontendClient(config, this);
  this.injectorClient = new InjectorClient(config, this);
  this.scriptManager = new ScriptManager(config, this);
  this.scriptStorage = new ScriptFileStorage(config, this);
  this.breakEventHandler = new BreakEventHandler(config, this);

  this.frontendClient.on('close', this.close.bind(this));
  this.debuggerClient.on('close', this._onDebuggerClientClose.bind(this));
  this.debuggerClient.on('error', this._onDebuggerClientError.bind(this));

  process.on('SIGINT', () => {
    this.close().then(() => process.exit(0));
  });
  process.on('SIGQUIT', () => {
    this.close().then(() => process.exit(0));
  });
}

inherits(Session, EventEmitter);

Session.prototype.close = function() {
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

module.exports = Session;
