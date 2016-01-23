var EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits,
    DebuggerClient = require('./DebuggerClient').DebuggerClient,
    ScriptManager = require('./ScriptManager').ScriptManager,
    FrontendClient = require('./FrontendClient').FrontendClient,
    BreakEventHandler = require('./BreakEventHandler').BreakEventHandler,
    InjectorClient = require('./InjectorClient').InjectorClient;

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

  this._pingInterval = setInterval(function() {
    wsConnection.ping(null, null, true);
  }.bind(this), 1000);
  process.on('SIGINT', () => {
    this.close().then(() => process.exit(0));
  });
  process.on('SIGQUIT', () => {
    this.close().then(() => process.exit(0));
  });
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

module.exports = Session;
