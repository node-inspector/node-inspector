'use strict';

const co = require('co');
const ErrorNotImplemented = require('../Agents/BaseAgent.js').ErrorNotImplemented;

class CommandHandler {
  /**
   * @param {Config} config
   * @param {Session} session
   */
  constructor(config, session) {
    this.config = config;
    this.session = session;

    this._commands = {};

    Object.keys(predefined).forEach((key) => this.registerCommand(key, predefined[key]));
  }

  registerCommand(name, handler) {
    this._commands[name] = handler;
  }

  handleCommand(request) {
    return co(function * () {
      const command = this._commands[request.method];

      if (!command)
        return Promise.reject(new ErrorNotImplemented(request.method));

      if (typeof command === 'object')
        return Promise.resolve(command);

      return yield command(request.params);
    }.bind(this));
  }
}

const predefined = {
  'Network.enable': {},
  'Network.setCacheDisabled': {},
  'Console.enable': {},
  'Console.setMonitoringXHREnabled': {},
  'Database.enable': {},
  'Debugger.disable': {},
  'Debugger.setOverlayMessage': {},
  'DOMDebugger.setXHRBreakpoint': {},
  'DOMDebugger.removeXHRBreakpoint': {},
  'DOMDebugger.setInstrumentationBreakpoint': {},
  'DOMDebugger.removeInstrumentationBreakpoint': {},
  'DOMStorage.enable': {},
  'DOM.hideHighlight': {},
  'HeapProfiler.addInspectedHeapObject': {},
  'Inspector.enable': {},
  'Page.enable': {},
  'Page.addScriptToEvaluateOnLoad': {},
  'Page.reload': {},
  'Page.removeScriptToEvaluateOnLoad': {},
  'Page.setDeviceOrientationOverride': {},
  'Page.clearDeviceOrientationOverride': {},
  'Page.setGeolocationOverride': {},
  'Page.clearGeolocationOverride': {},
  'Page.setContinuousPaintingEnabled': {},
  'Page.setEmulatedMedia': {},
  'Page.setDeviceMetricsOverride': {},
  'Page.setScriptExecutionDisabled': {},
  'Page.setShowDebugBorders': {},
  'Page.setShowFPSCounter': {},
  'Page.setShowScrollBottleneckRects': {},
  'Page.setShowViewportSizeOnResize': {},
  'Page.setShowPaintRects': {},
  'Page.setTouchEmulationEnabled': {},
  'Page.setForceCompositingMode': {},
  'CSS.enable': {},
  'CSS.disable': {},
  'DOM.enable': {},
  'DOM.disable': {},

  'Runtime.run': {},
  'IndexedDB.enable': {},
  'Profiler.enable': {},
  'HeapProfiler.enable': {},
  'Debugger.setAsyncCallStackDepth': {},
  'Debugger.skipStackFrames': {},
  'Console.setTracingBasedTimeline': {},
  'Profiler.setSamplingInterval': {},
  'Worker.enable': {},
  'Worker.setAutoconnectToWorkers': {},
  'Page.setOverlayMessage': {},

  'CSS.getSupportedCSSProperties': { cssProperties: []},
  'Debugger.canSetScriptSource': { result: true },
  'Worker.canInspectWorkers': { result: false },
  'Page.getScriptExecutionStatus': { result: 'enabled' },
  'IndexedDB.requestDatabaseNames': { databaseNames: [] },
  'Page.canScreencast': { result: false },
  'Emulation.canEmulate': { result: false },
  'Network.canEmulateNetworkConditions': { result: false },
  'Network.setUserAgentOverride': { result: {} }
};

module.exports = CommandHandler;
