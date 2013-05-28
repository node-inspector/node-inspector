var events = require('events'),
    async = require('async'),
    debugr = require('./debugger'),
    convert = require('./convert.js'),
    ScriptManager = require('./ScriptManager').ScriptManager,
    FrontendClient = require('./FrontendClient').FrontendClient,
    FrontendCommandHandler = require('./FrontendCommandHandler').FrontendCommandHandler,
    CallFramesProvider = require('./CallFramesProvider.js').CallFramesProvider;


///////////////////////////////////////////////////////////
// exports

exports.create = function(debuggerPort, config) {
  var sessionInstance,
      debug = null,
      attachedToDebugger = false,
      scriptManager = new ScriptManager(config.hidden),
      frontendCommandHandler,
      frontendClient,
      callbackForNextBreak;

  scriptManager.on('scriptLoaded', function onScriptLoaded(script) {
    frontendClient.sendEvent('Debugger.scriptParsed', script);
  });

  function sendBacktrace(exception) {
    sessionInstance.fetchCallFrames(function(error, result) {
      if (error)
        frontendClient.sendLogToConsole('error', error);
      else
        frontendClient.sendEvent(
          'Debugger.paused',
          {
            callFrames: result,
            reason: exception ? 'exception' : 'other',
            data: exception ? convert.v8RefToInspectorObject(exception) : null
          });
    });
  }

  function breakEvent(obj) {
    var scriptId = obj.body.script.id,
        source = scriptManager.findScriptByID(scriptId);

    if (source.hidden) {
      debug.sendDebugRequest('continue', { stepaction: 'out' });
      return;
    }

    if (sessionInstance.callbackForNextBreak) {
      var callback = sessionInstance.callbackForNextBreak;
      sessionInstance.callbackForNextBreak = null;
      callback(obj.body);
      return;
    }

    if (sessionInstance.continueToLocationBreakpointId !== null) {
      debug.sendDebugRequest(
        'clearbreakpoint',
        { breakpoint: sessionInstance.continueToLocationBreakpointId },
        function(err, result) {
          if (err)
            frontendClient.sendLogToConsole('warning', err);
          else
            sessionInstance.continueToLocationBreakpointId = null;
        }
      );
    }

    sendBacktrace(obj.body.exception);
  }

  function onAfterCompile(event) {
    if (!event.success) return;
    scriptManager.addScript(event.body.script);
  }

  function removeAllBreakpoints(done) {
    debug.sendDebugRequest('listbreakpoints', {}, function(error, response) {
      if (error) {
        console.log('Warning: cannot remove old breakpoints. %s', error);
        done();
        return;
      }

      function removeOneBreakpoint(bp, next) {
        var req = { breakpoint: bp.number };
        debug.sendDebugRequest('clearbreakpoint', req, function(error) {
          if (error)
            console.log(
              'Warning: cannot remove old breakpoint %d. %s',
              bp.number,
              error);
          next();
        });
      }

      async.eachSeries(response.breakpoints, removeOneBreakpoint, done);
    }.bind(this));
  }

  function reloadScripts(done) {
    scriptManager.reset();
    debug.sendDebugRequest(
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

        result.forEach(scriptManager.addScript.bind(scriptManager));
        done();
      });
  }

  function sendBacktraceIfPaused() {
    if (!debug.isRunning) {
      sendBacktrace();
    }
  }

  function browserConnected() { // TODO find a better name
    async.waterfall([
      // Remove all existing breakpoints because:
      // 1) front-end inspector cannot restore breakpoints from debugger anyway
      // 2) all breakpoints were disabled when the previous debugger-client
      //    disconnected from the debugged application
      removeAllBreakpoints,
      reloadScripts,
      sendBacktraceIfPaused
    ]);
  }

  sessionInstance = Object.create(events.EventEmitter.prototype, {
    continueToLocationBreakpointId: { writable: true, value: null },
    callbackForNextBreak: {
      get: function() { return callbackForNextBreak; },
      set: function(value) {
        if (value && callbackForNextBreak)
          throw new Error('Cannot set multiple callbacks for the next break.');
        callbackForNextBreak = value;
      }
    },

    sendDebugRequest: {
      value: function(command, args, callback) {
        debug.sendDebugRequest(command, args, callback);
      }
    },

    // This method should be removed from session during
    // code cleanup. We should probably extract CallFramesProvider
    // as a dependency for Agents or move this method to debugger client
    fetchCallFrames: {
      value: function(done) {
        new CallFramesProvider(debug).fetchCallFrames(done);
      }
    },

    sendPausedEvent: {
      value: function() {
        sendBacktrace();
      }
    },

    attach: {
      value: function(done)
      {
        debug = debugr.attachDebugger(debuggerPort);
        debug.on('break', breakEvent);
        debug.on('afterCompile', onAfterCompile)
        debug.on('close', function(reason) {
          //TODO determine proper close behavior
          debug = {
            request: function() {
              console.error('debugger not connected');
            },
            sendDebugRequest: function(command, args, callback) {
              callback('debugger not connected');
            }
          };
          frontendClient.sendEvent('Inspector.detached', { reason: reason });
          sessionInstance.close();
        });
        debug.on('connect', function() {
          done();
          browserConnected();
        });
        debug.on('exception', function(msg) {
          breakEvent(msg);
        });
        debug.on('error', function(e) {
          var err = e.toString();
          if (e.helpString) {
            err += '\n' + e.helpString;
          }
          frontendClient.sendLogToConsole('error', err);
        });

        attachedToDebugger = true;
      }
    },
    close: {
      value: function()
      {
        if (debug && debug.connected) {
          debug.close();
        }
        this.emit('close');
      }
    },
    join: {
      value: function(ws_connection) {
        frontendClient = new FrontendClient(ws_connection);
        frontendCommandHandler = new FrontendCommandHandler(
          frontendClient,
          this);
        frontendClient.on('close', this.close.bind(this));
      }
    }
  });

  return sessionInstance;
};
