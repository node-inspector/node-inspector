'use strict';

var co = require('co');
var expect = require('chai').expect;
var launcher = require('./helpers/launcher.js');
var InjectorClient = require('../lib/InjectorClient');
var ProfilerAgent = require('../lib/Agents/ProfilerAgent');

var session;
var profilerAgent;
var debuggerClient;
var frontendClient;

describe('Profiler Agent', function() {
  before(() => initializeProfiler());

  it('should start profiling', () => {
    return co(function * () {
      var result = yield profilerAgent.handle('start');
      expect(result).to.equal(undefined);
    });
  });

  it('should stop profiling', () => {
    return co(function * () {
      var result = yield profilerAgent.handle('stop');
      expect(result).to.have.property('profile');
    });
  });
});

function expand(instance) {
  session = instance.session;
  debuggerClient = session.debuggerClient;
  frontendClient = session.frontendClient;
}

function initializeProfiler() {
  return co(function * () {
    yield launcher.runCommandlet(true).then(expand);

    var injectorClient = new InjectorClient({}, session);
    session.injectorClient = injectorClient;

    profilerAgent = new ProfilerAgent({}, session);

    yield injectorClient.injected();
    yield debuggerClient.request('continue');
  });
}
