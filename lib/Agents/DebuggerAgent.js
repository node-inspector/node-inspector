// node-inspector version of on webkit-inspector/DebuggerAgent.cpp
var _injection = require.resolve('../Injections/DebuggerAgent.js');

var co = require('co');
var convert = require('../convert.js');
var path = require('path');

var inherits = require('util').inherits;
var BaseAgent = require('./BaseAgent.js');
var BreakEventHandler = require('./BreakEventHandler.js');

/**
 * @param {{saveLiveEdit,preload}} config
 * @param {FrontendClient} frontendClient
 * @param {DebuggerClient} debuggerClient
 * @param {ScriptManager} scriptManager
 * @param {InjectorClient} injectorClient
 * @constructor
 */
function DebuggerAgent(config, session) {
  BaseAgent.call(this, config, session);

  this._name = 'Debugger';

  this.breaker = new BreakEventHandler(config, session);

  this._saveLiveEdit = config.saveLiveEdit;
  this._stackTraceLimit = config.stackTraceLimit;
  this._breakpointsActive = true;

  this._enabled = false;
  this._frontendClient = session.frontendClient;
  this._debuggerClient = session.debuggerClient;
  this._scriptManager = session.scriptManager;
  this._injectorClient = session.injectorClient;

  this.registerCommand('evaluateOnCallFrame');
  this.registerCommand('getFunctionDetails');
  this.registerCommand('getBacktrace');
  this.registerCommand('pause');
  this.registerCommand('resume');
  this.registerCommand('stepInto');
  this.registerCommand('stepOver');
  this.registerCommand('stepOut');
  this.registerCommand('restartFrame');
  this.registerCommand('setVariableValue');

  this.registerCommand('enable', this.enable.bind(this));
  this.registerCommand('setPauseOnExceptions', this.setPauseOnExceptions.bind(this));
  this.registerCommand('setBreakpointByUrl', this.setBreakpointByUrl.bind(this));
  this.registerCommand('setBreakpoint', this.setBreakpoint.bind(this));
  this.registerCommand('removeBreakpoint', this.removeBreakpoint.bind(this));
  this.registerCommand('continueToLocation', this.continueToLocation.bind(this));
  this.registerCommand('setBreakpointsActive', this.setBreakpointsActive.bind(this));
  this.registerCommand('setSkipAllPauses', this.setSkipAllPauses.bind(this));
  this.registerCommand('setScriptSource', this.setScriptSource.bind(this));
  this.registerCommand('getScriptSource', this.getScriptSource.bind(this));

  this._ready = this._injection().then(() => {
    this._debuggerClient.on('break', (event) => this.breaker.handle(event));
    this._debuggerClient.on('exception', (event) => this.breaker.handle(event));
  });
}
inherits(DebuggerAgent, BaseAgent);

DebuggerAgent.prototype.enable = function(params) {
  return co(function * () {
    yield this._debuggerClient.ready();
    if (this._enabled) return;
    this._enabled = true;

    yield this._onDebuggerConnect();
  }.bind(this));
};

DebuggerAgent.prototype._onDebuggerConnect = function() {
  // Remove all existing breakpoints because:
  // 1) front-end inspector cannot restore breakpoints from debugger anyway
  // 2) all breakpoints were disabled when the previous debugger-client
  //    disconnected from the debugged application
  return co(function * () {
    //yield this._removeAllBreakpoints();
    yield this._reloadScripts();
    yield this._sendBacktraceIfPaused();
  }.bind(this));
};

DebuggerAgent.prototype._removeAllBreakpoints = function() {
  return co(function * () {
    var breakpoints = yield this._debuggerClient.request('listbreakpoints');

    return yield breakpoints.breakpoints.map(breakpoint =>
      this.removeBreakpoint({ breakpointId: breakpoint.number })
        .catch((error) => {
          this.notify('warning', 'Cannot remove old breakpoint %d. %s', breakpoint.number, error);
          return Promise.resolve();
        }));
  }.bind(this)).catch(error => {
    this.notify('warning', 'Cannot remove old breakpoints. %s', error);
    return Promise.resolve();
  });
};

DebuggerAgent.prototype._reloadScripts = function() {
  return co(function * () {
    this._scriptManager.reset();
    var scripts = yield this._debuggerClient.request('scripts', {includeSource: true, types: 4});
    yield scripts.map(script => this._scriptManager.add(script));
  }.bind(this));
};

