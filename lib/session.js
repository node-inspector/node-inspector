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
      scriptManager,
      frontendCommandHandler,
      frontendClient,
      debuggerClient,
      breakEventHandler;

  function onDebuggerClientClose(reason) {
    if (frontendClient.isConnected)
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

        scriptManager = new ScriptManager(
          config.isScriptHidden,
          frontendClient,
          debuggerClient
        );

        breakEventHandler = new BreakEventHandler(
          frontendClient,
          debuggerClient,
          scriptManager
        );

        frontendCommandHandler = new FrontendCommandHandler(
          config,
          frontendClient,
          debuggerClient,
          breakEventHandler,
          scriptManager);

        frontendClient.on('close', this.close.bind(this));

        debuggerClient.on('close', onDebuggerClientClose);
        debuggerClient.on('error', onDebuggerClientError);
      }
    }
  });

  return sessionInstance;
};
