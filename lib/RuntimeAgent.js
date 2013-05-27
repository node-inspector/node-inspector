// node-inspector version of on webkit-inspector/InspectorRuntimeAgent.cpp
var convert = require('./convert.js'),
    util = require('util');

function RuntimeAgent(session) {
  this._session = session;
}

RuntimeAgent.prototype = {
  enable: function(params, done) {
    done();
  },

  evaluate: function(params, done) {
    var self = this;

    self._session.sendDebugRequest(
      'evaluate',
      {
        expression: params.expression,
        global: true
      },
      function (err, result) {
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
    var SELF_CONTEXT_NAME = '__node_inspector_self__',
      expression = util.format(
        '(%s).call(%s)',
        params.functionDeclaration,
        SELF_CONTEXT_NAME);

    this._session.sendDebugRequest(
      'evaluate',
      {
        expression: expression,
        global: true,
        additional_context:  [
          { name: SELF_CONTEXT_NAME, handle: Number(params.objectId) }
        ]
      },
      function handleCallFunctionOnObjectResponse(err, response) {
        if (err) {
          done(err);
          return;
        }

        var value = {};

        if (params.returnByValue && response.properties) {
          for (var i = 0; i < response.properties.length; i++) {
            value[response.properties[i].name] = true;
          }
        }

        done(null, {
          result: { value: value },
          wasThrown: false
        });
      }
    );
  },

  getProperties: function(params, done) {
    var handle = parseInt(params.objectId, 10);
    var request = { handles: [ handle ], includeSource: false };
    this._session.sendDebugRequest('lookup', request, function(error, responseBody, responseRefs) {
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
              value: convert.v8ResultToInspectorResult(ref),
            };
          });
        }

        if (proto)
          props.push({
            name: '__proto__',
            value: convert.v8RefToInspectorObject(responseRefs[proto.ref]),
          });

        done(null, { result: props });
      }
    )
    ;
  },

  releaseObjectGroup: function(params, done) {
    // V8 debugger protocol does not support object groups
    done();
  }
};

exports.RuntimeAgent = RuntimeAgent;
