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
    
    var agent;

    function setupDebugScenario(done) {
      launcher.runOnBreakInFunction(function(session) {
        session.scriptManager = new ScriptManager({}, session);

        agent = new PageAgent({}, session);
        done();
      });
    }
  });
});
