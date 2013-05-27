var expect = require('chai').expect,
  launcher = require('./helpers/launcher.js'),
  CallFramesProvider = require('../lib/CallFramesProvider').CallFramesProvider,
  RuntimeAgent = require('../lib/RuntimeAgent.js').RuntimeAgent;

describe('RuntimeAgent', function() {
  launcher.stopAllDebuggersAfterEachTest();

  it('gets scope properties', function(done) {
    // Hard-coded value for local scope of MyObj.myFunc().
    // See CallFramesProvider 'gets stack trace'
    var MYFUNC_LOCAL_SCOPE_ID = 'scope:0:0';

    launcher.runOnBreakInFunction(function(debuggerClient) {
      var callFramesProvider = new CallFramesProvider(debuggerClient),
        agent = new RuntimeAgent(debuggerClient);

      // request call frames so that scope properties are initialized
      callFramesProvider.fetchCallFrames(function(cferror) {
        if (cferror) {
          done(cferror);
          return;
        }

        agent.getProperties(
          {
            objectId: MYFUNC_LOCAL_SCOPE_ID
          },
          function(error, result) {
            if (error)
              done(error);

            expect(result.result.length, 'number of local variables')
              .to.equal(2);
            expect(result.result[0], 'local var 1').to.deep.equal({
              name: 'msg',
              value: {
                type: 'string',
                value: 'hello',
                description: 'hello'
              }
            });
            expect(result.result[1], 'local var 2').to.deep.equal({
              name: 'meta',
              value: {
                type: 'object',
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

  it('calls function on an object to get completions', function(done) {
    launcher.runOnBreakInFunction(function(debuggerClient) {
      var agent = new RuntimeAgent(debuggerClient);

      fetchConsoleObjectId(function(consoleObjectId) {
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

      function fetchConsoleObjectId(cb) {
        agent.evaluate(
          {
            expression: 'console'
          },
          function(err, response) {
            if (err) {
              done(err);
              return;
            }

            cb(response.result.objectId);
          }
        );
      }
    });
  });
});


// copied from front-end/RuntimeModel.js and replaced " with '
function getCompletions(primitiveType) {
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
