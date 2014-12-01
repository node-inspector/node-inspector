var expect = require('chai').expect,
    launcher = require('./helpers/launcher.js'),
    EventEmitter = require('events').EventEmitter,
    InjectorClient = require('../lib/InjectorClient').InjectorClient,
    HeapProfilerAgent = require('../lib/HeapProfilerAgent').HeapProfilerAgent,
    HeapProfilerClient = require('../lib/HeapProfilerClient').HeapProfilerClient;

var heapProfilerAgent,
    heapProfilerClient,
    debuggerClient;
var frontendClient = new EventEmitter();
frontendClient.sendEvent = function(event, message) {
  this.emit(event, message);
};
frontendClient.off = frontendClient.removeListener;

describe('HeapProfiler Agent', function() {
  before(initializeProfiler);

  it('should take snapshot with report progress', function(done) {
    var progress,
        total,
        state = 0,
        chunks = 0,
        data = '';

    function updateState() {
      if (++state == 4) {
        frontendClient.off('HeapProfiler.reportHeapSnapshotProgress', onReportHeapSnapshotProgress);
        frontendClient.off('HeapProfiler.addHeapSnapshotChunk', onAddHeapSnapshotChunk);
        done();
      }
    }

    function onReportHeapSnapshotProgress(message) {
      expect(message).to.have.keys(['done', 'total']);
      if (message.done === message.total) updateState();
    }

    function onAddProfileHeader(message) {
      expect(message).to.have.keys(['header']);
      updateState();
    }

    function onAddHeapSnapshotChunk(message) {
      expect(message).to.have.keys(['uid', 'chunk']);
      chunks++;
      data += message.chunk;
    }

    function onFinishHeapSnapshot(message) {
      expect(message).to.deep.equal({ uid: 1 });
      expect(chunks).to.be.above(0);
      updateState();
    }

    frontendClient.on('HeapProfiler.reportHeapSnapshotProgress', onReportHeapSnapshotProgress);
    frontendClient.on('HeapProfiler.addHeapSnapshotChunk', onAddHeapSnapshotChunk);
    frontendClient.once('HeapProfiler.addProfileHeader', onAddProfileHeader);
    frontendClient.once('HeapProfiler.finishHeapSnapshot', onFinishHeapSnapshot);

    heapProfilerAgent.takeHeapSnapshot(
      {
        reportProgress: true
      },
      function(error, result){
        expect(error).to.equal(null);
        expect(result).to.deep.equal({
          header: {
            title: 'Snapshot 1',
            typeId: 'HEAP',
            uid: 1
          }
        });
        updateState();
      }
    );
  });

  it('should get snapshot', function(done) {
    heapProfilerAgent.getHeapSnapshot(
      {
        uid: 1
      },
      function(error, result){
        expect(error).to.equal(null);
        done();
      }
    );
  });

  it('should return error if requested snapshot not found', function(done) {
    heapProfilerAgent.getHeapSnapshot(
      {
        uid: 2
      },
      function(error, result){
        expect(error).to.equal('Snapshot with id 2 not found');
        done();
      }
    );
  });

  it('should receive snapshots list', function(done) {
    heapProfilerAgent.getProfileHeaders({}, function(error, result) {
      expect(error).to.equal(null);
      expect(result.headers).to.have.length(1);
      done();
    });
  });

  it('should remove snapshot', function(done) {
    heapProfilerAgent.removeProfile(
      {
        uid: 1
      },
      function(error, result){
        expect(error).to.equal(null);
        done();
      }
    );
  });

  it('should return error if removing snapshot not found', function(done) {
    heapProfilerAgent.removeProfile(
      {
        uid: 2
      },
      function(error, result){
        expect(error).to.equal('Snapshot with id 2 not found');
        done();
      }
    );
  });

  it('should start tracking', function(done) {
    var state = {
      heapStatsUpdate: false,
      lastSeenObjectId: false
    };
    function updateState(name) {
      expect(state[name]).to.equal(false);
      state[name] = true;
      if (state.heapStatsUpdate && state.lastSeenObjectId) done();
    }

    frontendClient.once('HeapProfiler.heapStatsUpdate', function(message) {
      expect(message).to.have.keys(['statsUpdate']);
      updateState('heapStatsUpdate');
    });

    frontendClient.once('HeapProfiler.lastSeenObjectId', function(message) {
      expect(message).to.have.keys(['lastSeenObjectId', 'timestamp']);
      updateState('lastSeenObjectId');
    });

    heapProfilerAgent.startTrackingHeapObjects({}, function(error, result) {
      expect(error).to.equal(null);
      expect(result).to.equal(undefined);
    });
  });

  it('should stop tracking', function(done) {
    heapProfilerAgent.startTrackingHeapObjects({}, function(error, result) {
      expect(error).to.be.equal(null);
      expect(result).to.be.equal(undefined);
      done();
    });
  });
});



describe('HeapProfilerClient', function() {
  it('should match only valid heapObjectId', function() {
    function expectIsHeapObjectId(id) {
      return expect(heapProfilerClient.isHeapObjectId(id), id);
    }

    expectIsHeapObjectId('heap:1').to.be.true();
    expectIsHeapObjectId('heap:1:1').to.be.false();
    expectIsHeapObjectId('heap:a').to.be.false();
    expectIsHeapObjectId('heap:').to.be.false();
    expectIsHeapObjectId('hea:1').to.be.false();
    expectIsHeapObjectId(':').to.be.false();
    expectIsHeapObjectId('1').to.be.false();
  });
});

function initializeProfiler(done) {
  launcher.runPeriodicConsoleLog(true, function(childProcess, client) {
    var injectorClient = new InjectorClient({}, client);
    debuggerClient = client;
    heapProfilerClient = new HeapProfilerClient({}, debuggerClient);
    heapProfilerAgent = new HeapProfilerAgent(
      {},
      debuggerClient,
      injectorClient,
      frontendClient,
      heapProfilerClient);

    injectorClient.once('inject', function(injected) {
      if (injected) done();
    });
    injectorClient.once('error', function(error) {
      done(error);
    });
    injectorClient.inject();
  });
}
