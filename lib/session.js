var events = require('events'),
    convert = require('./convert.js'),
    DebuggerClient = require('./DebuggerClient').DebuggerClient,
    ScriptManager = require('./ScriptManager').ScriptManager,
    FrontendClient = require('./FrontendClient').FrontendClient,
    FrontendCommandHandler = require('./FrontendCommandHandler').FrontendCommandHandler,
    BreakEventHandler = require('./BreakEventHandler').BreakEventHandler,
    InjectorClient = require('./InjectorClient').InjectorClient;


///////////////////////////////////////////////////////////
// exports

exports.create = function(debuggerPort, config) {
  var sessionInstance,
      scriptManager,
      frontendCommandHandler,
      frontendClient,
      debuggerClient,
      injectorClient,
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
  
  function onInjectorClientError(e) {
    var err = e.toString();
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
      value: function(wsConnection) {
        frontendClient = new FrontendClient(wsConnection);
        debuggerClient = new DebuggerClient(debuggerPort);

        injectorClient = new InjectorClient(
          config,
          debuggerClient
        );

        scriptManager = new ScriptManager(
          config,
          frontendClient,
          debuggerClient
        );

        breakEventHandler = new BreakEventHandler(
          config,
          frontendClient,
          debuggerClient,
          scriptManager,
          injectorClient
        );

        frontendCommandHandler = new FrontendCommandHandler(
          config,
          frontendClient,
          debuggerClient,
          breakEventHandler,
          scriptManager,
          injectorClient
        );

        frontendClient.on('close', this.close.bind(this));

        debuggerClient.on('close', onDebuggerClientClose);
        debuggerClient.on('error', onDebuggerClientError);
        injectorClient.on('error', onInjectorClientError);
      }
    }
  });

  return sessionInstance;
};
