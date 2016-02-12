'use strict';

var co = require('co');
var fs = require('fs');
var inherits = require('util').inherits;
var convert = require('../convert.js');

var BaseAgent = require('./BaseAgent.js');

/**
 * @param {Object} config
 * @param {Object} session
 * @constructor
 */
function PageAgent(config, session) {
  BaseAgent.call(this, config, session);

  this._name = 'Page';

  this._scriptManager = session.scriptManager;

  this.registerCommand('getResourceTree', this.getResourceTree.bind(this));
  this.registerCommand('getResourceContent', this.getResourceContent.bind(this));
}
inherits(PageAgent, BaseAgent);

PageAgent.prototype.getResourceTree = function(params) {
  return co(function * () {
    var target = yield this._debuggerClient.target();
    var mainAppScript = yield this._scriptManager.realMainAppScript();
    var scripts = yield this._scriptManager.list();

    var resources = scripts.map(path => ({
      url: convert.v8NameToInspectorUrl(path),
      type: 'Script',
      mimeType: 'text/javascript'
    }));

    return {
      frameTree: {
        frame: {
          id: 'ni-top-frame',
          name: '<top frame>',
          url: convert.v8NameToInspectorUrl(mainAppScript),
          securityOrigin: 'node-inspector',
          loaderId: target.pid,
          mimeType: 'text/javascript',
          _isNodeInspectorScript: true
        },
        resources: resources
      }
    };
  }.bind(this));
};

PageAgent.prototype.getResourceContent = function(params) {
  return co(function * () {
    var content;

    // When running REPL, main application file is null
    // and node inspector returns an empty string to the front-end.
    // However, front-end still asks for resource content.
    // Let's return a descriptive comment then.
    if (params.url === '')
      content =
        '// There is no main module loaded in node.\n' +
        '// This is expected when you are debugging node\'s interactive REPL console.';
    else
      content = yield this._scriptManager.load(params.url);

    return {
      content: content
    };
  }.bind(this));
};

module.exports = PageAgent;
module.exports.PageAgent = PageAgent;
