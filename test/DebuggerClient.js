var expect = require('chai').expect,
  async = require('async'),
  launcher = require('./helpers/launcher.js'),
  DebuggerClient = require('../lib/DebuggerClient.js').DebuggerClient;

describe('DebuggerClient', function() {
  after(launcher.stopAllDebuggers);
  var client, child, mainScript;

  describe('evaluteGlobal', function() {
    before(setupConnectedDebuggerClient);
    after(launcher.stopAllDebuggers);

    it('returns full value of a long string', function(done) {
      var longStr = '';
      for (var i = 0; i < 100; i++) longStr += i;

      client.evaluateGlobal(
        '"' + longStr + '"',
        function(err, result) {
          if (err) throw err;
          expect(result).to.equal(longStr);
          done();
        }
      );
    });
  });

  describe('isRunning', function() {
    before(function(done) {
      setupConnectedDebuggerClient(true, done);
    });
    after(launcher.stopAllDebuggers);

    it('is updated on connect in --debug-brk mode', function(done) {
      expect(client.isRunning, 'isRunning').to.equal(false);
      done();
    });

    it('is updated on break', function(done) {
      client.on('break', function() {
        expect(client.isRunning, 'isRunning').to.equal(false);
        done();
      });

      client.request('continue', undefined, function() {
        child.stdin.write('pause\n');
      });
    });
  });

  describe('request', function() {
    launcher.stopAllDebuggersAfterEachTest();

    it('sends correct data length', function(done) {
      setupConnectedDebuggerClient(function() {
        getMainScriptId(function(scriptId) {
          client.request(
            'changelive',
            {
              script_id: scriptId,
              // non-ascii text has different length as String than as Buffer
              new_source: '//тест',
              preview_only: false,
            },
            function(err/*, response*/) {
              // the test passes when the request returns success
              done(err);
            }
          );
        });
      });
    });
  });

  function setupConnectedDebuggerClient(breakOnStart, done) {
    if (done === undefined && typeof breakOnStart === 'function') {
      done = breakOnStart;
      breakOnStart = false;
    }

    mainScript = 'LiveEdit.js';
    launcher.startDebugger(
      mainScript,
      breakOnStart,
      function(childProcess, debuggerClient) {
        client = debuggerClient;
        child = childProcess;
        done();
      }
    );
  }

  function getMainScriptId(done) {
    client.request(
      'scripts',
      {
        includeSource: false,
        types: 4,
        filter: 'LiveEdit.js'
      },
      function(err, result) {
        if (err) throw err;
        done(result[0].id);
      }
    );
  }
});
