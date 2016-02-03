'use strict';

var inherits = require('util').inherits;
var BaseAgent = require('./BaseAgent.js');

var _injection = require.resolve('../Injections/RuntimeAgent.js');

/**
 * @param {Object} config
 * @param {DebuggerClient} debuggerClient
 * @param {FrontendClient} frontendClient
 * @param {HeapProfilerClient} heapProfilerClient
 * @constructor
 */
function RuntimeAgent(config, session) {
  BaseAgent.call(this, config, session);

  this._name = 'Runtime';
  this._inject = true;
  this._injectorClient = session.injectorClient;

  this.registerEvent('executionContextCreated');

  this.registerCommand('enable', this.enable.bind(this));
  this.registerCommand('evaluate');
  this.registerCommand('callFunctionOn');
  this.registerCommand('getProperties');
  this.registerCommand('releaseObject');
  this.registerCommand('releaseObjectGroup');

  this._ready = this._injection();
}
inherits(RuntimeAgent, BaseAgent);

RuntimeAgent.prototype.enable = function(params) {
  this.emitEvent('executionContextCreated', {
    context: {
      id: 1,
      isPageContext: true,
      name: '<top frame>',
      origin: '<top frame>',
      frameId: 'ni-top-frame'
    }
  });
  return Promise.resolve();
};

RuntimeAgent.prototype._injection = function() {
  var injection = function(require, debug, options) {
    require(options.injection)(require, debug, options);
  };
  var options = { injection: _injection };

  return this._injectorClient.injection(injection, options);
};

module.exports = RuntimeAgent;
module.exports.RuntimeAgent = RuntimeAgent;
