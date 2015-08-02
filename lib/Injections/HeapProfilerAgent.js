// This function will be injected into the target process.
module.exports = function(require, debug, options) {
  var profilerCache = {};

  var profiler = require(options['v8-profiler']);
  var makeMirror = debug.get('MakeMirror');

  var debuggerConnected = true;
  var heapStatsState = {
    trackingEnabled: false,
    lastSeenObjectId: null,
    timeout: null,
    samples: []
  };

  function reportProgress(done, total){
    if (!debuggerConnected) return false; //Abort

    debug.command('HeapProfiler.reportHeapSnapshotProgress', {
      done: done,
      total: total,
      finished: done === total
    });
  }

  function sendSnapshotChunk(data) {
    if (!debuggerConnected) return false; //Abort

    debug.command(
      'HeapProfiler.addHeapSnapshotChunk',
      {
        chunk: data
      }
    );
  }

  function heapStatsIterator(samples) {
    if (!debuggerConnected || !heapStatsState.trackingEnabled) return false; //Abort

    Array.prototype.push.apply(heapStatsState.samples, samples);
  }

  function heapStatsCallback() {
    if (!debuggerConnected || !heapStatsState.trackingEnabled) return false; //Abort

    debug.command('HeapProfiler.heapStatsUpdate', {
      statsUpdate: heapStatsState.samples
    });
    debug.command('HeapProfiler.lastSeenObjectId', {
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

  debug.register('HeapProfiler.heapStatsUpdate', debug.commandToEvent);
  debug.register('HeapProfiler.lastSeenObjectId', debug.commandToEvent);
  debug.register('HeapProfiler.reportHeapSnapshotProgress', debug.commandToEvent);
  debug.register('HeapProfiler.addHeapSnapshotChunk', debug.commandToEvent);

  debug.register('HeapProfiler.getObjectByHeapObjectId', function(request, response) {
    var objectId = request.arguments.objectId,
        result;

    try {
      var object = profiler.getObjectByHeapObjectId(+objectId);
      var mirror = makeMirror(object);
      result = debug.serializeAndCacheMirror(profilerCache, mirror);
    } catch (e) {
      return response.failed(e.message || e);
    }

    response.body = { result: result };
  });

  debug.registerAsync('HeapProfiler.takeHeapSnapshot', function(request, response, done) {
    var needsReportProgress = request.arguments.reportProgress;
    var snapshot = profiler.takeSnapshot(needsReportProgress ? reportProgress : false);

    function sendSnapshotFinished() {
      snapshot.delete();
      done();
    }

    snapshot.serialize(sendSnapshotChunk.bind(snapshot), sendSnapshotFinished);
  });

  debug.register('HeapProfiler.startTrackingHeapObjects', function(request, response) {
    heapStatsState.trackingEnabled = true;
    profiler.startTrackingHeapObjects();
    heapStatsLoop();
  });

  debug.registerAsync('HeapProfiler.stopTrackingHeapObjects', function(request, response, done) {
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

  debug.register('HeapProfiler._lookupHeapObjectId', function(request, response) {
    var objectId = request.arguments.objectId;

    var mirror = profilerCache[objectId];
    if (!mirror)
      return response.failed('Object #' + objectId + '# not found');

    //serialize body and append serialized refs to response
    response.body = debug.serializeAndCacheMirror(profilerCache, mirror, response);
  });

  debug.on('close', function(){
    debuggerConnected = false;
    heapStatsState.trackingEnabled = false;
    heapStatsState.samples = null;
    profilerCache = null;
    profiler.deleteAllSnapshots();
  });
};
