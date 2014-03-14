var expect = require('chai').expect,
  launcher = require('./helpers/launcher.js'),
  config = require('../config'),
  CallFramesProvider = require('../lib/CallFramesProvider').CallFramesProvider,
  RuntimeAgent = require('../lib/RuntimeAgent.js').RuntimeAgent;

describe('RuntimeAgent', function() {
  after(launcher.stopAllDebuggers);

  it('gets scope properties', function(done) {
    // Hard-coded value for local scope of MyObj.myFunc().
    // See CallFramesProvider 'gets stack trace'
    var MYFUNC_LOCAL_SCOPE_ID = 'scope:0:0';

    launcher.runOnBreakInFunction(function(debuggerClient) {
      var callFramesProvider = new CallFramesProvider(config, debuggerClient),
        agent = new RuntimeAgent(config, debuggerClient);

      // request call frames so that scope properties are initialized
      callFramesProvider.fetchCallFrames(function(cferror) {
        if (cferror) {
          done(cferror);
          return;
        }

        agent.getProperties(
          {
            objectId: MYFUNC_LOCAL_SCOPE_ID,
            ownProperties: false,
            accessorPropertiesOnly: false
          },
          function(error, result) {
            if (error)
              return done(error);

            expect(result.result.length, 'number of local variables')
              .to.equal(2);
            var proto = result.result.filter(function(prop) {
              return prop.name == '__proto__';
            });
            expect(proto.length === 0, 'proto in scope object is filtered').to.equal(true);
            expect(result.result[0], 'local var 1').to.deep.equal({
              name: 'msg',
              writable: true,
              enumerable: true,
              configurable: true,
              value: {
                type: 'string',
                subtype: undefined,
                value: 'hello',
                description: 'hello'
              }
            });
            expect(result.result[1], 'local var 2').to.deep.equal({
              name: 'meta',
              writable: true,
              enumerable: true,
              configurable: true,
              value: {
                type: 'object',
                subtype: undefined,
                objectId: '7',
                className: 'Object',
                description: 'Object'
              }
            });

            done();
          });
      });
    });
  });

  it('filter null __proto__', function(done) {
    /*'Object' objectId is 3. __proto__ of 'Object' is 'null'*/
    launcher.runInspectObject(function(debuggerClient, inspectedObjectId) {
      var agent = new RuntimeAgent(config, debuggerClient);
      agent.getProperties(
        {
          objectId: 3,
          ownProperties: true,
          accessorPropertiesOnly: false
        },
        function(error, result) {
          if (error)
            return done(error);

          var proto = result.result.filter(function(prop) {
            return prop.name == '__proto__';
          });

          expect(proto.length === 0, 'null proto is filtered').to.equal(true);

          done();
        }
      );
    });
  });

  it('returns object properties with metadata', function(done) {
    launcher.runInspectObject(function(debuggerClient, inspectedObjectId) {
      var agent = new RuntimeAgent(config, debuggerClient);
      agent.getProperties(
        {
          objectId: inspectedObjectId,
          ownProperties: true,
          accessorPropertiesOnly: false
        },
        function(error, result) {
          if (error)
            return done(error);

          var props = convertPropertyArrayToLookup(result.result);

          expect(props['writableProp'].configurable, 'writableProp.configurable')
            .to.equal(true);

          expect(props['writableProp'].writable, 'writableProp.writable')
            .to.equal(true);

          expect(props['writableProp'].enumerable, 'writableProp.enumerable')
            .to.equal(true);

          expect(props['readonlyProp'].configurable, 'readonlyProp.configurable')
            .to.equal(false);

          expect(props['readonlyProp'].writable, 'readonlyProp.writable')
            .to.equal(false);

          expect(props['readonlyProp'].enumerable, 'readonlyProp.enumerable')
            .to.equal(false);

          done();
        }
      );
    });
  });

  it('returns empty result for accessorPropertiesOnly:true', function(done) {
    launcher.runInspectObject(function(debuggerClient, inspectedObjectId) {
      var agent = new RuntimeAgent(config, debuggerClient);
      agent.getProperties(
        {
          objectId: inspectedObjectId,
          ownProperties: false,
          accessorPropertiesOnly: true
        },
        function(error, result) {
          if (error)
            return done(error);

          expect(result.result).to.have.length(0);
          done();
        });
    });
  });

  it('returns __proto__ for ownProperties:true', function(done) {
    launcher.runInspectObject(function(debuggerClient, inspectedObjectId) {
      var agent = new RuntimeAgent(config, debuggerClient);
      agent.getProperties(
        {
          objectId: inspectedObjectId,
          ownProperties: true,
          accessorPropertiesOnly: false
        },
        function(error, result) {
          if (error)
            return done(error);

          var proto = result.result.filter(function(prop) {
            return prop.name == '__proto__';
          });
          expect(proto.length == 1, 'proto exist and unique').to.equal(true);
          expect(proto[0], '__proto__ has valid structure').to.deep.equal({
              name: '__proto__',
              value: {
                type: 'object',
                subtype: undefined,
                objectId: '17',
                className: 'Object',
                description: 'InspectedClass'
              },
              writable: true,
              configurable: true,
              enumerable: false,
              isOwn: true
            });

          done();
        });
    });
  });

  it('calls function on an object to get completions', function(done) {
    launcher.runOnBreakInFunction(function(debuggerClient) {
      var agent = new RuntimeAgent(config, debuggerClient);

      debuggerClient.fetchObjectId(agent, 'console', function(consoleObjectId) {
        agent.callFunctionOn(
          {
            objectId: consoleObjectId,
            functionDeclaration: getCompletions.toString(),
            returnByValue: true
          },
          function(err, response) {
            if (err) {
              done(err);
              return;
            }

            var completions = response.result.value;
            expect(completions).to.contain.keys('log', 'error');
            done();
          }
        );
      });
    });
  });

  describe('calls function on an object to change property value', function() {
    before(setupDebugScenario);

    toValueType(
      'a string',
      { type: 'string', value: 'new-value', description: 'new-value' }
    );

    toValueType(
      'a number',
      { type: 'number', value: 10, description: '10' }
    );

    toValueType(
      'null',
      { type: 'null', subtype: 'null', value: null, description: 'null'}
    );

    toValueType(
      'undefined',
      { type: 'undefined', description: 'undefined' }
    );

    toRefType(
      'an object',
      'inspectedObject',
      function(valueId) {
        return {
          type: 'object',
          objectId: valueId,
          className: 'Object',
          description: 'InspectedClass'
        };
      }
    );

    toRefType(
      'a function',
      'localFunc',
      function(valueId) {
        return {
          type: 'function',
          objectId: valueId,
          className: 'Function',
          description: 'function localFunc() { return \'local\'; }'
        };
      }
    );

    // helpers (implementation details) below this line

    var debuggerClient, inspectedObjectId, agent;

    function setupDebugScenario(done) {
      launcher.runInspectObject(function(client, objectId) {
        debuggerClient = client;
        inspectedObjectId = objectId;
        agent = new RuntimeAgent(config, debuggerClient);
        done();
      });
    }

    function to(type, test) {
      it('to ' + type, test);
    }

    function toValueType(type, value) {
      to(type, function(done) {
        verifyPropertySetter(
          agent,
          inspectedObjectId,
          value,
          value,
          done
        );
      });
    }

    function toRefType(type, expression, valueCb) {
      to(type, function(done) {
        debuggerClient.fetchObjectId(agent, expression, function(valueId) {
          verifyPropertySetter(
            agent,
            inspectedObjectId,
            valueCb(valueId),
            valueCb(valueId),
            done
          );
        });
      });
    }

    function verifyPropertySetter(agent,
                                  objectId,
                                  argumentDef,
                                  expectedValue,
                                  done) {
      agent.callFunctionOn(
        {
          objectId: objectId,
          functionDeclaration: setPropertyValue.toString(),
          arguments: [
            { value: 'prop' },
            argumentDef
          ]
        },
        function(err, result) {
          if (err) throw err;

          verifyPropertyValue(
            agent,
            objectId,
            'prop',
            expectedValue,
            done);
        }
      );
    }
  });
});

