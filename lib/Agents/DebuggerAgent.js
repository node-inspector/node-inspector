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
  async.waterfall([
    // Remove all existing breakpoints because:
    // 1) front-end inspector cannot restore breakpoints from debugger anyway
    // 2) all breakpoints were disabled when the previous debugger-client
    //    disconnected from the debugged application
    // 3) Inject custom debugger commands in app
    // 4) If we started with --debug-brk we can't use custom debugger commands on first break.
    //    We need to reallocate debug context - restart frame and step into.
    this._removeAllBreakpoints.bind(this),
    this._reloadScripts.bind(this),
    //this._tryConnectInjector.bind(this),
    //this._restartFrameIfPaused.bind(this),
    this._sendBacktraceIfPaused.bind(this)
  ]);
};

DebuggerAgent.prototype._removeAllBreakpoints = function(done) {
  this._debuggerClient.request(
    'listbreakpoints',
    {},
    function(err, response) {
      if (err) {
        console.log('Warning: cannot remove old breakpoints. %s', err);
        done();
        return;
      }

      function removeOneBreakpoint(bp, next) {
        this._debuggerClient.clearBreakpoint(
          bp.number,
          function(error) {
            if (error)
              console.log(
                'Warning: cannot remove old breakpoint %d. %s',
                bp.number,
                error
              );
            next();
          }
        );
      }

      async.eachSeries(
        response.breakpoints,
        removeOneBreakpoint.bind(this),
        done
      );
    }.bind(this)
  );
};

DebuggerAgent.prototype._reloadScripts = function(done) {
  this._scriptManager.reset();
  this._debuggerClient.request(
    'scripts',
    {
      includeSource: true,
      types: 4
    },
    function handleScriptsResponse(err, result) {
      if (err) {
        done(err);
        return;
      }

      result.forEach(function(script) {
        this._scriptManager.addScript(script);
      }, this);
      done();
    }.bind(this)
  );
};

DebuggerAgent.prototype._tryConnectInjector = function(done) {
  this._injectorClient.inject(done);
};

DebuggerAgent.prototype._restartFrameIfPaused = function(done) {
  if (this._debuggerClient.isRunning) return done();

  this.restartFrame({ callFrameId: 0 }, function(error, result) {
    if (error) return done(error);

    result = result.result || result;
    if (result.stack_update_needs_step_in)
      this._stepInto({}, done);
    else
      done(error);
  }.bind(this));
};

DebuggerAgent.prototype._sendBacktraceIfPaused = function(done) {
  if (!this._debuggerClient.isRunning) {
    this._breakEventHandler.sendBacktraceToFrontend(null);
  }
  done();
};

DebuggerAgent.prototype.pause = function(params) {
  return new Promise((resolve, reject) => {
    function done(error, result) {
      return (error ? reject : resolve)(error || result);
    }

    this._debuggerClient.request('suspend', {}, function(error, result) {
      done(error);
      if (!error) {
        this._breakEventHandler.sendBacktraceToFrontend(null);
      }
    }.bind(this));
  });
};

DebuggerAgent.prototype._stepInto = function(params, done) {
  this._debuggerClient.request('continue', { stepaction: 'in' }, function(error, result) {
    done(error);
    if (!error)
      this._frontendClient.emitEvent('Debugger.resumed');
  }.bind(this));
};

DebuggerAgent.prototype.continueToLocation = function(params) {
  return new Promise((resolve, reject) => {
    function done(error, result) {
      return (error ? reject : resolve)(error || result);
    }

    var requestParams = {
      type: 'scriptId',
      target: convert.inspectorScriptIdToV8Id(params.location.scriptId),
      line: params.location.lineNumber,
      column: params.location.columnNumber
    };

    this._debuggerClient.request('setbreakpoint', requestParams, function(error, response) {
      if (error != null) {
        done(error);
        return;
      }

      this._breakEventHandler.
        continueToLocationBreakpointId = response.breakpoint;

      this._debuggerClient.request('continue', undefined, function(error, response) {
        done(error);
      });
    }.bind(this));
  });
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
  return new Promise((resolve, reject) => {
    function done(error, result) {
      return (error ? reject : resolve)(error || result);
    }

    this._debuggerClient.request(
      'changelive',
      {
        script_id: convert.inspectorScriptIdToV8Id(params.scriptId),
        new_source: params.scriptSource,
        preview_only: false
      },
      function(err, response) {
        this._handleChangeLiveOrRestartFrameResponse(done, err, response);
        this._persistScriptChanges(params.scriptId, params.scriptSource);
      }.bind(this)
    );
  });
};

