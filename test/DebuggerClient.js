var expect = require('chai').expect,
  async = require('async'),
  launcher = require('./helpers/launcher.js'),
  DebuggerClient = require('../lib/DebuggerClient.js').DebuggerClient;

describe('DebuggerClient', function() {
  after(launcher.stopAllDebuggers);

  describe('evaluteGlobal', function() {
    var client;
    before(setupConnectedDebuggerClient);

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
          done();
        }
      );
    }
  });

});
