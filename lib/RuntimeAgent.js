// node-inspector version of on webkit-inspector/InspectorRuntimeAgent.cpp
var convert = require('./convert.js'),
    util = require('util'),
    CallFramesProvider = require('./CallFramesProvider.js').CallFramesProvider;

/**
 * @param {Object} config
 * @param {DebuggerClient} debuggerClient
 * @param {FrontendClient} frontendClient
 * @param {ConsoleClient} consoleClient
 * @param {HeapProfilerClient} heapProfilerClient
 * @constructor
 */
function RuntimeAgent(config, session) {
  this._debuggerClient = session.debuggerClient;
  this._frontendClient = session.frontendClient;
  this._consoleClient = session.consoleClient;
  this._heapProfilerClient = session.heapProfilerClient;
  this._callFramesProvider = new CallFramesProvider(config, session);
}

RuntimeAgent.prototype = {
  enable: function(params, done) {
    done();
    //Relative to WorkerRuntimeAgent::enable in core/inspector/WorkerRuntimeAgent.cpp
    this._frontendClient.sendEvent('Runtime.executionContextCreated', {
      context: {
        id: 1,
        isPageContext: true,
        name: ''
      }
    });
  },

  evaluate: function(params, done) {
    var self = this;

    self._debuggerClient.request(
      'evaluate',
      {
        expression: params.expression,
        global: true
      },
      function(err, result) {
        // Errors from V8 are actually just messages, so we need to fill them out a bit.
        if (err) {
          err = convert.v8ErrorToInspectorError(err);
        }

        done(null, {
          result: err || convert.v8ResultToInspectorResult(result),
          wasThrown: !!err
        });
      }
    );
  },

  callFunctionOn: function(params, done) {
    function callFunctionWithParams(err, evaluateParams) {
      if (err) {
        done(err);
        return;
      }

      var callback = this._handleCallFunctionOnObjectResponse
        .bind(this, done, params.returnByValue);

      this._debuggerClient.request(
        'evaluate',
        evaluateParams,
        callback
      );
    }

    this._createEvaluateParamsForFunctionCall(
      params.objectId,
      params.functionDeclaration,
      params.arguments,
      callFunctionWithParams.bind(this)
    );
  },

  _createEvaluateParamsForFunctionCall:
    function(selfId, declaration, args, done) {
      args = args || [];

      try {
        var argsData = args.map(this._getFunctionCallArgsData.bind(this));
        var params = this._buildEvaluateParamsFromArgsData(
          selfId,
          declaration,
          argsData);
        done(null, params);
      } catch (err) {
        done(err);
      }
    },

  _buildEvaluateParamsFromArgsData: function(selfId, declaration, argsData) {
    argsData.unshift(this._getSelfArgData(selfId));

    var argNames = argsData.map(function(a) { return a.code; });
    var argContexts = argsData
      .map(function(a) { return a.context; })
      // filter out empty contexts (value types are context-less)
      .filter(function(c) { return !!c; });

    var expression = util.format(
      '(%s).call(%s)',
      declaration,
      argNames.join(', '));

    return {
      expression: expression,
      global: true,
      additional_context: argContexts
    };
  },

  _getSelfArgData: function(selfId) {
    var SELF_CONTEXT_NAME = '__node_inspector_self__';
    return {
      code: SELF_CONTEXT_NAME,
      context: {
        name: SELF_CONTEXT_NAME,
        handle: Number(selfId)
      }
    };
  },

  _getFunctionCallArgsData: function(arg, index) {
    var uniqueId = '__node_inspector_arg' + index;
    switch (arg.type) {
      case undefined:
      case 'string':
        return { code: util.format('"%s"', arg.value) };
      case 'number':
        return { code: arg.value };
      case 'null':
      case 'undefined':
        return { code: arg.type };
      case 'object':
      case 'function':
        return {
          code: uniqueId,
          context: {
            name: uniqueId,
            handle: Number(arg.objectId)
          }
        };
      default:
        throw new Error(util.format(
          'Function arguments of type "%s" are not supported',
          arg.type
        ));
    }
  },

  _handleCallFunctionOnObjectResponse:
    function(done, returnByValue, err, response) {
      if (err) {
        done(null, {
          err: err,
          wasThrown: true
        });
        return;
      }

      var value = {};
      if (returnByValue && response.properties) {
        for (var i = 0; i < response.properties.length; i++) {
          value[response.properties[i].name] = true;
        }
      }

      done(null, {
        result: { value: value },
        wasThrown: false
      });
    },

  getProperties: function(params, done) {
    // TODO implement the new way of getting object properties
    //
    // Front-end sends the following two requests for Object properties:
    // "params": {"objectId":"78","ownProperties":false,"accessorPropertiesOnly":true}
    // "params":{"objectId":"78","ownProperties":true,"accessorPropertiesOnly":false}
    //
    // Or the following request for Scope properties:
    // "params":{"objectId":"scope:0:2","ownProperties":false,"accessorPropertiesOnly":false}
    // See getProperties() and getInjectedProperties() in
    //   http://src.chromium.org/blink/branches/chromium/1625/Source/core/
    //    inspector/InjectedScriptSource.js
    // for more details.
    var options = {
      ownProperties: params.ownProperties,
      accessorPropertiesOnly: params.accessorPropertiesOnly
    };
    if (this._callFramesProvider.isScopeId(params.objectId)) {
      this._getPropertiesOfScopeId(params.objectId, options, done);
    } else if (this._consoleClient.isConsoleId(params.objectId)) {
      this._getPropertiesOfConsoleId(params.objectId, options, done);
    } else if (this._heapProfilerClient.isHeapObjectId(params.objectId)) {
      this._getPropertiesOfHeapObjectId(params.objectId, options, done);
    } else {
      this._getPropertiesOfObjectId(params.objectId, options, done);
    }
  },

  _getPropertiesOfScopeId: function(scopeId, options, done) {
    this._callFramesProvider.resolveScopeId(
      scopeId,
      function(err, result) {
        if (err) {
          done(err);
        } else {
          this._getPropertiesOfObjectId(result, options, done);
        }
      }.bind(this)
    );
  },

  _getPropertiesOfObjectId: function(objectId, options, done) {
    var handle = parseInt(objectId, 10);
    var request = { handles: [handle], includeSource: false };
    this._debuggerClient.request(
      'lookup',
      request,
      function(error, responseBody, responseRefs) {
        if (error) {
          done(error);
          return;
        }
        var obj = responseBody[handle],
            props = convert.v8ObjectToInspectorProperties(obj, responseRefs, options);

        done(null, { result: props });
      }
    );
  },

  _getPropertiesOfConsoleId: function(objectId, options, done) {
    this._consoleClient.lookupConsoleId(
      objectId,
      function(error, responseBody, responseRefs) {
        if (error) return done(error);

        var props = convert.v8ObjectToInspectorProperties(responseBody, responseRefs, options);

        done(null, { result: props });
      }.bind(this)
    );
  },

  _getPropertiesOfHeapObjectId: function(objectId, options, done) {
    this._heapProfilerClient.lookupHeapObjectId(
      objectId,
      function(error, responseBody, responseRefs) {
        if (error) return done(error);

        var props = convert.v8ObjectToInspectorProperties(responseBody, responseRefs, options);

        done(null, { result: props });
      }.bind(this)
    );
  },

  releaseObjectGroup: function(params, done) {
    // V8 debugger protocol does not support object groups
    done();
  },

  releaseObject: function(params, done) {
    // V8 debugger protocol does not support manual release
    done();
  }
};

exports.RuntimeAgent = RuntimeAgent;
