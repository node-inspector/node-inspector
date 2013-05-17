var expect = require('chai').expect,
  launcher = require('./helpers/launcher.js'),
  CallFramesProvider = require('../lib/CallFramesProvider').CallFramesProvider;

describe('CallFramesProvider', function() {
  launcher.stopAllDebuggersAfterEachTest();

  it('gets stack trace', function(done) {
    launcher.runOnBreakInFunction(function(debuggerClient) {
      var provider = new CallFramesProvider(debuggerClient);
      provider.fetchCallFrames(function(error, callFrames) {
        if (error !== undefined && error !== null) {
          done(error);
          return;
        }

        expect(callFrames).to.have.length.least(2);

        assertFrame({
            callFrameId: '0',
            functionName: 'MyObj.myFunc',
            location: {scriptId: '28', lineNumber: 7, columnNumber: 4},
            scopeChain: [
              { object: { type: 'object', objectId: '-1', className: 'Object', description: 'Object'}, type: 'local' },
              { object: { type: 'object', objectId: '-2', className: 'Object', description: 'Object'}, type: 'closure' },
              { object: { type: 'object', objectId: '90', className: 'Object', description: 'Object'}, type: 'global' },
            ],
            'this': {type: 'object', objectId: '1', className: 'Object', description: 'Object'},
          },
          callFrames[0],
          'frame[0]');

        assertFrame({
            callFrameId: '1',
            functionName: 'globalFunc',
            location: {scriptId: '28', lineNumber: 12, columnNumber: 6},
            scopeChain: [
              { object: { type: 'object', objectId: '-3', className: 'Object', description: 'Object'}, type: 'local' },
              { object: { type: 'object', objectId: '-4', className: 'Object', description: 'Object'}, type: 'closure' },
              { object: { type: 'object', objectId: '90', className: 'Object', description: 'Object'}, type: 'global' },
            ],
            'this': {type: 'object', objectId: '10', className: 'global', description: 'Object'},
          },
          callFrames[1],
          'frame[1]');

        done();
      });
    });
  });
});

function assertFrame(expected, actual, frameName) {
  expect(actual.callFrameId, frameName + '.callFrameId').to.equal(expected.callFrameId);
  expect(actual.functionName, frameName + '.functionName').to.equal(expected.functionName);
  assertJSONEqual(expected.location, actual.location, frameName + '.location');
  assertScopeChain(expected.scopeChain, actual.scopeChain, frameName + '.scopeChain');
  assertJSONEqual(expected.this, actual.this, frameName + '.this');
}

function assertScopeChain(expected, actual, objectName) {
  var i;
  expect(actual.length, objectName + '.length').to.equal(expected.length);
  for (i = 0; i < expected.length; i++) {
    assertJSONEqual(expected[i], actual[i], objectName + '[' + i + ']');
  }
}

function assertJSONEqual(expected, actual, message) {
  var expectedString = expected ? JSON.stringify(expected) : expected;
  var actualString = actual ? JSON.stringify(actual) : actual;
  expect(actualString, message).to.equal(expectedString);
}

