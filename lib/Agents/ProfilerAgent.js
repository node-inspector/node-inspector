var inherits = require('util').inherits;
var BaseAgent = require('./BaseAgent.js');

var _injection = require.resolve('../Injections/ProfilerAgent');
/**
 * @param {{inject}} config
 * @param {DebuggerClient} debuggerClient
 * @param {InjectorClient} injectorClient
 * @param {FrontendClient} frontendClient
*/
function ProfilerAgent(config, session) {
  BaseAgent.call(this, config, session);

  this._name = 'Profiler';
  this._inject = true;
  this._injectorClient = session.injectorClient;

  try {
    this._inject = !(config.inject === false || config.inject.console === false);
  } catch (e) {}

  this.registerEvent('consoleProfileStarted');
  this.registerEvent('consoleProfileFinished');

  this.registerCommand('start');
  this.registerCommand('stop');

  this._ready = this._inject
    ? this._injection()
    : Promise.reject(`${this._name} agent disabled.`);
}
inherits(ProfilerAgent, BaseAgent);

ProfilerAgent.prototype._injection = function(injected) {
  var injection = function(require, debug, options) {
    require(options.injection)(require, debug, options);
  };
  var options = {
    injection: _injection,
    'v8-profiler': require.resolve('v8-profiler')
  };

  return this._injectorClient.injection(injection, options);
};

module.exports = ProfilerAgent;
module.exports.ProfilerAgent = ProfilerAgent;
