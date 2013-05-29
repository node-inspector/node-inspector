var events = require('events'),
    async = require('async'),
    convert = require('./convert.js'),
    DebuggerClient = require('./DebuggerClient').DebuggerClient,
    ScriptManager = require('./ScriptManager').ScriptManager,
    FrontendClient = require('./FrontendClient').FrontendClient,
    FrontendCommandHandler = require('./FrontendCommandHandler').FrontendCommandHandler,
    BreakEventHandler = require('./BreakEventHandler').BreakEventHandler;


///////////////////////////////////////////////////////////
// exports

exports.create = function(debuggerPort, config) {
  var sessionInstance,
      scriptManager = new ScriptManager(config.hidden),
      frontendCommandHandler,
      frontendClient,
      debuggerClient,
      breakEventHandler;

  scriptManager.on('scriptLoaded', function onScriptLoaded(script) {
    frontendClient.sendEvent('Debugger.scriptParsed', script);
  });

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
      breakEventHandler.sendBacktraceToFrontend();
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
        breakEventHandler.fetchCallFrames(done);
      }
    },

    sendPausedEvent: {
      value: function() {
        breakEventHandler.sendBacktraceToFrontend();
      }
    },

    attach: {
      value: function(done)
      {
        debuggerClient.connect();
        debuggerClient.on('afterCompile', onAfterCompile);
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

        breakEventHandler = new BreakEventHandler(
          frontendClient,
          debuggerClient,
          scriptManager
        );

        frontendCommandHandler = new FrontendCommandHandler(
          frontendClient,
          this,
          breakEventHandler);

        frontendClient.on('close', this.close.bind(this));
      }
    }
  });

  return sessionInstance;
};
