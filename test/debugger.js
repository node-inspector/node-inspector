var launcher = require('./helpers/launcher.js');
  
describe('debugger', function() {
  var client;
  before(setupConnectedDebuggerClient);
  after(launcher.stopAllDebuggers);
    
  it('should send correct data length', function(done) {
    client._conn.request(
      'changelive',
      { 
        arguments: {
          script_id: 2,
          new_source: '//тест',
          preview_only: false,
          maxStringLength: 10000
        }
      },
      function (response) { // callback
        if (response.success) {
          done();
        } else {
          done(response);
        }
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
