var expect = require('chai').expect,
  semver = require('semver'),
  launcher = require('./helpers/launcher.js'),
  CallFramesProvider = require('../lib/CallFramesProvider').CallFramesProvider;

describe('CallFramesProvider', function() {
  var scriptId,
      session,
      callFrames;

  beforeEach(function(done) {
    launcher.runOnBreakInFunction(function(_session) {
      session = _session;

      session.debuggerClient.request('scripts', {
        filter: 'BreakInFunction.js',
      }, function(error, result) {
        scriptId = '' + result[0].id;
        var provider = new CallFramesProvider({}, session);
        provider.fetchCallFrames(function(error, _callFrames) {
          if (error !== undefined && error !== null) {
            done(error);
            return;
          }

          callFrames = _callFrames;
          done();
        });
      });
    });
  });

  it('gets stack trace', function(done) {
    var provider = new CallFramesProvider({}, session);
    provider.fetchCallFrames(function(error, callFrames) {
      if (error !== undefined && error !== null) {
        done(error);
        return;
      }

      expect(callFrames).to.have.length.least(2);

      assertFrame({
          callFrameId: '0',
          functionName: 'MyObj.myFunc',
          location: {scriptId: scriptId, lineNumber: 8, columnNumber: 4},
          scopeChain: scopeWithIndex(0),
          'this': objectValueWithId('1')
        },
        callFrames[0],
        'frame[0]');

      assertFrame({
          callFrameId: '1',
          functionName: 'globalFunc',
          location: {scriptId: scriptId, lineNumber: 13, columnNumber: 6},
          scopeChain: scopeWithIndex(1),
          'this': objectValueWithId('10', 'global')
        },
        callFrames[1],
        'frame[1]');

      done();
    });
  });

  it('retrieves specified number of stack traces when configured', function(done) {
    var provider = new CallFramesProvider({stackTraceLimit: 1}, session);
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

function objectValueWithId(id, className) {
  return {
    type: 'object',
    objectId: id,
    className: className || 'Object',
    description: className || 'Object'
  };
}

function scopeWithIndex(index) {
  var scopeChain;

  if (semver.lt(process.version, '1.0.0'))
    scopeChain = [
      { object: objectValueWithId('scope:' + index + ':0'), type: 'local' },
      { object: objectValueWithId('scope:' + index + ':1'), type: 'closure' },
      { object: objectValueWithId('scope:' + index + ':2'), type: 'global' }
    ];
  else
    scopeChain = [
      { object: objectValueWithId('scope:' + index + ':0'), type: 'local' },
      { object: objectValueWithId('scope:' + index + ':1'), type: 'closure' },
      { object: objectValueWithId('scope:' + index + ':2'), type: 'unknown' },
      { object: objectValueWithId('scope:' + index + ':3'), type: 'global' }
    ];

  return scopeChain;
}

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
