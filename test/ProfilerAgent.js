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
    var readyState = 0;

    function updateReadyState() {
      if (++readyState == 3) done();
    }

    profilerAgent.stop({}, function(error, result) {
      if (error) return done(error);
      expect(result).to.deep.equal({
        header: {
          title: 'Profile 1',
          typeId: 'CPU',
          uid: 1
        }
      });
      updateReadyState();
    });

    frontendClient.on('Profiler.addProfileHeader', function(message) {
      expect(message).to.deep.equal({
        header: {
          title: 'Profile 1',
          typeId: 'CPU',
          uid: 1
        }
      });
      updateReadyState();
    });

    frontendClient.on('Profiler.setRecordingProfile', function(message) {
      expect(message).to.deep.equal({isProfiling: false});
      updateReadyState();
    });

  });

  it('should get profile header', function(done) {
    profilerAgent.getCPUProfile({uid: '1'}, function(error, result) {
      if (error) return done(error);
      expect(result).to.have.property(['profile']);
      done();
    });
  });

  it('should get profiles list', function(done) {
    profilerAgent.getProfileHeaders({}, function(error, result) {
      if (error) return done(error);
      expect(result.headers).to.have.length(1);
      done();
    });
  });

  it('should clear profiles', function(done) {
    profilerAgent.clearProfiles({}, function(error, result) {
      if (error) return done(error);
      profilerAgent.getProfileHeaders({}, function(error, result) {
        if (error) return done(error);
        expect(result.headers).to.have.length(0);
        done();
      });
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
