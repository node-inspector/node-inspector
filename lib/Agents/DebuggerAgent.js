// node-inspector version of on webkit-inspector/DebuggerAgent.cpp
var _injection = require.resolve('../Injections/DebuggerAgent.js');

var convert = require('../convert.js'),
  semver = require('semver'),
  format = require('util').format,
  path = require('path'),
  async = require('async'),
  ScriptFileStorage = require('../ScriptFileStorage').ScriptFileStorage;

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
  this._inject = true;
  this._injectorClient = session.injectorClient;

  this._enabled = false;
  this._saveLiveEdit = config.saveLiveEdit;
  this._frontendClient = session.frontendClient;
  this._debuggerClient = session.debuggerClient;
  this._breakEventHandler = session.breakEventHandler;
  this._scriptManager = session.scriptManager;
  this._injectorClient = session.injectorClient;
  this._scriptStorage = new ScriptFileStorage(config, session);

  this.registerCommand('evaluateOnCallFrame');
  this.registerCommand('getFunctionDetails');
  this.registerCommand('getBacktrace');
  this.registerCommand('resume');
  this.registerCommand('stepInto');
  this.registerCommand('stepOver');
  this.registerCommand('stepOut');
  this.registerCommand('setVariableValue');

  this.registerCommand('enable', this.enable.bind(this));
  this.registerCommand('pause', this.pause.bind(this));
  this.registerCommand('continueToLocation', this.continueToLocation.bind(this));
  this.registerCommand('getScriptSource', this.getScriptSource.bind(this));
  this.registerCommand('setScriptSource', this.setScriptSource.bind(this));
  this.registerCommand('setPauseOnExceptions', this.setPauseOnExceptions.bind(this));
  this.registerCommand('setBreakpointByUrl', this.setBreakpointByUrl.bind(this));
  this.registerCommand('removeBreakpoint', this.removeBreakpoint.bind(this));
  this.registerCommand('setBreakpointsActive', this.setBreakpointsActive.bind(this));
  this.registerCommand('restartFrame', this.restartFrame.bind(this));
  this.registerCommand('setSkipAllPauses', this.setSkipAllPauses.bind(this));

  this._ready = this._injection();
}
inherits(DebuggerAgent, BaseAgent);

DebuggerAgent.prototype.enable = function(params) {
  return new Promise((resolve, reject) => {
    function done(error, result) {
      return (error ? reject : resolve)(error || result);
    }

    var onConnect = function() {
      done();

      if (this._enabled) return;
      this._enabled = true;

      this._onDebuggerConnect();
    }.bind(this);

    if (this._debuggerClient.isReady) {
      process.nextTick(onConnect);
    } else {
      this._debuggerClient.on('connect', onConnect);
    }
  });
};

DebuggerAgent.prototype._onDebuggerConnect = function() {
  // Remove all existing breakpoints because:
  // 1) front-end inspector cannot restore breakpoints from debugger anyway
  // 2) all breakpoints were disabled when the previous debugger-client
  //    disconnected from the debugged application
  return co(function * () {
    yield this._removeAllBreakpoints();
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
          console.log('Warning: cannot remove old breakpoint %d. %s', breakpoint.number, error);
          return Promise.resolve();
        }));
  }.bind(this)).catch(error => {
    console.log('Warning: cannot remove old breakpoints. %s', error);
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
    if (yield this._debuggerClient.runnign()) return;
    this._breakEventHandler.sendBacktraceToFrontend();
  });
};

DebuggerAgent.prototype.pause = function(params) {
  return this._debuggerClient.request('suspend')
    .then(() => this._breakEventHandler.sendBacktraceToFrontend())
};

DebuggerAgent.prototype.continueToLocation = function(params) {
  var requestParams = {
    type: 'scriptId',
    target: convert.inspectorScriptIdToV8Id(params.location.scriptId),
    line: params.location.lineNumber,
    column: params.location.columnNumber
  };

  return this._debuggerClient.request('setbreakpoint', requestParams)
    .then(result => this._breakEventHandler.continueToLocationBreakpointId = response.breakpoint)
    .then(() => this._debuggerClient.request('continue'))
};

DebuggerAgent.prototype.getScriptSource = function(params) {
  return new Promise((resolve, reject) => {
    function done(error, result) {
      return (error ? reject : resolve)(error || result);
    }

    this._scriptManager.getScriptSourceById(
      Number(params.scriptId),
      function(err, source) {
        if (err) return done(err);
        return done(null, { scriptSource: source });
      }
    );
  });
};

