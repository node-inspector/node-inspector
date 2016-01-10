var injection = require.resolve('../Injections/ProfilerAgent');
/**
 * @param {{inject}} config
 * @param {DebuggerClient} debuggerClient
 * @param {InjectorClient} injectorClient
 * @param {FrontendClient} frontendClient
*/
function ProfilerAgent(config, session) {
  try {
    this._noInject = config.inject === false || config.inject.profiles === false;
  } catch (e) {
    this._noInject = false;
  }

  this._injected = false;
  this._debuggerClient = session.debuggerClient;
  this._injectorClient = session.injectorClient;
  this._frontendClient = session.frontendClient;

  this._translateCommandToInjection(
    'start',
    'stop'
  );

  if (!this._noInject) this._inject();
}

ProfilerAgent.prototype._inject = function(injected) {
  this._injectorClient.injection(
    function(require, debug, options) {
      require(options.injection)(require, debug, options);
    },
    {
      injection: injection,
      'v8-profiler': require.resolve('v8-profiler')
    },
    function(error, result) {
      this._injected = !error;

      this._translateEventToFrontend(
        'consoleProfileStarted',
        'consoleProfileFinished'
      );

      if (error) return this._frontendClient.sendLogToConsole('error', error.message || error);
    }.bind(this)
  );
};

/**
 * @param {...string} eventNames
*/
ProfilerAgent.prototype._translateEventToFrontend = function(eventNames) {
  Array.prototype.forEach.call(arguments, function(event) {
    event = 'Profiler.' + event;
    this._debuggerClient.on(event, function(message) {
      this._frontendClient.sendEvent(event, message);
    }.bind(this));
  }, this);
};

/**
 * @param {...string} commandNames
*/
ProfilerAgent.prototype._translateCommandToInjection = function(commandNames) {
  Array.prototype.forEach.call(arguments, function(command) {
    this[command] = function(params, done) {
      this._debuggerClient.request('Profiler.' + command, params, done);
    };
  }, this);
};

ProfilerAgent.prototype.enable = function(params, done) {
  done();
};

exports.ProfilerAgent = ProfilerAgent;
