var co = require('co');
var debugProtocol = require('debug')('node-inspector:protocol:devtools');

var BaseAgent = require('./Agents/BaseAgent.js');
var RuntimeAgent = require('./Agents/RuntimeAgent.js');
var PageAgent = require('./Agents/PageAgent.js');
var NetworkAgent = require('./Agents/NetworkAgent.js');
var DebuggerAgent = require('./Agents/DebuggerAgent.js');
var ProfilerAgent = require('./Agents/ProfilerAgent.js');
var HeapProfilerAgent = require('./Agents/HeapProfilerAgent.js');
var ConsoleAgent = require('./Agents/ConsoleAgent.js');

var ErrorNotImplemented = BaseAgent.ErrorNotImplemented;

/**
 * @param {Object} config
 */
function FrontendCommandHandler(config, session) {
  this._config = config;
  this._session = session;
  this._agents = {};
  this._specials = {};

  // All clients should be initialised before agents initialisation
  process.nextTick(() => this._initializeRegistry());
}

FrontendCommandHandler.prototype = {
  _initializeRegistry: function() {
    this._registerAgent('Debugger', new DebuggerAgent(this._config, this._session));
    this._registerAgent('Console', new ConsoleAgent(this._config, this._session));
    this._registerAgent('Runtime', new RuntimeAgent(this._config, this._session));
    this._registerAgent('Page', new PageAgent(this._config, this._session));
    this._registerAgent('Network', new NetworkAgent(this._config, this._session));
    this._registerAgent('Profiler',new ProfilerAgent(this._config, this._session));
    this._registerAgent('HeapProfiler', new HeapProfilerAgent(this._config, this._session));

    //TODO(3y3):
    //  Remove next from noop before closing #341:
    //  - DOMDebugger.setXHRBreakpoint
    //  - DOMDebugger.removeXHRBreakpoint
    [
      'Network.enable',
      'Network.setCacheDisabled',
      'Console.enable',
      'Console.setMonitoringXHREnabled',
      'Database.enable',
      'Debugger.disable',
      'Debugger.setOverlayMessage',
      'DOMDebugger.setXHRBreakpoint',
      'DOMDebugger.removeXHRBreakpoint',
      'DOMDebugger.setInstrumentationBreakpoint',
      'DOMDebugger.removeInstrumentationBreakpoint',
      'DOMStorage.enable',
      'DOM.hideHighlight',
      'HeapProfiler.addInspectedHeapObject',
      'Inspector.enable',
      'Page.enable',
      'Page.addScriptToEvaluateOnLoad',
      'Page.reload',
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
      'Page.setTouchEmulationEnabled',
      'Page.setForceCompositingMode',
      'CSS.enable',
      'CSS.disable',
      'DOM.enable',
      'DOM.disable',

      'Runtime.run',
      'IndexedDB.enable',
      'Profiler.enable',
      'HeapProfiler.enable',
      'Debugger.setAsyncCallStackDepth',
      'Debugger.skipStackFrames',
      'Console.setTracingBasedTimeline',
      'Profiler.setSamplingInterval',
      'Worker.enable',
      'Worker.setAutoconnectToWorkers',
      'Page.setOverlayMessage'
    ].forEach((command) => this._registerNoopCommand(command));

    this._registerQuery('CSS.getSupportedCSSProperties', { cssProperties: []});
    this._registerQuery('Debugger.canSetScriptSource', { result: true });
    this._registerQuery('Worker.canInspectWorkers', { result: false });
    this._registerQuery('Page.getScriptExecutionStatus', { result: 'enabled' });
    this._registerQuery('IndexedDB.requestDatabaseNames', { databaseNames: [] });
    this._registerQuery('Page.canScreencast', { result: false });
    this._registerQuery('Emulation.canEmulate', { result: false });
    this._registerQuery('Network.canEmulateNetworkConditions', { result: false });
    this._registerQuery('Network.setUserAgentOverride', { result: {} });
  },

  _registerAgent: function(name, agent) {
    this._agents[name] = agent;
  },

  _registerNoopCommand: function(command) {
    this._specials[command] = {};
  },

  _registerQuery: function(fullMethodName, result) {
    this._specials[fullMethodName] = { result: result };
  },

  special: function(method) {
    var special = this._specials[method];
    if (special)
      return Promise.resolve(special);

    return Promise.resolve(false);
  },

  agent: function(method) {
    var agentName = method.split('.')[0];
    var agent = this._agents[agentName];

    if (agent)
      return Promise.resolve(agent);

    return Promise.reject(new ErrorNotImplemented(method));
  },

  handleCommand: function(request) {
    return co(function * () {
      var special = yield this.special(request.method);

      if (special) return special.result;

      var agent = yield this.agent(request.method);
      var command = request.method.split('.')[1];
      return yield agent.handle(command, request.params);
    }.bind(this));
  }
};

module.exports = FrontendCommandHandler;
module.exports.FrontendCommandHandler = FrontendCommandHandler;
