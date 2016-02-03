'use strict';

var inherits = require('util').inherits;
var BaseAgent = require('./BaseAgent.js');

var _injection = require.resolve('../Injections/ConsoleAgent');

/**
 * @param {Object} config
 * @param {DebuggerClient} debuggerClient
 * @param {FrontendClient} frontendClient
 * @param {InjectorClient} injectorClient
 * @constructor
 */
function ConsoleAgent(config, session) {
  BaseAgent.call(this, config, session);

  this._name = 'Console';
  this._inject = true;
  this._injectorClient = session.injectorClient;

  try {
    this._inject = !(config.inject === false || config.inject.console === false);
  } catch (e) {}

  this.registerEvent('messageAdded');
  this.registerEvent('messagesCleared');

  this.registerCommand('clearMessages');

  this._ready = this._inject
    ? this._injection()
    : Promise.reject(`${this._name} agent disabled.`);
}
inherits(ConsoleAgent, BaseAgent);

ConsoleAgent.prototype._injection = function() {
  var injection = function(require, debug, options) {
    require(options.injection)(require, debug, options);
  };
  var options = { injection: _injection };

  return this._injectorClient.injection(injection, options);
};

module.exports = ConsoleAgent;
module.exports.ConsoleAgent = ConsoleAgent;
