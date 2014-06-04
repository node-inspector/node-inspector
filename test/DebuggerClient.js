var expect = require('chai').expect,
  async = require('async'),
  launcher = require('./helpers/launcher.js'),
  DebuggerClient = require('../lib/DebuggerClient.js').DebuggerClient;

describe('DebuggerClient', function() {
  after(launcher.stopAllDebuggers);

  describe('evaluteGlobal', function() {
    var client, child;
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

    function setupConnectedDebuggerClient(done) {
      launcher.startDebugger(
        'LiveEdit.js',
        function(childProcess, debuggerClient) {
          client = debuggerClient;
          child = childProcess;
          done();
        }
      );
    }
  });

  describe('isRunning', function() {
    var debuggerClient, childProcess;

    before(setupDebuggerClient);
    after(launcher.stopAllDebuggers);

    it('is updated on connect in --debug-brk mode', function(done) {
      expect(debuggerClient.isRunning, 'isRunning').to.equal(false);
      done();
    });

    it('is updated on break', function(done) {
      debuggerClient.on('break', function() {
        expect(debuggerClient.isRunning, 'isRunning').to.equal(false);
        done();
      });

      debuggerClient.request('continue', undefined, function() {
        childProcess.stdin.write('pause\n');
      });
    });

    function setupDebuggerClient(done) {
      launcher.stopAllDebuggers();
      launcher.startDebugger(
        'LiveEdit.js',
        true,
        function(child, client) {
          debuggerClient = client;
          childProcess = child;
          done();
        }
      );
    }
  });

  describe('request', function() {
    launcher.stopAllDebuggersAfterEachTest();

    it('sends correct data length', function(done) {
      setupConnectedDebuggerClient(function(client, scriptId) {
        client.request(
          'changelive',
          {
            script_id: scriptId,
            // non-ascii text has different length as String than as Buffer
            new_source: '//тест',
            preview_only: false,
          },
          function(err/*, response*/) {
            // the test passes when the request returned with success
            done(err);
          }
        );
      });
    });

    function setupConnectedDebuggerClient(done) {
      launcher.startDebugger(
        'LiveEdit.js',
        function(childProcess, debuggerClient) {
          debuggerClient.request(
            'scripts',
            {
              includeSource: false,
              types: 4,
              filter: 'LiveEdit.js'
            },
            function(err, result) {
              if (err) throw err;
              done(debuggerClient, result[0].id);
            }
          );
        }
      );
    }
  });
});
