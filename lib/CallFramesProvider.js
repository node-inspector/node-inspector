var async = require('async'),
    convert = require('./convert.js');

function CallFramesProvider(debuggerClient) {
  this._debuggerClient = debuggerClient;
}

function resolveReference(obj, refs) {
  var value, key;
  if (obj.ref === undefined || obj.type !== undefined)
    return;

  value = refs[obj.ref];
  for (key in value) {
    obj[key] = value[key];
  }
}

CallFramesProvider.prototype = {

  fetchCallFrames: function(handleResponse) {
    this._debuggerClient.sendDebugRequest('backtrace', {},
      function(err, responseBody, responseRefs) {
        if (err) {
          handleResponse(err);
          return;
        }

        this._convertBacktraceToCallFrames(responseBody, responseRefs, handleResponse);
      }.bind(this));
  },

  _convertBacktraceToCallFrames: function(backtraceResponseBody, backtrackResponseRefs, handleResponse) {
    var debuggerFrames = backtraceResponseBody.frames || [];

    async.map(
      debuggerFrames,
      this._convertDebuggerFrameToInspectorFrame.bind(this, backtrackResponseRefs),
      handleResponse);
  },

  _convertDebuggerFrameToInspectorFrame: function(backtrackResponseRefs, frame, done) {
    resolveReference(frame.func, backtrackResponseRefs);
    resolveReference(frame.receiver, backtrackResponseRefs);

    this._fetchScopes(frame.index, function buildInspectorFrameFromDebuggerObjects(err, scopeChain) {
      if (err) {
        done(err);
        return;
      }

      done(null, {
        callFrameId: frame.index.toString(),
        functionName: frame.func.inferredName || frame.func.name,
        location: {
          scriptId: frame.func.scriptId.toString(),
          lineNumber: frame.line,
          columnNumber: frame.column
        },
        scopeChain: scopeChain,
        this: convert.v8RefToInspectorObject(frame.receiver)
      });
    });
  },

  _fetchScopes: function(frameIndex, done) {
    this._debuggerClient.sendDebugRequest(
      'scopes',
      {
        frameNumber: frameIndex
      },
      function(error, responseBody, responseRefs) {
        var scopeChain;

        if (error) {
          done(error);
          return;
        }

        scopeChain = responseBody.scopes.map(function(scope) {
          resolveReference(scope.object, responseRefs);

          return {
            object: convert.v8RefToInspectorObject(scope.object),
            type: convert.v8ScopeTypeToString(scope.type)
          };
        });

        done(null, scopeChain);
      }
    );
  }
};

exports.CallFramesProvider = CallFramesProvider;