function convertPropertyArrayToLookup(array) {
  var lookup = {};
  for (var i in array) {
    var prop = array[i];
    lookup[prop.name] = prop;
  }
  return lookup;
}

function verifyPropertyValue(runtimeAgent,
                             objectId,
                             name,
                             expectedValue,
                             callback) {
  runtimeAgent.getProperties(
    {
      objectId: objectId,
      ownProperties: true,
      accessorPropertiesOnly: false
    },
    function(err, result) {
      if (err) throw err;

      var props = convertPropertyArrayToLookup(result.result);
      var value = props[name] ? props[name].value : undefined;
      expect(JSON.stringify(value), name)
        .to.equal(JSON.stringify(expectedValue));
      callback();
    }
  );
}


// copied from front-end/RuntimeModel.js and replaced " with '
function getCompletions(primitiveType) {
  /*jshint -W053, proto:true */
  var object;
  if (primitiveType === 'string')
    object = new String('');
  else if (primitiveType === 'number')
    object = new Number(0);
  else if (primitiveType === 'boolean')
    object = new Boolean(false);
  else
    object = this;

  var resultSet = {};
  for (var o = object; o; o = o.__proto__) {
    try {
      var names = Object.getOwnPropertyNames(o);
      for (var i = 0; i < names.length; ++i)
        resultSet[names[i]] = true;
    } catch (e) {
    }
  }
  return resultSet;
}

// copied from front-end/RemoteObject.js
function setPropertyValue(name, value) {
  this[name] = value;
}
