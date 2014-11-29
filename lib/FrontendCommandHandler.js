var debugProtocol = require('debug')('node-inspector:protocol:devtools');

var RuntimeAgent = require('./RuntimeAgent').RuntimeAgent,
  PageAgent = require('./PageAgent').PageAgent,
  NetworkAgent = require('./NetworkAgent').NetworkAgent,
  DebuggerAgent = require('./DebuggerAgent').DebuggerAgent,
  ProfilerAgent = require('./ProfilerAgent').ProfilerAgent,
  HeapProfilerAgent = require('./HeapProfilerAgent').HeapProfilerAgent,
  ConsoleAgent = require('./ConsoleAgent').ConsoleAgent;

/**
 * @param {Object} config
 * @param {FrontendClient} frontendClient
 * @param {DebuggerClient} debuggerClient
 * @param {BreakEventHandler} breakEventHandler
 * @param {ScriptManager} scriptManager
 * @param {InjectorClient} injectorClient
 * @param {ConsoleClient} consoleClient
 * @param {HeapProfilerClient} heapProfilerClient
 */
function FrontendCommandHandler(config,
                                frontendClient,
                                debuggerClient,
                                breakEventHandler,
                                scriptManager,
                                injectorClient,
                                consoleClient,
                                heapProfilerClient) {
  this._config = config;
  this._agents = {};
  this._specialCommands = {};
  this._frontendClient = frontendClient;
  this._debuggerClient = debuggerClient;
  this._breakEventHandler = breakEventHandler;
  this._scriptManager = scriptManager;
  this._consoleClient = consoleClient;
  this._heapProfilerClient = heapProfilerClient;
  this._injectorClient = injectorClient;
  this._initializeRegistry();
  this._registerEventHandlers();
  this._pauseInitialEvents();
}

FrontendCommandHandler.prototype = {
  _initializeRegistry: function() {
    this._registerAgent(
      'Debugger',
      new DebuggerAgent(
        this._config,
        this._frontendClient,
        this._debuggerClient,
        this._breakEventHandler,
        this._scriptManager,
        this._injectorClient,
        this._consoleClient,
        this._heapProfilerClient)
    );

    this._registerAgent(
      'Console',
      new ConsoleAgent(
        this._config,
        this._debuggerClient,
        this._frontendClient,
        this._injectorClient,
        this._consoleClient)
    );

    this._registerAgent(
      'Runtime',
      new RuntimeAgent(
        this._config,
        this._debuggerClient,
        this._consoleClient,
        this._heapProfilerClient)
    );

    this._registerAgent(
      'Page',
      new PageAgent(
        this._config,
        this._debuggerClient,
        this._scriptManager)
    );

    this._registerAgent('Network', new NetworkAgent());
    
    this._registerAgent(
      'Profiler',
      new ProfilerAgent(
        this._config,
        this._debuggerClient,
        this._injectorClient,
        this._frontendClient)
    );
    
    this._registerAgent(
      'HeapProfiler',
      new HeapProfilerAgent(
        this._config,
        this._debuggerClient,
        this._injectorClient,
        this._frontendClient,
        this._heapProfilerClient)
    );

    //TODO(3y3):
    //  Remove next from noop before closing #341:
    //  - DOMDebugger.setXHRBreakpoint
    //  - DOMDebugger.removeXHRBreakpoint
    this._registerNoopCommands(
      'Network.enable',
      'Network.setCacheDisabled',
      'Console.setMonitoringXHREnabled',
      'Console.addInspectedHeapObject',
      'Database.enable',
      'DOMDebugger.setXHRBreakpoint',
      'DOMDebugger.removeXHRBreakpoint',
      'DOMDebugger.setInstrumentationBreakpoint',
      'DOMDebugger.removeInstrumentationBreakpoint',
      'DOMStorage.enable',
      'DOM.hideHighlight',
      'Inspector.enable',
      'Page.addScriptToEvaluateOnLoad',
      'Page.removeScriptToEvaluateOnLoad',
      'Page.setDeviceOrientationOverride',
      'Page.clearDeviceOrientationOverride',
      'Page.setGeolocationOverride',
      'Page.clearGeolocationOverride',
      'Page.setContinuousPaintingEnabled',
      'Page.setEmulatedMedia',
      'Page.setDeviceMetricsOverride',
      'Page.setScriptExecutionDisabled',
      'Page.setShowDebugBorders',
      'Page.setShowFPSCounter',
      'Page.setShowScrollBottleneckRects',
      'Page.setShowViewportSizeOnResize',
      'Page.setShowPaintRects',
      'Page.setForceCompositingMode',
      'CSS.enable'
    );

    this._registerQuery('CSS.getSupportedCSSProperties', { cssProperties: []});
    this._registerQuery('Worker.canInspectWorkers', { result: false });
    this._registerQuery('Page.getScriptExecutionStatus', { result: 'enabled' });
  },

  _registerAgent: function(name, agent) {
    this._agents[name] = agent;
  },

  _registerNoopCommands: function() {
    var i, fullMethodName;
    for (i = 0; i < arguments.length; i++) {
      fullMethodName = arguments[i];
      this._specialCommands[fullMethodName] = {};
    }
  },

  _registerQuery: function(fullMethodName, result) {
    this._specialCommands[fullMethodName] = { result: result };
  },

  _registerEventHandlers: function() {
    this._frontendClient.on(
      'message',
       this._handleFrontendMessage.bind(this));
  },

  _handleFrontendMessage: function(message) {
    debugProtocol('frontend: ' + message);
    var command = JSON.parse(message);
    this.handleCommand(command);
  },

  _pauseInitialEvents: function() {
    this._frontendClient.pauseEvents();
    this._agents.Page.on('resource-tree', function() {
      this._frontendClient.resumeEvents();
    }.bind(this));
  },

  handleCommand: function(messageObject) {
    var fullMethodName = messageObject.method,
      domainAndMethod = fullMethodName.split('.'),
      domainName = domainAndMethod[0],
      methodName = domainAndMethod[1],
      requestId = messageObject.id,
      agent,
      method;

    if (this._specialCommands[fullMethodName]) {
      this._handleMethodResult(
        requestId,
        fullMethodName,
        null,
        this._specialCommands[fullMethodName].result);
      return;
    }

    agent = this._agents[domainName];
    if (!agent) {
      this._sendNotImplementedResponse(requestId, fullMethodName);
      return;
    }

    method = agent[methodName];
    if (!method || typeof method !== 'function') {
      this._sendNotImplementedResponse(requestId, fullMethodName);
      return;
    }


    method.call(agent, messageObject.params, function(error, result) {
      this._handleMethodResult(messageObject.id, fullMethodName, error, result);
    }.bind(this));
  },

  _sendNotImplementedResponse: function(requestId, fullMethodName) {
    console.log(
      'Received request for a method not implemented:',
      fullMethodName
    );

    this._handleMethodResult(
      requestId,
      fullMethodName,
      new Error('Not implemented.')
    );
  },

  _handleMethodResult: function(requestId, fullMethodName, error, result) {
    var response;

    if (!requestId) {
      if (response !== undefined)
        console.log('Warning: discarded result of ' + fullMethodName);
      return;
    }

    this._frontendClient.sendResponse(requestId, fullMethodName, error, result);
  }
};

exports.FrontendCommandHandler = FrontendCommandHandler;
