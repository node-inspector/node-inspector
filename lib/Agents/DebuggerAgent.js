// node-inspector version of on webkit-inspector/DebuggerAgent.cpp
var _injection = require.resolve('../Injections/DebuggerAgent.js');

var co = require('co');
var convert = require('../convert.js');
var path = require('path');

var inherits = require('util').inherits;
var BaseAgent = require('./BaseAgent.js');

/**
 * @param {{saveLiveEdit,preload}} config
 * @param {FrontendClient} frontendClient
 * @param {DebuggerClient} debuggerClient
 * @param {BreakEventHandler} breakEventHandler
 * @param {ScriptManager} scriptManager
 * @param {InjectorClient} injectorClient
 * @constructor
 */
function DebuggerAgent(config, session) {
  BaseAgent.call(this, config, session);

  this._name = 'Debugger';
  this._injectorClient = session.injectorClient;

  this._saveLiveEdit = config.saveLiveEdit;
  this._stackTraceLimit = config.stackTraceLimit;
  this._breakpointsActive = true;

  this._enabled = false;
  this._frontendClient = session.frontendClient;
  this._debuggerClient = session.debuggerClient;
  this._breakEventHandler = session.breakEventHandler;
  this._scriptManager = session.scriptManager;
  this._injectorClient = session.injectorClient;
  this._scriptStorage = session.scriptStorage;

  this.registerCommand('evaluateOnCallFrame');
  this.registerCommand('getFunctionDetails');
  this.registerCommand('getBacktrace');
  this.registerCommand('pause');
  this.registerCommand('resume');
  this.registerCommand('stepInto');
  this.registerCommand('stepOver');
  this.registerCommand('stepOut');
  this.registerCommand('restartFrame');

  this.registerCommand('enable', this.enable.bind(this));
  this.registerCommand('setPauseOnExceptions', this.setPauseOnExceptions.bind(this));
  this.registerCommand('setBreakpointByUrl', this.setBreakpointByUrl.bind(this));
  this.registerCommand('setBreakpoint', this.setBreakpoint.bind(this));
  this.registerCommand('removeBreakpoint', this.removeBreakpoint.bind(this));
  this.registerCommand('continueToLocation', this.continueToLocation.bind(this));
  this.registerCommand('setBreakpointsActive', this.setBreakpointsActive.bind(this));
  this.registerCommand('setSkipAllPauses', this.setSkipAllPauses.bind(this));

  this.registerCommand('setVariableValue');
  this.registerCommand('getScriptSource', this.getScriptSource.bind(this));
  this.registerCommand('setScriptSource', this.setScriptSource.bind(this));

  this._ready = this._injection();
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
    scripts.forEach(script => this._scriptManager.addScript(script));
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
    var source = yield this._scriptManager.getScriptSourceById(Number(params.scriptId));
    return { scriptSource: source };
  }.bind(this));
};

DebuggerAgent.prototype.setScriptSource = function(params) {
  return co(function * () {
    var requestParams = {
      script_id: params.scriptId,
      new_source: params.scriptSource,
      preview_only: params.preview
    };

    try {
      var result = yield this._debuggerClient.request('changelive', requestParams);
    } catch (e) {
      console.log(e);
    }
    console.log(result);

    if (!params.preview)
      this._persistScriptChanges(params.scriptId, params.scriptSource);

    return yield {
      callFrames: yield this._handleChangeLive(result),
      result: result.result
    };
  }.bind(this));
};

DebuggerAgent.prototype._handleChangeLive = function(result) {
  return co(function * () {
    var stack;
    var _result = result.result;

    if (_result.stack_modified && !_result.stack_update_needs_step_in)
      stack = yield this.handle('getBacktrace').catch(() => null);

    return stack || [];
  });
};

DebuggerAgent.prototype._persistScriptChanges = function(scriptId, newSource) {
  var ERROR = 'Cannot save changes to disk:';

  if (!this._saveLiveEdit)
    return this.notify('warning', ERROR +
      'Saving of live-edit changes back to source files is disabled by configuration.\n' +
      'Change the option "saveLiveEdit" in config.json to enable this feature.');

  var script = this._scriptManager.findScriptByID(scriptId);
  if (!script)
    return this.notify('warning', `${ERROR} unknown script id ${scriptId}`);

  var name = script.v8name;
  if (script.internal) {
    debug(`${ERROR} script id ${scriptId} "${name}" was not loaded from a file.`);
    return;
  }

  return this._scriptStorage.save(name, newSource)
    .catch(error => this.notify('warning', `${ERROR} %s`, error));
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

    var target = convert.inspectorUrlToV8Name(params.url,
      this._scriptManager.normalizeName.bind(this._scriptManager));

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
    yield this._breakEventHandler.clearContinueToLocationBreakpoint();
    var result = yield this.setBreakpoint(params);
    this._breakEventHandler.setContinueToLocationBreakpointId(result.breakpointId);
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
  this._breakEventHandler.setSkipAllPauses(params.skipped);
};

/*
DebuggerAgent.prototype = {
    setVariableValue: function(params, done) {
      var version = this._debuggerClient.target.nodeVersion;
      if (!DebuggerAgent.nodeVersionHasSetVariableValue(version)) {
        done(
          'V8 engine in node version ' + version +
          ' does not support setting variable value from debugger.\n' +
          ' Please upgrade to version v0.10.12 (stable) or v0.11.2 (unstable)' +
          ' or newer.');
      } else {
        this._doSetVariableValue(params, done);
      }
    },

    _doSetVariableValue: function(params, done) {
      var value = convert.inspectorValueToV8Value(params.newValue);

      this._debuggerClient.request(
        'setVariableValue',
        {
          name: params.variableName,
          scope: {
            number: Number(params.scopeNumber),
            frameNumber: Number(params.callFrameId)
          },
          newValue: value
        },
        function(err, result) {
          done(err, result);
        }
      );
    }
};
*/


DebuggerAgent.prototype._injection = function() {
  var injection = function(require, debug, options) {
    require(options.injection)(require, debug, options);
  };
  var options = { injection: _injection, stackTraceLimit: this._stackTraceLimit };

  return this._injectorClient.injection(injection, options);
};

module.exports = DebuggerAgent;
module.exports.DebuggerAgent = DebuggerAgent;