DebuggerAgent.prototype._sendBacktraceIfPaused = function() {
  return co(function * () {
    if (yield this._debuggerClient.running()) return;

    var backtrace = yield this.handle('getBacktrace', {
      stackTraceLimit: this._stackTraceLimit
    });

    this.emitEvent('paused', {
      callFrames: backtrace,
      reason: 'other',
      hitBreakpoints: false
    });
  }.bind(this));
};

DebuggerAgent.prototype.getScriptSource = function(params) {
  return co(function * () {
    var source = yield this._scriptManager.source(params.scriptId);
    return { scriptSource: source };
  }.bind(this));
};

DebuggerAgent.prototype.setScriptSource = function(params) {
  return co(function * () {
    var script = this._scriptManager.get(params.scriptId);
    if (!script)
      throw new Error(`${ERROR} unknown script id ${scriptId}`);

    yield this.request('setScriptSource', params);

    if (!this._saveLiveEdit) return;

    var name = script.name;
    if (script.isInternalScript)
      return console.log(ERROR, `script "${name}" (${script.scriptId}) was not loaded from a file.`);

    try {
      yield this._scriptManager.save(name, source)
    } catch (error) { console.log(ERROR, error); }
  }.bind(this));
};

DebuggerAgent.prototype._warnLiveEditDisabled = function() {
  this._warnLiveEditDisabled = function() {};

  console.log('warning',
    'Saving of live-edit changes back to source files is disabled by configuration.\n' +
    'Change the option "saveLiveEdit" in config.json to enable this feature.');
};

DebuggerAgent.prototype.setPauseOnExceptions = function(params) {
  return co(function * () {
    return yield [
      { type: 'all', enabled: params.state == 'all' },
      { type: 'uncaught', enabled: params.state == 'uncaught' }
    ].map((args) => this._debuggerClient.request('setexceptionbreak', args));
  }.bind(this));
};

DebuggerAgent.prototype.setBreakpointByUrl = function(params) {
  return co(function * () {
    if (params.urlRegex !== undefined)
      throw('Error: setBreakpointByUrl using urlRegex is not implemented.');

    var script = this._scriptManager.find(params.url);
    var target = script.name;

    var result = yield this._debuggerClient.request('setbreakpoint', {
      enabled: this._breakpointsActive,
      type: 'script',
      target: target,
      line: params.lineNumber,
      column: params.columnNumber,
      condition: params.condition
    });

    return {
      breakpointId: result.breakpoint.toString(),
      locations: result.actual_locations.map(convert.v8LocationToInspectorLocation)
    }
  }.bind(this));
};

DebuggerAgent.prototype.setBreakpoint = function(params) {
  return co(function * () {
    var result = yield this._debuggerClient.request('setbreakpoint', {
      enabled: this._breakpointsActive,
      type: 'scriptId',
      target: params.location.scriptId,
      line: params.location.lineNumber,
      column: params.location.columnNumber,
      condition: params.condition
    });

    return {
      breakpointId: result.breakpoint.toString(),
      location: result.actual_locations.map(convert.v8LocationToInspectorLocation)[0]
    }
  }.bind(this));
};

DebuggerAgent.prototype.removeBreakpoint = function(params) {
  return co(function * () {
    yield this._debuggerClient.request('clearbreakpoint', {
      breakpoint: params.breakpointId
    });
  }.bind(this));
};

DebuggerAgent.prototype.continueToLocation = function(params) {
  return co(function * () {
    var result = yield this.setBreakpoint(params);
    yield this.breaker.setContinueToLocationBreakpointId(result.breakpointId);
    this.handle('resume');
  }.bind(this));
};

DebuggerAgent.prototype.setBreakpointsActive = function(params) {
  return co(function * () {
    this._breakpointsActive = params.active;
    var breakpoints = yield this._debuggerClient.request('listbreakpoints');

    yield breakpoints.breakpoints.map(breakpoint =>
      this._debuggerClient.request('changebreakpoint', {
        breakpoint: breakpoint.number,
        enabled: this._breakpointsActive
      }));
  }.bind(this));
};

DebuggerAgent.prototype.setSkipAllPauses = function(params) {
  this.breaker.setSkipAllPauses(params.skipped);
};

DebuggerAgent.prototype._injection = function() {
  var injection = function(require, debug, options) {
    require(options.injection)(require, debug, options);
  };
  var options = { injection: _injection, stackTraceLimit: this._stackTraceLimit };

  return this._injectorClient.injection(injection, options);
};

module.exports = DebuggerAgent;
module.exports.DebuggerAgent = DebuggerAgent;
