// node-inspector version of on webkit-inspector/InspectorRuntimeAgent.cpp
var convert = require('./convert.js');

function RuntimeAgent(session) {
  this._session = session;
}

RuntimeAgent.prototype = {
  evaluate: function(params, done) {
    done('Not implemented yet.'); // TODO - Schoon
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

        props = obj.properties.map(function(p) {
          var ref = responseRefs[p.ref];
          return {
            name: String(p.name),
            value: convert.v8RefToInspectorObject(ref),
          };
        });

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
