'use strict';

var co = require('co');
var fs = require('mz/fs');
var rimraf = require('rimraf');
var expect = require('chai').expect;
var path = require('path');
var tree = require('./helpers/fs-tree');
var SessionStub = require('./helpers/SessionStub.js');
var ScriptManager = require('../lib/ScriptManager.js');

var TEMP_DIR = path.join(__dirname, 'work');

var rmrf = (dir) => new Promise((resolve, reject) =>
                    rimraf(dir, (error, result) =>
                    (error ? reject(error) : resolve(result))));

describe('ScriptManager', () => {
  var manager;
  var debuggerClient;
  var realMainAppScript = 'folder' + path.sep + 'App.js';
  var mainAppScript = 'folder' + path.sep + 'app.js';

  beforeEach(() => {
    var session = new SessionStub()
    manager = new ScriptManager({}, session);
    debuggerClient = session.debuggerClient;
  });

  afterEach(() => deleteTemps());

  describe('add()', () => {
    var _internal = {
      name: 'test.js',
      id: 32,
      lineOffset: 1,
      columnOffset: 2,
      source: 'a'
    };

    var _external = {
      name: '/test.js',
      id: 32,
      lineOffset: 1,
      columnOffset: 2,
      source: 'a'
    };

    var base = {
      scriptId: '32',
      startLine: 1,
      startColumn: 2,
      sourceMapURL: null
    };

    var external = Object.assign({
      name: '/test.js',
      url: 'file:///test.js',
      isInternalScript: false
    }, base);

    var internal = Object.assign({
      name: 'test.js',
      url: 'test.js',
      isInternalScript: true
    }, base);

    it('should add new internal script to cache', () => {
      debuggerClient.target = () => Promise.resolve({});
      return co(function * () {
        yield manager.add(_internal);

        expect(manager.get('32')).to.have.keys(internal);
        expect(manager.find('test.js')).to.have.keys(internal);
      });
    });

    it('should add new external script to cache', () => {
      debuggerClient.target = () => Promise.resolve({});
      return co(function * () {
        yield manager.add(_external);

        expect(manager.get('32')).to.have.keys(external);
        expect(manager.find('file:///test.js')).to.have.keys(external);
      });
    });

    it('should not add hidden script to cache', () => {
      debuggerClient.target = () => Promise.resolve({});
      manager.config.hidden = [/test/];
      return co(function * () {
        yield manager.add(_external);

        expect(manager.get('32')).to.equal(undefined);
        expect(manager.find('file:///test.js')).to.equal(undefined);
      });
    });

    it('should add hidden main script to cache', () => {
      debuggerClient.target = () => Promise.resolve({
        filename: '/test.js'
      });
      manager._hidden = [/test/];
      return co(function * () {
        yield manager.add(_external);

        expect(manager.get('32')).to.have.keys(external);
        expect(manager.find('file:///test.js')).to.have.keys(external);
      });
    });
  });

  describe('get()', () => {
    it('returns stored source', () => {
      manager._scripts.set(23, 'a-source');
      expect(manager.get('23')).to.equal('a-source');
    });

    it('returns undefined for unknown id', () => {
      expect(manager.get('unknown-id')).to.equal(undefined);
    });
  });

  describe('reset()', () => {
    it('removes all stored scripts', () => {
      manager._scripts.set(23, 'a-source');
      manager.reset();
      expect(manager.get('23')).to.equal(undefined);
    });
  });

  describe('mainAppScript()', () => {
    it('should return "" if there is no filename', () => {
      debuggerClient.target = () => Promise.resolve({});
      return co(function * () {
        var name = yield manager.mainAppScript();
        expect(name).to.be.equal('');
      });
    });

    it('should return name if file exists', () => {
      debuggerClient.target = () => Promise.resolve({
        filename: `${TEMP_DIR}/test`
      });
      return co(function * () {
        yield tree(TEMP_DIR, {'test': true});
        var name = yield manager.mainAppScript();
        expect(name).to.be.equal(`${TEMP_DIR}/test`);
      });
    });

    it('should return name.js if file doesn`t exists and doesn`t finishes on ".js"', () => {
      debuggerClient.target = () => Promise.resolve({
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
        debuggerClient.target = () => Promise.resolve({
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
        debuggerClient.target = () => Promise.resolve({
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
});


function deleteTemps() {
  return co(function * () {
    if (yield fs.exists(TEMP_DIR))
      yield rmrf(TEMP_DIR);
  });
}
