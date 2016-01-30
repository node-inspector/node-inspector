var spawn = require('child_process').spawn,
  path = require('path'),
  SessionStub = require('./SessionStub'),
  DebuggerClient = require('../../lib/DebuggerClient').DebuggerClient;

var co = require('co');
var ignore = () => {};

var TEST_DIR = path.dirname(__filename);
var DEBUG_PORT = 61000;

function bind(func) {
  var args = Array.prototype.slice.call(arguments, 1);
  return func.bind.apply(func, [null].concat(args));
}

function expandArrayFor(func, context) {
  return function(array) {
    func.apply(context, array);
  };
}

var instances = [];
function stopAllDebuggers(err) {
  if (err) console.error(err);
  var promises = instances.map(stopInstance);
  instances = [];
  return Promise.all(promises);
}

function instantiate(scriptPath, breakOnStart) {
  return bind(appInstance, scriptPath, breakOnStart);
}

function appInstance(scriptPath, breakOnStart) {
  if (scriptPath.indexOf(path.sep) == -1)
    scriptPath = path.join(TEST_DIR, '..', 'fixtures', scriptPath);

  breakOnStart = breakOnStart || false;

  return new Promise(function(resolve, reject) {
    var debugOptions = computeDebugOptions(breakOnStart);
    var childProcess = spawn('node', [debugOptions, scriptPath]);
    var instance = {
      child: childProcess,
      session: null
    };

    instances.push(instance);

    var startupTimer = setTimeout(function() {
      reject(new Error('Timeout while waiting for the child process to initialize the debugger.'));
    }, 1000);

    childProcess.stderr.on('data', function(data) {
      // Wait for the child process to initialize the debugger before connecting
      // Node v0.10 prints "debugger listening..."
      // Node v0.11 prints "Debugger listening..."
      if (/^[Dd]ebugger listening on port \d+$/m.test(data.toString())) {
        clearTimeout(startupTimer);
        // give the child process some time to finish the initialization code
        // this is especially important when breakOnStart is true
        setTimeout(resolve, 200, instance);
      } else {
        // Forward any error messages from the child process
        // to our stderr to make troubleshooting easier
        process.stderr.write(data);
      }
    });
  });
}

function setupScript(scriptPath, breakOnStart) {
  return Promise.resolve()
    .then(stopAllDebuggers)
    .then(instantiate(scriptPath, breakOnStart))
    .then(setupDebugger);
}

function computeDebugOptions(breakOnStart) {
  return '--debug' + (breakOnStart ? '-brk=' : '=') + DEBUG_PORT;
}

function setupDebugger(instance) {
  instance.session = new SessionStub();
  var debuggerClient = instance.session.debuggerClient = new DebuggerClient(DEBUG_PORT);

  return instance;
}

function stopInstance(instance) {
  return co(function * () {
    if (!instance.session) return;

    yield instance.session.debuggerClient.request('continue').catch(ignore);
    yield instance.session.debuggerClient.close().catch(console.log);
    instance.child.kill('SIGKILL');
  });
}

exports.stopAllDebuggers = stopAllDebuggers;

exports.startDebugger = function(scriptPath, breakOnStart) {
  return setupScript(scriptPath, breakOnStart)
    .catch(stopAllDebuggers);
};

exports.runCommandlet = function(breakOnStart) {
  return setupScript('Commandlet.js', breakOnStart)
    .catch(stopAllDebuggers);
};

process.on('beforeExit', function() {
  stopAllDebuggers();
});
