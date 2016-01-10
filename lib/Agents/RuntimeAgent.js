var injection = require.resolve('../Injections/RuntimeAgent.js');

/**
 * @param {Object} config
 * @param {DebuggerClient} debuggerClient
 * @param {FrontendClient} frontendClient
 * @param {HeapProfilerClient} heapProfilerClient
 * @constructor
 */
function RuntimeAgent(config, session) {
  try {
    this._noInject = config.inject === false || config.inject.runtime === false;
  } catch (e) {
    this._noInject = false;
  }

  this._injected = false;
  this._debuggerClient = session.debuggerClient;
  this._frontendClient = session.frontendClient;
  this._injectorClient = session.injectorClient;

  this._translateCommandToInjection(
    'evaluate',
    'callFunctionOn',
    'getProperties',
    'releaseObject',
    'releaseObjectGroup'
  );

  if (!this._noInject) this._inject();
}

RuntimeAgent.prototype._inject = function() {
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
RuntimeAgent.prototype._translateEventToFrontend = function(eventNames) {
  Array.prototype.forEach.call(arguments, function(event) {
    event = 'Runtime.' + event;
    this._debuggerClient.registerDebuggerEventHandlers(event);
    this._debuggerClient.on(event, function(message) {
      this._frontendClient.sendEvent(event, message);
    }.bind(this));
  }, this);
};

/**
 * @param {...string} commandNames
*/
RuntimeAgent.prototype._translateCommandToInjection = function(commandNames) {
  Array.prototype.forEach.call(arguments, function(command) {
    this[command] = function(params, done) {
      this._debuggerClient.request('Runtime.' + command, params, done);
    };
  }, this);
};

RuntimeAgent.prototype.enable = function(params, done) {
  done();
  //Relative to WorkerRuntimeAgent::enable in core/inspector/WorkerRuntimeAgent.cpp
  this._frontendClient.sendEvent('Runtime.executionContextCreated', {
    context: {
      id: 1,
      isPageContext: true,
      name: '',
      origin: ''
    }
  });
};

exports.RuntimeAgent = RuntimeAgent;
