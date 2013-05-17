// node-inspector version of on webkit-inspector/InspectorRuntimeAgent.cpp
var convert = require('./convert.js');

function RuntimeAgent(session) {
  this._session = session;
}

RuntimeAgent.prototype = {
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
};

exports.RuntimeAgent = RuntimeAgent;
