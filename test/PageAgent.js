var expect = require('chai').expect,
  launcher = require('./helpers/launcher.js'),
  ScriptManager = require('../lib/ScriptManager.js').ScriptManager,
  PageAgent = require('../lib/PageAgent.js').PageAgent;

describe('PageAgent', function() {
  after(launcher.stopAllDebuggers);
  
  describe('getResourceContent()', function() {
    before(setupDebugScenario);
    
    it('does not throw an error', function(done) {
      expect(function() { agent.getResourceContent({
        url: 'index.js'
      }, done); }).to.not.throw();
    });
    
    var debuggerClient, agent;

    function setupDebugScenario(done) {
      launcher.runOnBreakInFunction(function(client) {
        debuggerClient = client;
        var scriptManager = new ScriptManager({}, null, debuggerClient);

        agent = new PageAgent({}, debuggerClient, scriptManager);
        done();
      });
    }
  });
});
