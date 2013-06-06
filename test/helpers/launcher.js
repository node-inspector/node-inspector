var spawn = require('child_process').spawn,
  path = require('path'),
  DebuggerClient = require('../../lib/DebuggerClient').DebuggerClient,
  stopDebuggerCallbacks = [];

function startDebugger(scriptPath, done) {
  var testDir = path.dirname(__filename),
    debugPort = 61000,
    child,
    debuggerClient;

  if (scriptPath.indexOf(path.sep) == -1)
    scriptPath = path.join(testDir, '..', 'fixtures', scriptPath);
  child = spawn('node', ['--debug=' + debugPort, scriptPath]);

  child.stderr.on('data', function(data) { process.stderr.write(data); });

  stopDebuggerCallbacks.push(function stopDebugger() {
    debuggerClient.close();
    child.kill();
  });

  function setupDebuggerClient() {
    debuggerClient = new DebuggerClient(debugPort);
    debuggerClient.connect();
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

function runOnBreakInFunction(test) {
  startDebugger('BreakInFunction.js', function(childProcess, debuggerClient) {
    debuggerClient.on('break', function() {
      test(debuggerClient);
    });
    childProcess.stdin.write('go!\n');
  });
}

function stopAllDebuggers() {
  while (stopDebuggerCallbacks.length > 0)
    stopDebuggerCallbacks.shift()();
}

function stopAllDebugersAfterEachTest() {
  afterEach(stopAllDebuggers);
}

process.on('exit', function() {
  stopAllDebuggers();
});

exports.startDebugger = startDebugger;
exports.runOnBreakInFunction = runOnBreakInFunction;
exports.stopAllDebuggers = stopAllDebuggers;
exports.stopAllDebuggersAfterEachTest = stopAllDebugersAfterEachTest;
