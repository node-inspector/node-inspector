// node-inspector version of on webkit-inspector/DebuggerAgent.cpp

var convert = require('./convert.js'),
  format = require('util').format,
  path = require('path'),
  async = require('async'),
  ScriptFileStorage = require('./ScriptFileStorage').ScriptFileStorage;

/**
 * @param {{saveLiveEdit,isScriptHidden}} config
 * @param {FrontendClient} frontendClient
 * @param {DebuggerClient} debuggerClient
 * @param {BreakEventHandler} breakEventHandler
 * @param {ScriptManager} scriptManager
 * @constructor
 */
function DebuggerAgent(config,
                       frontendClient,
                       debuggerClient,
                       breakEventHandler,
                       scriptManager) {
  this._saveLiveEdit = config.saveLiveEdit;
  this._frontendClient = frontendClient;
  this._debuggerClient = debuggerClient;
  this._breakEventHandler = breakEventHandler;
  this._scriptManager = scriptManager;
  this._scriptStorage = new ScriptFileStorage(config);
}

DebuggerAgent.prototype = {
  canSetScriptSource: function(params, done) {
    done(null, { result: true });
  },

  enable: function(params, done) {
    this._debuggerClient.on(
      'connect',
      function() {
        done();
        this._onDebuggerConnect();
      }.bind(this)
    );

    this._debuggerClient.connect();
  },

  _onDebuggerConnect: function() {
    async.waterfall([
      // Remove all existing breakpoints because:
      // 1) front-end inspector cannot restore breakpoints from debugger anyway
      // 2) all breakpoints were disabled when the previous debugger-client
      //    disconnected from the debugged application
      this._removeAllBreakpoints.bind(this),
      this._reloadScripts.bind(this),
      this._sendBacktraceIfPaused.bind(this)
    ]);
  },

  _removeAllBreakpoints: function(done) {
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
  },

  _reloadScripts: function(done) {
    this._scriptManager.reset();
    this._debuggerClient.request(
      'scripts',
      {
        includeSource: false,
        types: 4
      },
      function handleScriptsResponse(err, result) {
        if (err) {
          done(err);
          return;
        }

        result.forEach(this._scriptManager.addScript.bind(this._scriptManager));
        done();
      }.bind(this)
    );
  },

  _sendBacktraceIfPaused: function(done) {
    if (!this._debuggerClient.isRunning) {
      this._breakEventHandler.sendBacktraceToFrontend(null);
    }
    done();
  },

  disable: function(params, done) {
    this._debuggerClient.close();
    done();
  },

  resume: function(params, done) {
    this._sendContinue(undefined, done);
  },

  _sendContinue: function(stepAction, done) {
    var args = stepAction ? { stepaction: stepAction } : undefined;
    this._debuggerClient.request('continue', args, function(error, result) {
      done(error);
      if (!error)
        this._frontendClient.sendEvent('Debugger.resumed');
    }.bind(this));
  },

  pause: function(params, done) {
    this._debuggerClient.request('suspend', {}, function(error, result) {
      done(error);
      if (!error) {
        this._breakEventHandler.sendBacktraceToFrontend(null);
      }
    }.bind(this));
  },

  stepOver: function(params, done) {
    this._sendContinue('next', done);
  },

  stepInto: function(params, done) {
    this._sendContinue('in', done);
  },

  stepOut: function(params, done) {
    this._sendContinue('out', done);
  },

  continueToLocation: function(params, done) {
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
  },

  getScriptSource: function(params, done) {
    this._debuggerClient.getScriptSourceById(
      Number(params.scriptId),
      function(err, source) {
        if (err) return done(err);
        return done(null, { scriptSource: source });
      }
    );
  },

  setScriptSource: function(params, done) {
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
  },

  _handleChangeLiveOrRestartFrameResponse: function(done, err, response) {
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
  },

  _persistScriptChanges: function(scriptId, newSource) {
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
  },

  _warn: function() {
    this._frontendClient.sendLogToConsole(
      'warning',
      format.apply(this, arguments)
    );
  },

  setPauseOnExceptions: function(params, done) {
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
  },

  setBreakpointByUrl: function(params, done) {
    if (params.urlRegex !== undefined) {
      // DevTools protocol defines urlRegex parameter,
      // but the parameter is not used by the front-end.
      done('Error: setBreakpointByUrl using urlRegex is not implemented.');
      return;
    }

    var requestParams = {
      type: 'script',
      target: convert.inspectorUrlToV8Name(params.url),
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
  },

  removeBreakpoint: function(params, done) {
    this._debuggerClient.clearBreakpoint(
      params.breakpointId,
      function(error, response) {
        done(error, null);
      }
    );
  },

  setBreakpointsActive: function(params, done) {
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
  },

  setOverlayMessage: function(params, done) {
    done();
  },

  evaluateOnCallFrame: function(params, done) {
    var self = this;
    var expression = params.expression;
    var frame = Number(params.callFrameId);

    self._debuggerClient.request(
      'evaluate',
      {
        expression: params.expression,
        frame: frame
      },
      function(err, result) {
        // Errors from V8 are actually just messages, so we need to fill them out a bit.
        if (err) {
          err = convert.v8ErrorToInspectorError(err);
        }

        done(null, {
          result: err || convert.v8ResultToInspectorResult(result),
          wasThrown: !!err
        });
      }
    );
  },

  getFunctionDetails: function(params, done) {
    var handle = params.functionId;
    this._debuggerClient.request(
      'lookup',
      {
        handles: [handle],
        includeSource: false
      },
      function(error, responseBody) {
        if (error) {
          done(error);
        } else {
          done(null, convert.v8FunctionLookupToFunctionDetails(responseBody[handle]));
        }
      }.bind(this));
  },

  restartFrame: function(params, done) {
    this._debuggerClient.request(
      'restartframe',
      {
        frame: Number(params.callFrameId)
      },
      this._handleChangeLiveOrRestartFrameResponse.bind(this, done)
    );
  },

  setVariableValue: function(params, done) {
    this._debuggerClient.evaluateGlobal('process.version', function(err, version) {
      if (!DebuggerAgent.nodeVersionHasSetVariableValue(version)) {
        done(
          'V8 engine in node version ' + version +
          ' does not support setting variable value from debugger.\n' +
          ' Please upgrade to version v0.10.12 (stable) or v0.11.2 (unstable)' +
          ' or newer.');
      } else {
        this._doSetVariableValue(params, done);
      }
    }.bind(this));
  },

  _doSetVariableValue: function(params, done) {
    var value = params.newValue;
    if (value.value === undefined && value.objectId === undefined)
      value.type = 'undefined';

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

DebuggerAgent.nodeVersionHasSetVariableValue = function(version) {
  var match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  return match[1] > 0 || // v1+
    (match[2] == 10 && match[3] >= 12) || // v0.10.12+
    (match[2] == 11 && match[3] >= 2) ||  // v0.11.2+
    (match[2] >= 12); // v0.12+
};

exports.DebuggerAgent = DebuggerAgent;
