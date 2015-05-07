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

  describe('resolveScriptById()', function() {
    it('returns stored source', function(done) {
      manager._sources['id'] = 'a-source';
      manager.resolveScriptById('id', function(err, result) {
        expect(err).to.equal(null);
        expect(result).to.equal('a-source');
        done();
      });
    });

    it('requires script from app for unknown id', function(done) {
      manager._debuggerClient.request = function(command, attributes, cb) {
        if (command == 'scripts' && attributes.filter == 'unknown-id') {
          cb(null, [{
            id: 3,
            name:'required-id',
            lineOffset: 1,
            columnOffset: 1
          }]);
        }
      };

      manager.resolveScriptById('unknown-id', function(err, result) {
        expect(err).to.equal(null);
        expect(result).to.deep.equal({
          scriptId: '3',
          url: 'required-id',
          startLine: 1,
          startColumn: 1
        });
        done();
      });
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
