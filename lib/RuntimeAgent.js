// node-inspector version of on webkit-inspector/InspectorRuntimeAgent.cpp
var convert = require('./convert.js'),
    util = require('util'),
    CallFramesProvider = require('./CallFramesProvider.js').CallFramesProvider;

/**
 * @param {DebuggerClient} debuggerClient
 * @constructor
 */
function RuntimeAgent(debuggerClient) {
  this._debuggerClient = debuggerClient;
  this._callFramesProvider = new CallFramesProvider(debuggerClient);
}

RuntimeAgent.prototype = {
  enable: function(params, done) {
    done();
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

    var argNames = argsData.map(function(a) { return a.code });
    var argContexts = argsData
      .map(function(a) { return a.context })
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
        break;
      case 'number':
        return { code: arg.value };
        break;
      case 'null':
      case 'undefined':
        return { code: arg.type };
        break;
      case 'object':
      case 'function':
        return {
          code: uniqueId,
          context: {
            name: uniqueId,
            handle: Number(arg.objectId)
          }
        };
        break;
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
    if (this._callFramesProvider.isScopeId(params.objectId)) {
      this._getPropertiesOfScopeId(params.objectId, done);
    } else {
      this._getPropertiesOfObjectId(params.objectId, done);
    }
  },

  _getPropertiesOfScopeId: function(scopeId, done) {
    this._callFramesProvider.resolveScopeId(
      scopeId,
      function(err, result) {
        if (err) {
          done(err);
        } else {
          this._getPropertiesOfObjectId(result, done);
        }
      }.bind(this)
    );
  },

  _getPropertiesOfObjectId: function(objectId, done) {
    var handle = parseInt(objectId, 10);
    var request = { handles: [handle], includeSource: false };
    this._debuggerClient.request('lookup', request, function(error, responseBody, responseRefs) {
        var obj,
          proto,
          props;

        if (error) {
          done(error);
          return;
        }

        obj = responseBody[handle];
        proto = obj.proto;
        props = obj.properties;

        if (props) {
          props = props.map(function(p) {
            var ref = responseRefs[p.ref];
            return {
              name: String(p.name),
              writable: (p.attributes & 1) != 1,
              enumerable: (p.attributes & 2) != 2,
              value: convert.v8ResultToInspectorResult(ref)
            };
          });
        }

        if (proto)
          props.push({
            name: '__proto__',
            value: convert.v8RefToInspectorObject(responseRefs[proto.ref])
          });

        done(null, { result: props });
      }
    );
  },

  releaseObjectGroup: function(params, done) {
    // V8 debugger protocol does not support object groups
    done();
  }
};

exports.RuntimeAgent = RuntimeAgent;
