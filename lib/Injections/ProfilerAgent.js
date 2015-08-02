// This function will be injected into the target process.
module.exports = function(require, debug, options) {
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