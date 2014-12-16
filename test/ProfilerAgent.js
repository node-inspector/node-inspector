var expect = require('chai').expect,
    launcher = require('./helpers/launcher.js'),
    EventEmitter = require('events').EventEmitter,
    InjectorClient = require('../lib/InjectorClient').InjectorClient,
    ProfilerAgent = require('../lib/ProfilerAgent').ProfilerAgent;

var profilerAgent,
    debuggerClient;
var frontendClient = new EventEmitter();
frontendClient.sendEvent = function(event, message) {
  this.emit(event, message);
};

describe('Profiler Agent', function() {
  before(initializeProfiler);

  it('should start profiling', function(done) {
    profilerAgent.start({}, function(error, result){
      if (error) return done(error);
      expect(result).to.equal(undefined);
      done();
    });
  });

  it('should stop profiling', function(done) {
    profilerAgent.stop({}, function(error, result) {
      if (error) return done(error);
      expect(result).to.have.property('profile');
      done();
    });
  });

  describe('nodeVersionIsCompatible', function() {
    it('returns false for v0.10.29', function(done) {
      expect(ProfilerAgent.nodeVersionIsCompatible('v0.10.29'))
        .to.equal(false);
      done();
    });

    it('returns false for v0.11.12', function(done) {
      expect(ProfilerAgent.nodeVersionIsCompatible('v0.11.12'))
        .to.equal(false);
      done();
    });

    it('returns true for v0.11.13', function(done) {
      expect(ProfilerAgent.nodeVersionIsCompatible('v0.11.13'))
        .to.equal(true);
      done();
    });

    it('returns true for v0.12.0', function(done) {
      expect(ProfilerAgent.nodeVersionIsCompatible('v0.12.0'))
        .to.equal(true);
      done();
    });

    it('returns true for v1.0.0', function(done) {
      expect(ProfilerAgent.nodeVersionIsCompatible('v1.0.0'))
        .to.equal(true);
      done();
    });
  });
});

function initializeProfiler(done) {
  launcher.runPeriodicConsoleLog(true, function(childProcess, client) {
    var injectorClient = new InjectorClient({}, client);
    debuggerClient = client;
    profilerAgent = new ProfilerAgent({}, debuggerClient, injectorClient, frontendClient);
    injectorClient.once('inject', function(injected) {
      if (injected) done();
    });
    injectorClient.once('error', function(error) {
      done(error);
    });
    injectorClient.inject();
  });
}
