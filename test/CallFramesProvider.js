var expect = require('chai').expect,
  CallFramesProvider = require('../lib/CallFramesProvider').CallFramesProvider;

describe('CallFramesProvider', function() {
  it('gets stack trace', function(done) {
    startDebugger('BreakInFunction.js', function(childProcess, debuggerClient) {
      debuggerClient.on('break', function() {
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
                { object: { type: 'object', objectId: '88', className: 'Object', description: 'Object'}, type: 'global' },
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
                { object: { type: 'object', objectId: '88', className: 'Object', description: 'Object'}, type: 'global' },
              ],
              'this': {type: 'object', objectId: '9', className: 'global', description: 'global'},
            },
            callFrames[1],
            'frame[1]');

          done();
        });
      });
      childProcess.stdin.write('go!\n');
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

function startDebugger(scriptPath, done) {
  var spawn = require('child_process').spawn,
    path = require('path'),
    attachDebugger = require('../lib/debugger').attachDebugger,
    testDir = path.dirname(__filename),
    debugPort = 61000,
    child,
    debuggerClient;

  scriptPath = path.join(testDir, 'fixtures', scriptPath);
  child = spawn('node', ['--debug=' + debugPort, scriptPath]);

  process.on('exit', function() {
    child.kill();
  });

  function setupDebuggerClient() {
    debuggerClient = attachDebugger(debugPort);
    debuggerClient.on('connect', function() {
      done(child, debuggerClient);
    });
    debuggerClient.on('error', function(e) {
      throw new Error('Debugger connection error: ' + e);
    });
  }

  // give the child process some time to start up the debugger
  setTimeout(setupDebuggerClient, 200);
}