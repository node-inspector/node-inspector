var expect = require('chai').expect,
    path = require('path'),
    SessionStub = require('./helpers/SessionStub.js'),
    ScriptManager = require('../lib/ScriptManager').ScriptManager;

describe('ScriptManager', function() {
  var manager;
  var realMainAppScript = 'folder' + path.sep + 'App.js';
  var mainAppScript = 'folder' + path.sep + 'app.js';

  beforeEach(function() {
    manager = new ScriptManager({}, new SessionStub());
    manager.realMainAppScript = realMainAppScript;
    manager.mainAppScript = mainAppScript;
  });


  describe('findSourceByID()', function() {
    it('returns stored source', function() {
      manager._sources['id'] = 'a-source';
      expect(manager.findScriptByID('id')).to.equal('a-source');
    });

    it('returns undefined for unknown id', function() {
      expect(manager.findScriptByID('unknown-id')).to.equal(undefined);
    });
  });

  describe('reset()', function() {
    it('removes all stored scripts', function() {
      manager._sources['id'] = 'a-source';
      manager.reset();
      expect(manager.findScriptByID('id')).to.equal(undefined);
    });
  });

  describe('normalizeName()', function() {
    if (process.platform == 'win32') {
      it('returns case sensitive name for main script on Windows', function() {
        var name = manager.normalizeName(realMainAppScript);
        expect(name).to.equal(mainAppScript);
      });
    } else {
      it('returns unchanged name for main script on Linux', function() {
        var name = manager.normalizeName('folder/app.js');
        var normalized_name = manager.normalizeName(realMainAppScript);
        expect(normalized_name).to.equal(realMainAppScript);
      });
    }

    it('returns unchanged name for not main scripts', function() {
      var name = 'folder/app1.js';
      var normalized_name = manager.normalizeName(name);
      expect(normalized_name).to.equal(name);
    });
  });
});
