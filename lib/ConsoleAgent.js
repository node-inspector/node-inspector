var convert = require('./convert');

var injection = require.resolve('./Injections/ConsoleAgent');

/**
 * @param {Object} config
 * @param {DebuggerClient} debuggerClient
 * @param {FrontendClient} frontendClient
 * @param {InjectorClient} injectorClient
 * @constructor
 */
function ConsoleAgent(config, session) {
  try {
    this._noInject = config.inject === false || config.inject.console === false;
  } catch (e) {
    this._noInject = false;
  }

  this._injected = false;
  this._debuggerClient = session.debuggerClient;
  this._frontendClient = session.frontendClient;
  this._injectorClient = session.injectorClient;
  this._translateCommandToInjection(
    'clearMessages'
  );

  if (!this._noInject) this._inject();
}

ConsoleAgent.prototype._inject = function() {
  this._injectorClient.injection(
    function(require, debug, options) {
      require(options.injection)(require, debug, options);
    },
    {
      injection: injection
    },
    function(error, result) {
      this._injected = !error;

      this._translateEventToFrontend(
        'messageAdded',
        'messagesCleared'
      );

      if (error) return this._frontendClient.sendLogToConsole('error', error.message || error);
    }.bind(this)
  );
};

/**
 * @param {...string} eventNames
*/
ConsoleAgent.prototype._translateEventToFrontend = function(eventNames) {
  Array.prototype.forEach.call(arguments, function(event) {
    event = 'Console.' + event;
    this._debuggerClient.on(event, function(message) {
      this._frontendClient.sendEvent(event, message);
    }.bind(this));
  }, this);
};

/**
 * @param {...string} commandNames
*/
ConsoleAgent.prototype._translateCommandToInjection = function(commandNames) {
  Array.prototype.forEach.call(arguments, function(command) {
    this[command] = function(params, done) {
      this._debuggerClient.request('Console.' + command, params, done);
    };
  }, this);
};

module.exports.ConsoleAgent = ConsoleAgent;
