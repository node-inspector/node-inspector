'use strict';

var co = require('co');
var expect = require('chai').expect;
var launcher = require('./helpers/launcher.js');
var ScriptManager = require('../lib/ScriptManager.js');
var ScriptFileStorage = require('../lib/ScriptFileStorage.js');
var PageAgent = require('../lib/Agents/PageAgent.js');

var agent;
var session;
var debuggerClient;
var scriptManager;
var scriptStorage;

describe('PageAgent', () => {
  beforeEach(() => initializePage());

  describe('getResourceTree()', () => {
    it('should return valide structure', () => {
      debuggerClient.target = () => Promise.resolve({cwd: 'temp', pid: 123});
      scriptManager.realMainAppScript = () => Promise.resolve('/usr/test.js');
      scriptStorage.findAllApplicationScripts = () => Promise.resolve([
        '/usr/bin/script.js',
        '\\\\UNC\\test.js',
        'D:\\temp\\app.js'
      ]);

      return co(function * () {
        var result = yield agent.getResourceTree();
        expect(result).to.deep.equal({
          frameTree: {
            frame: {
              id: 'ni-top-frame',
              name: '<top frame>',
              url: 'file:///usr/test.js',
              securityOrigin: 'node-inspector',
              loaderId: 123,
              mimeType: 'text/javascript',
              _isNodeInspectorScript: true
            },
            resources: [{
              url: 'file:///usr/bin/script.js',
              type: 'Script',
              mimeType: 'text/javascript'
            },{
              url: 'file://UNC/test.js',
              type: 'Script',
              mimeType: 'text/javascript'
            },{
              url: 'file:///D:/temp/app.js',
              type: 'Script',
              mimeType: 'text/javascript'
            }]
          }
        });
      });
    });

    it('should rethrow debuggerClient errors', () => {
      debuggerClient.target = () => Promise.reject(new Error('DebuggerClientError'));

      return co(function * () {
        try {
          var result = yield agent.getResourceTree();
        } catch (e) {
          expect(e.message).to.be.equal('DebuggerClientError');
        }
      });
    });

    it('should rethrow scriptManager errors', () => {
      debuggerClient.target = () => Promise.resolve({cwd: 'temp', pid: 123});
      scriptManager.realMainAppScript = () => Promise.reject(new Error('ScriptManagerError'));

      return co(function * () {
        try {
          var result = yield agent.getResourceTree();
        } catch (e) {
          expect(e.message).to.be.equal('ScriptManagerError');
        }
      });
    });

    it('should rethrow scriptStorage errors', () => {
      debuggerClient.target = () => Promise.resolve({cwd: 'temp', pid: 123});
      scriptManager.realMainAppScript = () => Promise.resolve('/usr/test.js');
      scriptStorage.findAllApplicationScripts = () => Promise.reject(new Error('ScriptStorageError'));

      return co(function * () {
        try {
          var result = yield agent.getResourceTree();
        } catch (e) {
          expect(e.message).to.be.equal('ScriptStorageError');
        }
      });
    });
  });

  describe('getResourceContent()', () => {
    it('should return valide structure', () => {
      scriptManager.normalizeName = url => Promise.resolve(url);
      scriptStorage.load = () => Promise.resolve('abc');

      return co(function * () {
        var result = yield agent.getResourceContent({
          url: '/usr/test.js'
        });
        expect(result).to.be.deep.equal({content: 'abc'});
      });
    });

    it('should return comment for repl mode', () => {
      scriptManager.normalizeName = url => Promise.resolve(url);
      scriptStorage.load = () => Promise.resolve('abc');

      return co(function * () {
        var result = yield agent.getResourceContent({url: ''});
        expect(result).to.be.deep.equal({content:
          '// There is no main module loaded in node.\n' +
          '// This is expected when you are debugging node\'s interactive REPL console.'});
      });
    });

    it('should rethrow scriptManager errors', () => {
      scriptManager.normalizeName = () => Promise.reject(new Error('ScriptManagerError'));

      return co(function * () {
        try {
          var result = yield agent.getResourceContent({});
        } catch (e) {
          expect(e.message).to.be.equal('ScriptManagerError');
        }
      });
    });

    it('should rethrow scriptStorage errors', () => {
      scriptManager.normalizeName = url => Promise.resolve(url);
      scriptStorage.load = () => Promise.reject(new Error('ScriptStorageError'));

      return co(function * () {
        try {
          var result = yield agent.getResourceContent({url: 'test.js'});
        } catch (e) {
          expect(e.message).to.be.equal('ScriptStorageError');
        }
      });
    });
  });

});

function expand(instance) {
  session = instance.session;
  debuggerClient = session.debuggerClient;
}

function initializePage() {
  return co(function * () {
    yield launcher.runCommandlet().then(expand);
    scriptManager = session.scriptManager = new ScriptManager({}, session);
    scriptStorage = session.scriptStorage = new ScriptFileStorage({}, session);
    agent = new PageAgent({}, session);
  });
}
