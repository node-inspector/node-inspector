var expect = require('chai').expect,
  launcher = require('./helpers/launcher.js'),
  config = require('../config'),
  CallFramesProvider = require('../lib/CallFramesProvider').CallFramesProvider;

describe('CallFramesProvider', function() {
  launcher.stopAllDebuggersAfterEachTest();

  it('gets stack trace', function(done) {
    launcher.runOnBreakInFunction(function(debuggerClient) {
      var provider = new CallFramesProvider(config, debuggerClient);
      provider.fetchCallFrames(function(error, callFrames) {
        if (error !== undefined && error !== null) {
          done(error);
          return;
        }

        // The order of script loading has changed in v0.11
        var scriptId = /^v0\.10\./.test(process.version) ? '28' : '36';

        expect(callFrames).to.have.length.least(2);

        function objectValueWithId(id, className) {
          return {
            type: 'object',
            objectId: id,
            className: className || 'Object',
            description: className || 'Object'
          };
        }

        assertFrame({
            callFrameId: '0',
            functionName: 'MyObj.myFunc',
            location: {scriptId: scriptId, lineNumber: 8, columnNumber: 4},
            scopeChain: [
              { object: objectValueWithId('scope:0:0'), type: 'local' },
              { object: objectValueWithId('scope:0:1'), type: 'closure' },
              { object: objectValueWithId('scope:0:2'), type: 'global' }
            ],
            'this': objectValueWithId('1')
          },
          callFrames[0],
          'frame[0]');

        assertFrame({
            callFrameId: '1',
            functionName: 'globalFunc',
            location: {scriptId: scriptId, lineNumber: 13, columnNumber: 6},
            scopeChain: [
              { object: objectValueWithId('scope:1:0'), type: 'local' },
              { object: objectValueWithId('scope:1:1'), type: 'closure' },
              { object: objectValueWithId('scope:1:2'), type: 'global' }
            ],
            'this': objectValueWithId('10', 'global')
          },
          callFrames[1],
          'frame[1]');

        done();
      });
    });
  });

  it('retrieves specified number of stack traces when configured', function(done) {
    launcher.runOnBreakInFunction(function(debuggerClient) {
      var provider = new CallFramesProvider({stackTraceLimit: 1}, debuggerClient);
      provider.fetchCallFrames(function(error, callFrames) {
        if (error !== undefined && error !== null) {
          done(error);
          return;
        }

        expect(callFrames).to.have.length(1);
        done();
      });
    });
  });
});

function assertFrame(expected, actual, frameName) {
  expect(actual.callFrameId, frameName + '.callFrameId')
    .to.equal(expected.callFrameId);
  expect(actual.functionName, frameName + '.functionName')
    .to.equal(expected.functionName);
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

