'use strict';

class HeapProfilerAgent extends require('../InjectableAgent') {
  /**
   * @param {Config} config
   * @param {Session} session
   */
  constructor(config, session) {
    super('HeapProfiler', config, session);

    this.registerEvent('reportHeapSnapshotProgress');
    this.registerEvent('addHeapSnapshotChunk');
    this.registerEvent('heapStatsUpdate');
    this.registerEvent('lastSeenObjectId');

    this.registerCommand('takeHeapSnapshot');
    this.registerCommand('getObjectByHeapObjectId');
    this.registerCommand('startTrackingHeapObjects');
    this.registerCommand('stopTrackingHeapObjects');
  }

  get injection() {
    return {
      injection: require.resolve('./HeapProfilerInjection.js'),
      profiler: require.resolve('v8-profiler')
    };
  }
}

module.exports = HeapProfilerAgent;
