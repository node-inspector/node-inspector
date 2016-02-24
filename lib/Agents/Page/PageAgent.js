'use strict';

const co = require('co');
const convert = require('../../convert.js');

class PageAgent extends require('../BaseAgent') {
  /**
   * @param {Config} config
   * @param {Session} session
   */
  constructor(config, session) {
    super('Page', config, session);

    this.registerCommand('getResourceTree', this.getResourceTree.bind(this));
    this.registerCommand('getResourceContent', this.getResourceContent.bind(this));
  }

  getResourceTree(params) {
    return co(function * () {
      const target = yield this.session.debugger.target();
      const mainAppScript = yield this.session.scripts.realMainAppScript();
      const scripts = yield this.session.scripts.list();

      const resources = scripts.map(path => ({
        url: convert.pathToUrl(path),
        type: 'Script',
        mimeType: 'text/javascript'
      }));

      return {
        frameTree: {
          frame: {
            id: 'ni-top-frame',
            name: '<top frame>',
            url: convert.pathToUrl(mainAppScript),
            securityOrigin: 'node-inspector',
            loaderId: target.pid,
            mimeType: 'text/javascript',
            _isNodeInspectorScript: true
          },
          resources: resources
        }
      };
    }.bind(this));
  }

  getResourceContent(params) {
    return co(function * () {
      // When running REPL, main application file is null
      // and node inspector returns an empty string to the front-end.
      // However, front-end still asks for resource content.
      // Let's return a descriptive comment then.
      return {
        content: params.url
        ? yield this.session.scripts.load(params.url)
        : '// There is no main module loaded in node.\n' +
          '// This is expected when you are debugging node\'s interactive REPL console.'
      };
    }.bind(this));
  }
}

module.exports = PageAgent;