DebuggerAgent.prototype._handleChangeLiveOrRestartFrameResponse = function(done, err, response) {
  if (err) {
    done(err);
    return;
  }

  var frontendClient = this._frontendClient;
  var breakEventHandler = this._breakEventHandler;

  function sendResponse(callframes) {
    done(
      null,
      {
        callFrames: callframes || [],
        result: response.result
      }
    );
  }

  function sendResponseWithCallStack() {
    breakEventHandler.fetchCallFrames(function(err, response) {
      var callframes = [];
      if (err) {
        frontendClient.sendLogToConsole(
          'error',
          'Cannot update stack trace after a script changed: ' + err);
      } else {
        callframes = response;
      }
      sendResponse(callframes);
    });
  }

  var result = response.result;
  if (result.stack_modified && !result.stack_update_needs_step_in)
    sendResponseWithCallStack();
  else
    sendResponse();
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
  return new Promise((resolve, reject) => {
    function done(error, result) {
      return (error ? reject : resolve)(error || result);
    }

    var args = [
      { type: 'all', enabled: params.state == 'all' },
      { type: 'uncaught', enabled: params.state == 'uncaught' }
    ];

    async.eachSeries(
      args,
      function(arg, next) {
        this._debuggerClient.request('setexceptionbreak', arg, next);
      }.bind(this),
      done);
  });
};

DebuggerAgent.prototype.setBreakpointByUrl = function(params) {
  return new Promise((resolve, reject) => {
    function done(error, result) {
      return (error ? reject : resolve)(error || result);
    }

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

    this._debuggerClient.request('setbreakpoint', requestParams, function(error, response) {
      if (error != null) {
        done(error);
        return;
      }

      done(null, {
        breakpointId: response.breakpoint.toString(),
        locations: response.actual_locations.map(convert.v8LocationToInspectorLocation)
      });
    });
  });
};

DebuggerAgent.prototype.removeBreakpoint = function(params) {
  return new Promise((resolve, reject) => {
    function done(error, result) {
      return (error ? reject : resolve)(error || result);
    }

    this._debuggerClient.clearBreakpoint(
      params.breakpointId,
      function(error, response) {
        done(error, null);
      }
    );
  });
};

DebuggerAgent.prototype.setBreakpointsActive = function(params) {
  return new Promise((resolve, reject) => {
    function done(error, result) {
      return (error ? reject : resolve)(error || result);
    }

    this._debuggerClient.request('listbreakpoints', {}, function(error, response) {
      if (error) {
        done(error);
        return;
      }

      function setBreakpointState(bp, next) {
        var req = { breakpoint: bp.number, enabled: params.active };
        this._debuggerClient.request('changebreakpoint', req, next);
      }

      async.eachSeries(response.breakpoints, setBreakpointState.bind(this), done);
    }.bind(this));
  });
};

DebuggerAgent.prototype.restartFrame = function(params) {
  return new Promise((resolve, reject) => {
    function done(error, result) {
      return (error ? reject : resolve)(error || result);
    }

    this._debuggerClient.request(
      'restartframe',
      {
        frame: Number(params.callFrameId)
      },
      this._handleChangeLiveOrRestartFrameResponse.bind(this, done)
    );
  });
};

DebuggerAgent.prototype.setSkipAllPauses = function(params) {
  return new Promise((resolve, reject) => {
    function done(error, result) {
      return (error ? reject : resolve)(error || result);
    }

    if (params.skipped)
      done(new Error('Not implemented.'));
    else
      done();
  });
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

  return new Promise((resolve, reject) => this._injectorClient.injection(
    injection,
    options,
    (error, result) => (error ? reject : resolve)(error && error.message || error)
  ));
};

module.exports = DebuggerAgent;
module.exports.DebuggerAgent = DebuggerAgent;
