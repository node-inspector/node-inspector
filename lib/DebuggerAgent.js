// node-inspector version of on webkit-inspector/DebuggerAgent.cpp

var convert = require('./convert.js'),
  semver = require('semver'),
  format = require('util').format,
  path = require('path'),
  async = require('async'),
  ScriptFileStorage = require('./ScriptFileStorage').ScriptFileStorage;

/**
 * @param {{saveLiveEdit,preload}} config
 * @param {FrontendClient} frontendClient
 * @param {DebuggerClient} debuggerClient
 * @param {BreakEventHandler} breakEventHandler
 * @param {ScriptManager} scriptManager
 * @param {InjectorClient} injectorClient
 * @constructor
 */
function DebuggerAgent(config,
                       frontendClient,
                       debuggerClient,
                       breakEventHandler,
                       scriptManager,
                       injectorClient) {
  this._noInject = config.inject === false;
  this._injected = false;
  this._saveLiveEdit = config.saveLiveEdit;
  this._frontendClient = frontendClient;
  this._debuggerClient = debuggerClient;
  this._breakEventHandler = breakEventHandler;
  this._scriptManager = scriptManager;
  this._injectorClient = injectorClient;
  this._scriptStorage = new ScriptFileStorage(config);
  
  this._translateCommandToInjection(
    'getBacktrace',
    'getFunctionDetails',
    'evaluateOnCallFrame');
    
  if (!this._noInject) this._injectorClient.on('inject', this._inject.bind(this));
}

/**
 * @param {...string} commandNames
*/

DebuggerAgent.prototype = {
  _translateCommandToInjection: function(commandNames) {
    Array.prototype.forEach.call(arguments, function(command) {
      this[command] = function(params, done) {
        this._debuggerClient.request('Debugger.' + command, params, done);
      };
    }, this);
  },
  
  _inject: function(injected) {
    if (!injected) return;

    this._injectorClient.injection(
      this.injection,
      {
        'protocol': require('../tools/protocol.json')
      },
      function(error, result) {
        this._injected = !error;
        
        if (error) this._frontendClient.sendLogToConsole('error', error.message || error);
      }.bind(this)
    );
  },

  canSetScriptSource: function(params, done) {
    done(null, { result: true });
  },

  enable: function(params, done) {
    var onConnect = function() {
      done();
      this._onDebuggerConnect();
    }.bind(this);

    if (this._debuggerClient.isConnected) {
      process.nextTick(onConnect);
    } else {
      this._debuggerClient.on('connect', onConnect);
      this._debuggerClient.connect();
    }
  },

  _onDebuggerConnect: function() {
    async.waterfall([
      // Remove all existing breakpoints because:
      // 1) front-end inspector cannot restore breakpoints from debugger anyway
      // 2) all breakpoints were disabled when the previous debugger-client
      //    disconnected from the debugged application
      this._removeAllBreakpoints.bind(this),
      this._reloadScripts.bind(this),
      this._sendBacktraceIfPaused.bind(this),
      this._tryConnectInjector.bind(this)
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
        includeSource: true,
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

  _tryConnectInjector: function(done) {
    this._injectorClient.once('inject', function() {
      var cb = done;
      done = function(){};
      cb();
    });
    this._injectorClient.once('error', function(err) {
      var cb = done;
      done = function(){};
      cb(err);
    });
    this._injectorClient.inject();
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
    var version = this._debuggerClient.targetNodeVersion;
    if (!DebuggerAgent.nodeVersionHasSetVariableValue(version)) {
      done(
        'V8 engine in node version ' + version +
        ' does not support setting variable value from debugger.\n' +
        ' Please upgrade to version v0.10.12 (stable) or v0.11.2 (unstable)' +
        ' or newer.');
    } else {
      this._debuggerClient.request('Debugger.setVariableValue', params, done);
    }
  },

  setSkipAllPauses: function(params, done) {
    if (params.skipped)
      done(new Error('Not implemented.'));
    else
      done();
  }
};

DebuggerAgent.nodeVersionHasSetVariableValue = function(version) {
  return semver.satisfies(version, '~0.10.12 || ~0.11.2 || >=0.12');
};

DebuggerAgent.prototype.injection = function(require, debug, options) {
  var DebuggerProtocol = options.protocol.domains.filter(function(domain) {
    return domain.domain == 'Debugger';
  })[0];
  var DebuggerParameters = {};
  DebuggerProtocol.commands.forEach(function(command) {
    DebuggerParameters[command.name] = (command.parameters || []).map(function(parameter) {
      return parameter.name;
    });
  });
  
  debug.registerAgentCommand(
    'Debugger.getBacktrace', 
    ['stackTraceLimit'], 
    function(args, response, injectedScript, DebuggerScript) {
      if (this.running) return;
    
      var currentCallStack = wrapCallFrames(this.exec_state_, args[0], 3, DebuggerScript);
      var callFrames = injectedScript.wrapCallFrames(currentCallStack);
      //var asyncStackTrace = ...

      response.body = callFrames;
    }
  );
  
  debug.registerAgentCommand(
    'Debugger.getFunctionDetails', 
    DebuggerParameters.getFunctionDetails, 
    function(args, response, injectedScript, DebuggerScript) {
      var details = injectedScript.getFunctionDetails.apply(injectedScript, args);
      response.body = { details: details };
    }
  );
  
  debug.registerAgentCommand(
    'Debugger.evaluateOnCallFrame', 
    DebuggerParameters.evaluateOnCallFrame, 
    function(args, response, injectedScript, DebuggerScript) {
      var execState = this.exec_state_;
      var maximumLimit = execState.frameCount();
      args.unshift(wrapCallFrames(execState, maximumLimit, 3, DebuggerScript));
      
      response.body = injectedScript.evaluateOnCallFrame.apply(injectedScript, args);
    }
  );
  
  debug.registerAgentCommand(
    'Debugger.setVariableValue', 
    DebuggerParameters.setVariableValue, 
    function(args, response, injectedScript, DebuggerScript) {
      var execState = this.exec_state_;
      var maximumLimit = execState.frameCount();
      args.unshift(wrapCallFrames(execState, maximumLimit, 3, DebuggerScript));
      //Fix inconsistency of protocol (newValue described as object, but injectedScript waits string)
      args[5] = JSON.stringify(args[5]);
      response.body = injectedScript.setVariableValue.apply(injectedScript, args);
    }
  );
  

  function wrapCallFrames(execState, maximumLimit, scopeDetails, DebuggerScript) {
    var scopeBits = 2;

    if (maximumLimit < 0) throw new Error('Incorrect stack trace limit.');
    var data = (maximumLimit << scopeBits) | scopeDetails;
    var currentCallFrame = DebuggerScript.currentCallFrame(execState, data);
    
    var callFrame = currentCallFrame;
    do {
      callFrame.type = 'function';
      callFrame.scopeType = (function (scopeTypes) {
        return function(i) {
          return scopeTypes[i];
        }
      }(callFrame.scopeType));
      
      callFrame = callFrame.caller;
    } while (callFrame);
    
    return currentCallFrame;
  }
};

exports.DebuggerAgent = DebuggerAgent;
