'use strict';

var co = require('co');
var fs = require('fs');
var rimraf = require('rimraf');
var promisify = require('bluebird').promisify;
var expect = require('chai').expect;
var path = require('path');
var tree = require('./helpers/fs-tree');
var SessionStub = require('./helpers/SessionStub.js');
var ScriptManager = require('../lib/ScriptManager');

var TEMP_DIR = path.join(__dirname, 'work');

var rmrf = promisify(rimraf);
var exists = path => new Promise(resolve => fs.exists(path, resolve));

describe('ScriptManager', () => {
  var manager;
  var realMainAppScript = 'folder' + path.sep + 'App.js';
  var mainAppScript = 'folder' + path.sep + 'app.js';

  beforeEach(() => {
    manager = new ScriptManager({}, new SessionStub());
  });

  afterEach(() => deleteTemps());


  describe('findSourceByID()', () => {
    it('returns stored source', () => {
      manager._sources['id'] = 'a-source';
      expect(manager.findScriptByID('id')).to.equal('a-source');
    });

    it('returns undefined for unknown id', () => {
      expect(manager.findScriptByID('unknown-id')).to.equal(undefined);
    });
  });

  describe('resolveScriptById()', () => {
    it('returns stored source', () => {
      return co(function * () {
        manager._sources['id'] = 'a-source';
        var result = yield manager.resolveScriptById('id')

        expect(result).to.equal('a-source');
      });
    });

    it('requires script from app for unknown id', () => {
      manager._debuggerClient.target = () => Promise.resolve({
        filename: `${TEMP_DIR}/test`
      });

      return co(function * () {
        manager._debuggerClient.request = function(command, attributes) {
          return new Promise(resolve => {
            if (command == 'scripts' && attributes.filter == 'unknown-id') {
              resolve([{
                id: 3,
                name:'required-id',
                lineOffset: 1,
                columnOffset: 1
              }]);
            }
          });
        };

        var result = yield manager.resolveScriptById('unknown-id');

        expect(result).to.deep.equal({
          isInternalScript: true,
          scriptId: '3',
          url: 'required-id',
          startLine: 1,
          startColumn: 1
        });
      });
    });
  });

  describe('reset()', () => {
    it('removes all stored scripts', () => {
      manager._sources['id'] = 'a-source';
      manager.reset();
      expect(manager.findScriptByID('id')).to.equal(undefined);
    });
  });

  describe('mainAppScript()', () => {
    it('should return "" if there is no filename', () => {
      manager._debuggerClient.target = () => Promise.resolve({});
      return co(function * () {
        var name = yield manager.mainAppScript();
        expect(name).to.be.equal('');
      });
    });

    it('should return name if file exists', () => {
      manager._debuggerClient.target = () => Promise.resolve({
        filename: `${TEMP_DIR}/test`
      });
      return co(function * () {
        yield tree(TEMP_DIR, {'test': true});
        var name = yield manager.mainAppScript();
        expect(name).to.be.equal(`${TEMP_DIR}/test`);
      });
    });

    it('should return name.js if file doesn`t exists and doesn`t finishes on ".js"', () => {
      manager._debuggerClient.target = () => Promise.resolve({
        filename: `${TEMP_DIR}/test`
      });
      return co(function * () {
        var name = yield manager.mainAppScript();
        expect(name).to.be.equal(`${TEMP_DIR}/test.js`);
      });
    });
  });

  describe('realMainAppScript()', () => {
    if (process.platform == 'win32') {
      it('should return case sensitive name on Windows', () => {
        manager._debuggerClient.target = () => Promise.resolve({
          filename: `${TEMP_DIR}/test`
        });

        return co(function * () {
          yield tree(TEMP_DIR, {'Test': true});
          var realMainAppScript = yield manager.realMainAppScript();
          expect(realMainAppScript).to.equal(`${TEMP_DIR}/Test`);
        });
      });
    } else {
      it('should be equal to mainAppScript on Linux', () => {
        manager._debuggerClient.target = () => Promise.resolve({
          filename: `${TEMP_DIR}/test`
        });

        return co(function * () {
          var mainAppScript = yield manager.mainAppScript();
          var realMainAppScript = yield manager.realMainAppScript();
          expect(mainAppScript).to.equal(realMainAppScript);
          expect(realMainAppScript).to.equal(`${TEMP_DIR}/test.js`);
        });
      });
    }
  });

  describe('normalizeName()', () => {
    if (process.platform == 'win32') {
      it('returns case sensitive name for main script on Windows', () => {
        manager._debuggerClient.target = () => Promise.resolve({
          filename: `${TEMP_DIR}/Test.js`
        });
        return co(function * () {
          var normalized_name = yield manager.normalizeName(`${TEMP_DIR}/test.js`);
          expect(normalized_name).to.equal(`${TEMP_DIR}/Test.js`);
        });
      });
    } else {
      it('returns unchanged name for main script on Linux', () => {
        manager._debuggerClient.target = () => Promise.resolve({
          filename: `${TEMP_DIR}/test.js`
        });
        return co(function * () {
          var name = yield manager.normalizeName(`file://${TEMP_DIR}/test.js`);
          expect(name).to.equal(`file://${TEMP_DIR}/test.js`);
        });
      });
    }

    it('returns unchanged name for not main scripts', () => {
      manager._debuggerClient.target = () => Promise.resolve({
        filename: `${TEMP_DIR}/test.js`
      });
      return co(function * () {
        var name = 'file:///folder/app1.js';
        var normalized_name = yield manager.normalizeName(name);
        expect(normalized_name).to.equal(name);
      });
    });
  });
});


function deleteTemps() {
  return co(function * () {
    if (yield exists(TEMP_DIR))
      yield rmrf(TEMP_DIR);
  });
}
