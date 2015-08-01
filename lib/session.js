var EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits,
    DebuggerClient = require('./DebuggerClient').DebuggerClient,
    ScriptManager = require('./ScriptManager').ScriptManager,
    FrontendClient = require('./FrontendClient').FrontendClient,
    FrontendCommandHandler = require('./FrontendCommandHandler').FrontendCommandHandler,
    BreakEventHandler = require('./BreakEventHandler').BreakEventHandler,
    ConsoleClient = require('./ConsoleClient').ConsoleClient,
    HeapProfilerClient = require('./HeapProfilerClient').HeapProfilerClient,
    InjectorClient = require('./InjectorClient').InjectorClient;

function Session(config, debuggerPort, wsConnection) {
  this.debuggerClient = new DebuggerClient(debuggerPort);
  this.frontendClient = new FrontendClient(wsConnection);
  this.injectorClient = new InjectorClient(config, this);
  this.consoleClient = new ConsoleClient(config, this);
  this.heapProfilerClient = new HeapProfilerClient(config, this);
  this.scriptManager = new ScriptManager(config, this);
  this.breakEventHandler = new BreakEventHandler(config, this);
  this.frontendCommandHandler = new FrontendCommandHandler(config, this);

  this.resourceTreeResolved = false;
  this.once('resource-tree-resolved', function() {
    this.resourceTreeResolved = true;
  }.bind(this));

  this.frontendClient.on('close', this.close.bind(this));
  this.debuggerClient.on('close', this._onDebuggerClientClose.bind(this));
  this.debuggerClient.on('error', this._onDebuggerClientError.bind(this));
  this.injectorClient.on('error', this._onInjectorClientError.bind(this));
}

inherits(Session, EventEmitter);

Session.prototype.close = function() {
  if (this.debuggerClient.isConnected)
    this.debuggerClient.close();
  else
    this.emit('close');
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

Session.prototype._onInjectorClientError = function(e) {
  var err = e.toString();
  this.frontendClient.sendLogToConsole('error', err);
};

module.exports = Session;
