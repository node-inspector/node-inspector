var convert = require('./convert');

var injection = require.resolve('./Injections/ConsoleAgent');

/**
 * @param {Object} config
 * @param {DebuggerClient} debuggerClient
 * @param {FrontendClient} frontendClient
 * @param {InjectorClient} injectorClient
 * @param {ConsoleClient} consoleClient
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
  this._consoleClient = session.consoleClient;
  this._translateCommandToInjection(
    'clearMessages'
  );

  if (!this._noInject) this._injectorClient.on('inject', this._inject.bind(this));
}

ConsoleAgent.prototype._inject = function(injected) {
  if (!injected) return;

  this._translateEventToFrontend(
    'messageAdded',
    'messagesCleared'
  );

  this._injectorClient.injection(
    function(require, debug, options) {
      require(options.injection)(require, debug, options);
    },
    {
      injection: injection
    },
    function(error, result) {
      this._injected = !error;

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
    this._debuggerClient.registerDebuggerEventHandlers(event);
    this._debuggerClient.on(event, function(message) {
      if (event == 'Console.messageAdded') {
        message.message.parameters = message.message.parameters.map(function(ref) {
          this._consoleClient.convertHandleToConsoleHandle(ref, message.message.id);
          return convert.v8ResultToInspectorResult(ref);
        }, this);
      }
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
