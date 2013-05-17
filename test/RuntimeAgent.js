var expect = require('chai').expect,
  launcher = require('./helpers/launcher.js'),
  CallFramesProvider = require('../lib/CallFramesProvider').CallFramesProvider,
  RuntimeAgent = require('../lib/RuntimeAgent.js').RuntimeAgent;

describe('RuntimeAgent', function() {
  launcher.stopAllDebuggersAfterEachTest();

  it('gets scope properties', function(done) {
    // Hard-coded value for local scope of MyObj.myFunc().
    // See CallFramesProvider 'gets stack trace'
    var MYFUNC_LOCAL_SCOPE_ID = '-1';

    launcher.runOnBreakInFunction(function(debuggerClient) {
      var sessionStub = { sendDebugRequest: debuggerClient.sendDebugRequest.bind(debuggerClient) },
        callFramesProvider = new CallFramesProvider(debuggerClient),
        agent = new RuntimeAgent(sessionStub);

      // request call frames so that scope properties are initialized
      callFramesProvider.fetchCallFrames(function(cferror) {
        if (cferror) {
          done(cferror);
          return;
        }

        agent.getProperties({ objectId: MYFUNC_LOCAL_SCOPE_ID }, function(error, result) {
          if (error)
            done(error);

          expect(result.result.length, 'number of local variables').to.equal(2);
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
      })
    });
  });
});
