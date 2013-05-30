var events = require('events'),
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

  function onDebuggerClientClose(reason) {
    frontendClient.sendInspectorDetached(reason);
    sessionInstance.close();
  }

  function onDebuggerClientError(e) {
    var err = e.toString();
    if (e.helpString) {
      err += '\n' + e.helpString;
    }
    frontendClient.sendLogToConsole('error', err);
  }

  sessionInstance = Object.create(events.EventEmitter.prototype, {
    sendDebugRequest: {
      value: function(command, args, callback) {
        debuggerClient.sendDebugRequest(command, args, callback);
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
          debuggerClient,
          breakEventHandler,
          scriptManager);

        frontendClient.on('close', this.close.bind(this));

        debuggerClient.on('afterCompile', onAfterCompile);
        debuggerClient.on('close', onDebuggerClientClose);
        debuggerClient.on('error', onDebuggerClientError);
      }
    }
  });

  return sessionInstance;
};