DebuggerAgent.prototype.setScriptSource = function(params) {
  return co(function * () {
    var requestParams = {
      script_id: convert.inspectorScriptIdToV8Id(params.scriptId),
      new_source: params.scriptSource,
      preview_only: false
    };

    var result = yield this._debuggerClient.request('changelive', requestParams);

    this._persistScriptChanges(params.scriptId, params.scriptSource)
    return yield {
      callFrames: this._handleChangeLiveOrRestartFrameResponse(result),
      result: response.result
    };
  }.bind(this));
};

DebuggerAgent.prototype._handleChangeLiveOrRestartFrameResponse = function(result) {
  var _result = result.result;
  if (_result.stack_modified && !_result.stack_update_needs_step_in)
    return this.getBacktrace().catch(() => Promise.resolve([]));
  else
    return Promise.resolve([]);
};

DebuggerAgent.prototype._persistScriptChanges = function(scriptId, newSource) {
  if (!this._saveLiveEdit) {
    this._warn(
      'Saving of live-edit changes back to source files is disabled by configuration.\n' +
        'Change the option "saveLiveEdit" in config.json to enable this feature.'
    );
    return;
  }

  var source = this._scriptManager.findScriptByID(scriptId);
  if (!source) {
    this._warn('Cannot save changes to disk: unknown script id %s', scriptId);
    return;
  }

  var scriptFile = source.v8name;
  if (!scriptFile || scriptFile.indexOf(path.sep) == -1) {
    this._warn(
      'Cannot save changes to disk: script id %s "%s" was not loaded from a file.',
      scriptId,
      scriptFile || 'null'
    );
    return;
  }

  this._scriptStorage.save(scriptFile, newSource, function(err) {
    if (err) {
      this._warn('Cannot save changes to disk. %s', err);
    }
  }.bind(this));
};

DebuggerAgent.prototype._warn = function() {
  this._frontendClient.sendLogToConsole(
    'warning',
    format.apply(this, arguments)
  );
};

DebuggerAgent.prototype.setPauseOnExceptions = function(params) {
  return co(function * () {
    return yield [
      { type: 'all', enabled: params.state == 'all' },
      { type: 'uncaught', enabled: params.state == 'uncaught' }
    ].map((args) => this._debuggerClient.request('setexceptionbreak', args))
  }.bind(this));
};

DebuggerAgent.prototype.setBreakpointByUrl = function(params) {
  if (params.urlRegex !== undefined) {
    // DevTools protocol defines urlRegex parameter,
    // but the parameter is not used by the front-end.
    done('Error: setBreakpointByUrl using urlRegex is not implemented.');
    return;
  }

  var target = convert.inspectorUrlToV8Name(params.url,
    this._scriptManager.normalizeName.bind(this._scriptManager));

  var requestParams = {
    type: 'script',
    target: target,
    line: params.lineNumber,
    column: params.columnNumber,
    condition: params.condition
  };

  return this._debuggerClient.request('setbreakpoint', requestParams)
    .then(result => ({
      breakpointId: result.breakpoint.toString(),
      locations: result.actual_locations.map(convert.v8LocationToInspectorLocation)
    }))
};

DebuggerAgent.prototype.removeBreakpoint = function(params) {
  return this._debuggerClient.request('clearbreakpoint', { breakpoint: params.breakpointId });
};

DebuggerAgent.prototype.setBreakpointsActive = function(params) {
  return co(function * () {
    var breakpoints = yield this._debuggerClient.request('listbreakpoints');

    return yield breakpoints.breakpoints.map(breakpoint =>
      this._debuggerClient.request('changebreakpoint', {
        breakpoint: breakpoint.number,
        enabled: params.active
      }));
  }.bind(this));
};

DebuggerAgent.prototype.restartFrame = function(params) {
  return this._debuggerClient.request('restartframe', { frame: +params.callFrameId })
    .then(result => this._handleChangeLiveOrRestartFrameResponse(result))
};

DebuggerAgent.prototype.setSkipAllPauses = function(params) {
  if (params.skipped)
    return Promise.reject(new Error('Not implemented.'));
  else
    return Promise.resolve();
}

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
  var options = { injection: _injection };

  return this._injectorClient.injection(injection, options);
};

module.exports = DebuggerAgent;
module.exports.DebuggerAgent = DebuggerAgent;
