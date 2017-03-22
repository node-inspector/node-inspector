var spawn = require('child_process').spawn,
  path = require('path'),
  SessionStub = require('./SessionStub'),
  DebuggerClient = require('../../lib/DebuggerClient').DebuggerClient;

var TEST_DIR = path.dirname(__filename);
var DEBUG_PORT = 61000;

var Promise = require('promise');

function bind(func) {
  var args = Array.prototype.slice.call(arguments, 1);
  return func.bind.apply(func, [null].concat(args));
}

function expandArrayFor(func, context) {
  return function(array) {
    func.apply(context, array);
  };
}

function expandInstanceFor(func) {
  return function(instance) {
    func(instance.child, instance.session);
  };
}

var instances = [];
function stopAllDebuggers(err) {
  if (err) console.error(err);
  var promises = instances.map(stopInstance);
  instances = [];
  return new Promise.all(promises);
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
      // Node v6.x prints "Debugger listening on [::]:xxxx"
      if (/^[Dd]ebugger listening on/m.test(data.toString()) && /\d+$/m.test(data.toString()) ) {
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
    .then(setupDebugger)
    .then(injectHelpers);
}

function computeDebugOptions(breakOnStart) {
  return '--debug' + (breakOnStart ? '-brk=' : '=') + DEBUG_PORT;
}

function setupDebugger(instance) {
  instance.session = new SessionStub();
  var debuggerClient = instance.session.debuggerClient = new DebuggerClient(DEBUG_PORT);

  return new Promise(function(resolve, reject) {
    debuggerClient.on('connect', function() {
      resolve(instance);
    });
    debuggerClient.on('error', function(e) {
      reject(new Error('Debugger connection error: ' + e));
    });
    debuggerClient.connect();
  });
}

function injectHelpers(instance) {
  instance.session.debuggerClient.fetchObjectId =
    function(debuggerClient, expression, callback) {
      this.request(
        'evaluate',
        {
          expression: expression
        },
        function(err, response) {
          if (err) throw err;
          callback(String(response.handle));
        }
      );
    };

  return Promise.resolve(instance);
}

function stopInstance(instance) {
  return new Promise(function(resolve, reject) {
    if (instance.session) {
      instance.session.debuggerClient
        .once('close', function() {
          resolve();
        })
        .close();
    } else {
      process.nextTick(resolve);
    }
    instance.child.kill();
  });
}

exports.startDebugger = function(scriptPath, breakOnStart, test) {
  if (!test) {
    test = breakOnStart;
    breakOnStart = false;
  }
  return setupScript(scriptPath, breakOnStart)
    .then(expandInstanceFor(test))
    .catch(stopAllDebuggers);
};
exports.runOnBreakInFunction = function(test) {
  return setupScript('BreakInFunction.js', false)
    .then(function(instance) {
      instance.session.debuggerClient.once('break', function() {
        test(instance.session);
      });
      instance.child.stdin.write('go!\n');
    })
    .catch(stopAllDebuggers);
};
exports.runCommandlet = function(breakOnStart, test) {
  if (!test) {
    test = breakOnStart;
    breakOnStart = false;
  }
  return setupScript('Commandlet.js', breakOnStart)
    .then(expandInstanceFor(test))
    .catch(stopAllDebuggers);
};
exports.runInspectObject = function runInspectObject(test) {
  return setupScript('InspectObject.js', false)
    .then(function(instance) {
      var session = instance.session,
          debuggerClient = session.debuggerClient;

      return Promise.all([
        session,
        new Promise(function(resolve, reject) {
          session.debuggerClient.once('break', function() {
            session.debuggerClient.fetchObjectId(
              session.debuggerClient,
              'inspectedObject',
              resolve
            );
          });

          instance.child.stdin.write('go!\n');
        })
      ]);
    })
    .then(expandArrayFor(test))
    .catch(stopAllDebuggers);
};

process.on('exit', function() {
  stopAllDebuggers();
});
