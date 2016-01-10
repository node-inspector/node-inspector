// This function will be injected into the target process.
module.exports = function(require, debug, options) {
  var profiler = require(options['v8-profiler']);

  var debuggerConnected = true;
  var heapStatsState = {
    trackingEnabled: false,
    lastSeenObjectId: null,
    timeout: null,
    samples: []
  };

  function reportProgress(done, total){
    if (!debuggerConnected) return false; //Abort

    debug.emitEvent('HeapProfiler.reportHeapSnapshotProgress', {
      done: done,
      total: total,
      finished: done === total
    });
  }

  function sendSnapshotChunk(data) {
    if (!debuggerConnected) return false; //Abort

    debug.emitEvent('HeapProfiler.addHeapSnapshotChunk', {
      chunk: data
    });
  }

  function heapStatsIterator(samples) {
    if (!debuggerConnected || !heapStatsState.trackingEnabled) return false; //Abort

    Array.prototype.push.apply(heapStatsState.samples, samples);
  }

  function heapStatsCallback() {
    if (!debuggerConnected || !heapStatsState.trackingEnabled) return false; //Abort

    debug.emitEvent('HeapProfiler.heapStatsUpdate', {
      statsUpdate: heapStatsState.samples
    });
    debug.emitEvent('HeapProfiler.lastSeenObjectId', {
      lastSeenObjectId: heapStatsState.lastSeenObjectId,
      timestamp: Date.now()
    });

    heapStatsState.samples.length = 0;
    heapStatsState.timeout = setTimeout(heapStatsLoop, 100);
  }

  function nextTrackingChunk() {
    heapStatsState.lastSeenObjectId = profiler.getHeapStats(heapStatsIterator, heapStatsCallback);
  }

  function heapStatsLoop() {
    if (heapStatsState.timeout !== null) clearTimeout(heapStatsState.timeout);
    if (heapStatsState.trackingEnabled) nextTrackingChunk();
  }

  debug.registerEvent('HeapProfiler.heapStatsUpdate');
  debug.registerEvent('HeapProfiler.lastSeenObjectId');
  debug.registerEvent('HeapProfiler.reportHeapSnapshotProgress');
  debug.registerEvent('HeapProfiler.addHeapSnapshotChunk');

  debug.registerAgentCommand('HeapProfiler.getObjectByHeapObjectId', ['objectId'],
    function(args, response, InjectedScript) {
      var result;

      try {
        var object = profiler.getObjectByHeapObjectId(+args[0]);
        result = InjectedScript.wrapObject(object, 'heap', true, false);
      } catch (e) {
        return response.failed(e.message || e);
      }

      response.body = { result: result };
    });

  debug.registerAsyncCommand('HeapProfiler.takeHeapSnapshot', function(request, response, done) {
    var needsReportProgress = request.arguments.reportProgress;
    var snapshot = profiler.takeSnapshot(needsReportProgress ? reportProgress : false);

    function sendSnapshotFinished() {
      snapshot.delete();
      done();
    }

    snapshot.serialize(sendSnapshotChunk.bind(snapshot), sendSnapshotFinished);
  });

  debug.registerCommand('HeapProfiler.startTrackingHeapObjects', function(request, response) {
    heapStatsState.trackingEnabled = true;
    profiler.startTrackingHeapObjects();
    heapStatsLoop();
  });

  debug.registerAsyncCommand('HeapProfiler.stopTrackingHeapObjects', function(request, response, done) {
    heapStatsState.trackingEnabled = false;
    profiler.stopTrackingHeapObjects();

    var needsReportProgress = request.arguments.reportProgress;
    var snapshot = profiler.takeSnapshot(needsReportProgress ? reportProgress : false);

    function sendSnapshotFinished() {
      snapshot.delete();
      done();
    }

    snapshot.serialize(sendSnapshotChunk.bind(snapshot), sendSnapshotFinished);
  });

  debug.on('close', function(){
    debuggerConnected = false;
    heapStatsState = null
    profiler.deleteAllSnapshots();
  });
};
