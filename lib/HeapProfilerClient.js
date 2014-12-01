//heap:refHandle
var HEAP_ID_MATCHER = /^heap:(\d+)$/;

function HeapProfilerClient(config, debuggerClient) {
  this._debuggerClient = debuggerClient;
}

HeapProfilerClient.prototype.isHeapObjectId = function(objectId) {
  return HEAP_ID_MATCHER.test(objectId);
};

HeapProfilerClient.prototype.lookupHeapObjectId = function(objectId, done) {
  var matchedId = HEAP_ID_MATCHER.exec(objectId);
  this._debuggerClient.request(
    'HeapProfiler._lookupHeapObjectId',
    {
      objectId: matchedId[1]
    },
    function(error, lookupBody, lookupRefs) {
      if (error) return done(error);

      Object.keys(lookupRefs).forEach(function(key) {
        this.convertHandleToHeapHandle(lookupRefs[key]);
      }, this);
      done(null, lookupBody, lookupRefs);
    }.bind(this)
  );
};

HeapProfilerClient.prototype.convertHandleToHeapHandle = function(ref) {
  if (ref.handle !== undefined) {
    ref.handle = 'heap:' + ref.handle;
  }
};

exports.HeapProfilerClient = HeapProfilerClient;
