var expect = require('chai').expect,
    ScriptManager = require('../lib/ScriptManager').ScriptManager;

describe('ScriptManager', function() {

  describe('findSourceByID()', function() {
    var manager;

    beforeEach(function() {
      manager = new ScriptManager();
    });

    it('returns stored source', function() {
      manager._sources['id'] = 'a-source';
      expect(manager.findScriptByID('id')).to.equal('a-source');
    });

    it('returns undefined for unknown id', function() {
      expect(manager.findScriptByID('unknown-id')).to.be.undefined;
    });
  });
});
