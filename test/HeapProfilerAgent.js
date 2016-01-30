'use strict';

var co = require('co');
var expect = require('chai').expect;
var launcher = require('./helpers/launcher.js');
var InjectorClient = require('../lib/InjectorClient');
var HeapProfilerAgent = require('../lib/Agents/HeapProfilerAgent');

var child;
var session;
var heapProfilerAgent;
var debuggerClient;
var frontendClient;

describe('HeapProfiler Agent', function() {
  before(() => initializeProfiler());

  it('should take snapshot with report progress', () => {
    return co(function * () {
      var state = 0;
      var finished;

      var promise = new Promise(resolve => finished = resolve);

      function updateState() {
        if (++state == 2) {
          frontendClient.off('HeapProfiler.reportHeapSnapshotProgress', onReportHeapSnapshotProgress);
          frontendClient.off('HeapProfiler.addHeapSnapshotChunk', onAddHeapSnapshotChunk);
          finished();
        }
      }

      function onReportHeapSnapshotProgress(message) {
        expect(message).to.have.keys(['done', 'total', 'finished']);
        if (message.finished) updateState();
      }

      function onAddHeapSnapshotChunk(message) {
        expect(message).to.have.keys(['chunk']);
      }

      frontendClient.on('HeapProfiler.reportHeapSnapshotProgress', onReportHeapSnapshotProgress);
      frontendClient.on('HeapProfiler.addHeapSnapshotChunk', onAddHeapSnapshotChunk);

      var result = yield heapProfilerAgent.handle('takeHeapSnapshot', {
        reportProgress: true
      });

      expect(result).to.equal(undefined);
      updateState();

      yield promise;
    });
  });

  it('should start tracking', () => {
    return co(function * () {
      var finished;
      var state = {
        heapStatsUpdate: false,
        lastSeenObjectId: false
      };
      function updateState(name) {
        expect(state[name]).to.equal(false);
        state[name] = true;
        if (state.heapStatsUpdate && state.lastSeenObjectId) finished();
      }

      var promise = new Promise(resolve => finished = resolve);

      frontendClient.once('HeapProfiler.heapStatsUpdate', message => {
        expect(message).to.have.keys(['statsUpdate']);
        updateState('heapStatsUpdate');
      });

      frontendClient.once('HeapProfiler.lastSeenObjectId', message => {
        expect(message).to.have.keys(['lastSeenObjectId', 'timestamp']);
        updateState('lastSeenObjectId');
      });

      var result = yield heapProfilerAgent.handle('startTrackingHeapObjects');
      expect(result).to.equal(undefined);
      yield promise;
    });
  });

  it('should stop tracking', () => {
    return co(function * () {
      var result = yield heapProfilerAgent.handle('startTrackingHeapObjects');
      expect(result).to.be.equal(undefined);
    });
  });
});

function expand(instance) {
  child = instance.child;
  session = instance.session;
  debuggerClient = session.debuggerClient;
  frontendClient = session.frontendClient;
}

function initializeProfiler() {
  return co(function * () {
    yield launcher.runCommandlet(true).then(expand);

    var injectorClient = new InjectorClient({}, session);
    session.injectorClient = injectorClient;

    heapProfilerAgent = new HeapProfilerAgent({}, session);

    yield injectorClient.injected();
    yield debuggerClient.request('continue');
    child.stdin.write('log loop\n');
  });
}
