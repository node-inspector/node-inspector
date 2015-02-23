var semver = require('semver');
/**
 * @param {{inject}} config
 * @param {DebuggerClient} debuggerClient
 * @param {InjectorClient} injectorClient
 * @param {FrontendClient} frontendClient
*/
function ProfilerAgent(config, session) {
  this._noInject = config.inject === false;
  this._injected = false;
  this._debuggerClient = session.debuggerClient;
  this._injectorClient = session.injectorClient;
  this._frontendClient = session.frontendClient;

  this._translateCommandToInjection(
    'start',
    'stop'
  );

  if (!this._noInject) this._injectorClient.on('inject', this._inject.bind(this));
}

ProfilerAgent.prototype._inject = function(injected) {
  if (!injected) return;
  
  this._translateEventToFrontend(
    'consoleProfileStarted',
    'consoleProfileFinished'
  );

  this._injectorClient.injection(
    this.injection,
    {
      'v8-profiler': require.resolve('v8-profiler')
    },
    function(error, result) {
      this._injected = !error;
      
      if (error) this._frontendClient.sendLogToConsole('error', error.message || error);
    }.bind(this)
  );
};

/**
 * @param {...string} eventNames
*/
ProfilerAgent.prototype._translateEventToFrontend = function(eventNames) {
  Array.prototype.forEach.call(arguments, function(event) {
    event = 'Profiler.' + event;
    this._debuggerClient.registerDebuggerEventHandlers(event);
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

  if (this._debuggerClient.targetNodeVersion) {
    this._checkCompatibility();
  } else {
    this._debuggerClient.on('connect', this._checkCompatibility.bind(this));
  }
};

ProfilerAgent.prototype._checkCompatibility = function() {
  var version = this._debuggerClient.targetNodeVersion;
  var isCompatible = ProfilerAgent.nodeVersionIsCompatible(version);
  if (!isCompatible) {
    this._frontendClient.sendLogToConsole(
      'warning',
      'Your Node version (' + version + ') has a partial support of profiler.\n' +
      'The stack frames tree doesn\'t show all stack frames due to low sampling rate.\n' +
      'The profiling data is incomplete and may show misleading results.\n' +
      'Update Node to v0.11.13 or newer to get full support.'
    );
  }
};

ProfilerAgent.prototype.injection = function(require, debug, options) {
  var path = require('path'),
      profiler = require(options['v8-profiler']);

  var profilingEnabled = false;

  debug.register('Profiler.start', function(request, response) {
    profiler.startProfiling();
    profilingEnabled = true;
  });

  debug.register('Profiler.stop', function(request, response) {
    var profile = profiler.stopProfiling();
    profilingEnabled = false;
    response.body = {profile: profile};
    process.nextTick(function() {
      profile.delete();
    });
  });

  debug.on('close', function() {
    if (profilingEnabled) profiler.stopProfiling();

    profiler.deleteAllProfiles();
  });
};

ProfilerAgent.nodeVersionIsCompatible = function(version) {
  return semver.satisfies(version, '>=0.11.13');
};

exports.ProfilerAgent = ProfilerAgent;
