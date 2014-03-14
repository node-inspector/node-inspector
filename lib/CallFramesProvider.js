var async = require('async'),
    convert = require('./convert.js');

var SCOPE_ID_MATCHER = /^scope:(\d+):(\d+)$/;

/**
 * @param {Object} config
 * @param {DebuggerClient} debuggerClient
 */
function CallFramesProvider(config, debuggerClient) {
  this._config = config;
  this._debuggerClient = debuggerClient;
}

CallFramesProvider.prototype = {

  fetchCallFrames: function(handleResponse) {
    this._debuggerClient.request(
      'backtrace',
      {
        inlineRefs: true,
        fromFrame: 0,
        toFrame: this._config.stackTraceLimit
      },
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
    var scopeChain = frame.scopes.map(function(scope) {
      return {
        object: {
          type: 'object',
          objectId: 'scope:' + frame.index + ':' + scope.index,
          className: 'Object',
          description: 'Object'
        },
        type: convert.v8ScopeTypeToString(scope.type)
      };
    });

    done(null, {
      callFrameId: frame.index.toString(),
      functionName: frame.func.inferredName || frame.func.name,
      location: {
        scriptId: convert.v8ScriptIdToInspectorId(frame.func.scriptId),
        lineNumber: frame.line,
        columnNumber: frame.column
      },
      scopeChain: scopeChain,
      this: convert.v8RefToInspectorObject(frame.receiver)
    });
  },

  isScopeId: function(objectId) {
    return SCOPE_ID_MATCHER.test(objectId);
  },

  resolveScopeId: function(objectId, callback) {
    var scopeIdMatch = SCOPE_ID_MATCHER.exec(objectId);
    if (!scopeIdMatch) throw new Error('Invalid scope id "' + objectId + '"');
    this._debuggerClient.request(
      'scope',
      {
        number: Number(scopeIdMatch[2]),
        frameNumber: Number(scopeIdMatch[1])
      },
      function(err, result) {
        if (err)
          callback(err);
        else
          callback(null, result.object.ref);
      });
  }
};

exports.CallFramesProvider = CallFramesProvider;
