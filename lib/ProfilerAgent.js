var semver = require('semver');
/**
 * @param {{inject}} config
 * @param {DebuggerClient} debuggerClient
 * @param {InjectorClient} injectorClient
 * @param {FrontendClient} frontendClient
*/
function ProfilerAgent(config, debuggerClient, injectorClient, frontendClient) {
  this._noInject = config.inject === false;
  this._injected = false;
  this._debuggerClient = debuggerClient;
  this._injectorClient = injectorClient;
  this._frontendClient = frontendClient;

  this._translateCommandToInjection(
    'start',
    'stop',
    'getCPUProfile',
    'removeProfile',
    'clearProfiles',
    'getProfileHeaders'
  );

  if (!this._noInject) this._injectorClient.on('inject', this._inject.bind(this));
}

ProfilerAgent.prototype._inject = function(injected) {
  if (!injected) return;
  
  this._translateEventToFrontend(
    'addProfileHeader',
    'setRecordingProfile'
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
  
  var version = this._debuggerClient.targetNodeVersion;
  var isCompatible = ProfilerAgent.nodeVersionIsCompatible(version);
  if (!isCompatible) {
    this._frontendClient.sendLogToConsole(  
      'warning',
      'Your Node version (' + version + ') has a partial support of profiler.\n' +
      'The stack frames tree doesn\'t show all stack frames due to low sampling rate.\n' +
      'The profiling data is incomplete and may show misleading results.\n' +
      'Update Node to 0.11.13 or newer to get full support.'
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

  debug.register('Profiler.setRecordingProfile', debug.commandToEvent);
  debug.register('Profiler.addProfileHeader', debug.commandToEvent);
  debug.register('Profiler.stop', function(request, response) {
    var profile = profiler.stopProfiling();
    profilingEnabled = false;
    response.body = {header: profile.getHeader()};

    debug.command(
      'Profiler.addProfileHeader',
      response.body
    );

    debug.command(
      'Profiler.setRecordingProfile',
      {isProfiling: false}
    );
  });

  debug.register('Profiler.getCPUProfile', function(request, response) {
    var profileUid = request.arguments.uid,
        profile = profiler.findProfile(profileUid);
    response.body = {profile: profile};
  });

  //DEPRECATED IN LATEST WEBKIT DEV-TOOLS.
  //Remove this if frontend will be updated.
  debug.register('Profiler.removeProfile', function(request, response) {
    var profileUid = request.arguments.uid,
        profile = profiler.findProfile(profileUid);
    if (profile) profile.delete();
  });

  debug.register('Profiler.clearProfiles', function(request, response) {
    profiler.deleteAllProfiles();
  });

  debug.register('Profiler.getProfileHeaders', function(request, response) {
    var headers = profiler.profiles.map(function(profile) {
      return profile.getHeader();
    });

    response.body = {headers: headers};
  });
  //END DEPRECATED IN LATEST WEBKIT DEV-TOOLS

  debug.on('close', function() {
    if (profilingEnabled) {
      profiler.stopProfiling();
    }
    profiler.deleteAllProfiles();
  });
};

ProfilerAgent.nodeVersionIsCompatible = function(version) {
  return semver.satisfies(version, '>=0.11.13');
};

exports.ProfilerAgent = ProfilerAgent;
