var expect = require('chai').expect,
    launcher = require('./helpers/launcher.js'),
    InjectorClient = require('../lib/InjectorClient').InjectorClient,
    NetworkAgent = require('../lib/NetworkAgent.js').NetworkAgent;

var childProcess,
    debuggerClient,
    frontendClient,
    networkAgent;

describe('NetworkAgent', function() {
  describe('loadResourceForFrontend', function() {
    it('should load data URLs', function(done) {
      var agent = new NetworkAgent({ inject: false }, {});
      agent.loadResourceForFrontend(
        {
          url: 'data:text/plain;base64,aGVsbG8gd29ybGQ='
        },
        function(err, result) {
          if (err) return done(err);
          expect(result.content).to.equal('hello world');
          done();
        }
      );
    });
  });

  describe('requestWillBeSent', function() {
    before(initializeNetwork);

    var data;

    before(function(done) {
      frontendClient.once('Network.requestWillBeSent', function(eventData) {
        data = eventData;
        done();
      });
    });

    it('should contain the request url', function() {
      expect(data.documentURL).to.match(/^http:\/\/127\.0\.0\.1:\d+\/page\?a=b$/);
    });
  });
  
  describe('responseReceived', function() {
    before(initializeNetwork);

    var data;

    before(function(done) {
      frontendClient.once('Network.responseReceived', function(eventData) {
        data = eventData;
        done();
      });
    });

    it('should contain the request url', function() {
      expect(data.response.url).to.match(/^http:\/\/127\.0\.0\.1:\d+\/page\?a=b$/);
    });
  });
});

function initializeNetwork(done) {
  launcher.runRequest(true, function(child, session) {
    childProcess = child;
    debuggerClient = session.debuggerClient;
    frontendClient = session.frontendClient;

    if (process.env.VERBOSE) {
      child.stdout.pipe(process.stdout);
      child.stderr.pipe(process.stderr);
    }

    var injectorClient = new InjectorClient({}, session);
    session.injectorClient = injectorClient;

    networkAgent = new NetworkAgent({}, session);

    injectorClient.once('inject', function(injected) {
      if (injected) debuggerClient.request('continue', null, done);
    });
    injectorClient.once('error', done);

    injectorClient.inject();
  });
}
