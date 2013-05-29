var events = require('events'),
    async = require('async'),
    convert = require('./convert.js'),
    DebuggerClient = require('./DebuggerClient').DebuggerClient,
    ScriptManager = require('./ScriptManager').ScriptManager,
    FrontendClient = require('./FrontendClient').FrontendClient,
    FrontendCommandHandler = require('./FrontendCommandHandler').FrontendCommandHandler,
    CallFramesProvider = require('./CallFramesProvider.js').CallFramesProvider;


///////////////////////////////////////////////////////////
// exports

exports.create = function(debuggerPort, config) {
  var sessionInstance,
      scriptManager = new ScriptManager(config.hidden),
      frontendCommandHandler,
      frontendClient,
      debuggerClient,
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
    var scriptId = obj.script.id,
        source = scriptManager.findScriptByID(scriptId);

    if (source.hidden) {
      debuggerClient.sendDebugRequest('continue', { stepaction: 'out' });
      return;
    }

    if (sessionInstance.callbackForNextBreak) {
      var callback = sessionInstance.callbackForNextBreak;
      sessionInstance.callbackForNextBreak = null;
      callback(obj);
      return;
    }

    if (sessionInstance.continueToLocationBreakpointId !== null) {
      debuggerClient.sendDebugRequest(
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

    sendBacktrace(obj.exception);
  }

  function onAfterCompile(event) {
    if (!event.success) return;
    scriptManager.addScript(event.body.script);
  }

  function removeAllBreakpoints(done) {
    debuggerClient.sendDebugRequest('listbreakpoints', {}, function(error, response) {
      if (error) {
        console.log('Warning: cannot remove old breakpoints. %s', error);
        done();
        return;
      }

      function removeOneBreakpoint(bp, next) {
        var req = { breakpoint: bp.number };
        debuggerClient.sendDebugRequest('clearbreakpoint', req, function(error) {
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
    debuggerClient.sendDebugRequest(
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
    if (!debuggerClient.isRunning) {
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
        debuggerClient.sendDebugRequest(command, args, callback);
      }
    },

    // This method should be removed from session during
    // code cleanup. We should probably extract CallFramesProvider
    // as a dependency for Agents or move this method to debugger client
    fetchCallFrames: {
      value: function(done) {
        new CallFramesProvider(debuggerClient).fetchCallFrames(done);
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
        debuggerClient.connect();
        debuggerClient.on('break', breakEvent);
        debuggerClient.on('afterCompile', onAfterCompile);
        debuggerClient.on('exception', breakEvent);
        debuggerClient.on('close', function(reason) {
          frontendClient.sendInspectorDetached(reason);
          sessionInstance.close();
        });
        debuggerClient.on('connect', function() {
          browserConnected();
          done();
        });
        debuggerClient.on('error', function(e) {
          var err = e.toString();
          if (e.helpString) {
            err += '\n' + e.helpString;
          }
          frontendClient.sendLogToConsole('error', err);
        });
      }
    },
    close: {
      value: function()
      {
        debuggerClient.close();
        this.emit('close');
      }
    },
    join: {
      value: function(ws_connection) {
        frontendClient = new FrontendClient(ws_connection);
        debuggerClient = new DebuggerClient(debuggerPort);
        frontendCommandHandler = new FrontendCommandHandler(
          frontendClient,
          this);
        frontendClient.on('close', this.close.bind(this));
      }
    }
  });

  return sessionInstance;
};
