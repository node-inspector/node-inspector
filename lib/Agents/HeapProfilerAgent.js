'use strict';

var inherits = require('util').inherits;
var BaseAgent = require('./BaseAgent.js');

var _injection = require.resolve('../Injections/HeapProfilerAgent');

/**
 * @param {{inject}} config
 * @param {DebuggerClient} debuggerClient
 * @param {InjectorClient} injectorClient
 * @param {FrontendClient} frontendClient
*/
function HeapProfilerAgent(config, session) {
  BaseAgent.call(this, config, session);

  this._name = 'HeapProfiler';
  this._inject = true;
  this._injectorClient = session.injectorClient;

  try {
    this._inject = !(config.inject === false || config.inject.profiles === false);
  } catch (e) {}

  this.registerEvent('reportHeapSnapshotProgress');
  this.registerEvent('addHeapSnapshotChunk');
  this.registerEvent('heapStatsUpdate');
  this.registerEvent('lastSeenObjectId');

  this.registerCommand('takeHeapSnapshot');
  this.registerCommand('getObjectByHeapObjectId');
  this.registerCommand('startTrackingHeapObjects');
  this.registerCommand('stopTrackingHeapObjects');

  this._ready = this._inject
    ? this._injection()
    : Promise.reject(`${this._name} agent disabled.`);
}
inherits(HeapProfilerAgent, BaseAgent);

HeapProfilerAgent.prototype._injection = function() {
  var injection = function(require, debug, options) {
    require(options.injection)(require, debug, options);
  };
  var options = {
    injection: _injection,
    'v8-profiler': require.resolve('v8-profiler')
  };

  return this._injectorClient.injection(injection, options);
};

module.exports = HeapProfilerAgent;
module.exports.HeapProfilerAgent = HeapProfilerAgent;
