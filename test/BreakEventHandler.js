var expect = require('chai').expect,
    launcher = require('./helpers/launcher'),
    InjectorClient = require('../lib/InjectorClient').InjectorClient,
    BreakEventHandler = require('../lib/BreakEventHandler').BreakEventHandler,
    ScriptManager = require('../lib/ScriptManager').ScriptManager;

describe('BreakEventHandler', function() {
  var childProcess,
      session;

  describe('event cache', function() {
    it('works correctly in debug-brk mode', function(done) {
      prepareBreakEventHandler(true, function() {
        expect(session.breakEventHandler._eventsCache).to.instanceof(Array);
        expect(session.breakEventHandler._eventsCache.length).to.equal(0);

        session.debuggerClient.request('continue', undefined, function() {
          childProcess.stdin.write('pause\n');
          setTimeout(function() {
            expect(session.breakEventHandler._eventsCache.length).to.equal(1);
            done();
          }, 100);
        });
      });
    });

    it('works correctly in debug mode', function(done) {
      prepareBreakEventHandler(false, function() {
        expect(session.breakEventHandler._eventsCache).to.instanceof(Array);
        expect(session.breakEventHandler._eventsCache.length).to.equal(0);

        childProcess.stdin.write('pause\n');
        setTimeout(function() {
          expect(session.breakEventHandler._eventsCache.length).to.equal(1);
          done();
        }, 100);
      });
    });
  });

  describe('event resolver', function() {
    before(function(done) {
      prepareBreakEventHandler(false, function() {
        childProcess.stdin.write('pause\n');
        setTimeout(done, 100);
      });
    });

    it('should resolve events on `resource-tree-resolved` event', function(done) {
      // Test checks that the event was resolved from cache and triggered (sent to the client).
      // It fails on timeout when the implementation is not correct. 
      session.frontendClient.once('Debugger.paused', function() {
        expect(session.breakEventHandler._eventsCache).to.equal(null);
        done();
      });

      expect(session.breakEventHandler._eventsCache).to.be.instanceof(Array);
      expect(session.breakEventHandler._eventsCache).to.have.length(1);

      session.debuggerClient.request('scripts', null, function(error, result) {
        if (error) done(error);

        result.forEach(session.scriptManager.addScript.bind(session.scriptManager));
        session.emit('resource-tree-resolved');
      });
    });

    it('should resolve events immediately if resource tree was resolved', function(done) {
      // This test is relying on the global state changes made by the previous test
      // and checking that continue + pause will be correctly handled.
      // It fails on timeout when the implementation is not correct. 
      session.frontendClient.once('Debugger.paused', function() {
        done();
      });

      session.debuggerClient.request('continue', null, function() {
        childProcess.stdin.write('pause\n');
      });
    });
  });

  function prepareBreakEventHandler(pauseOnStart, callback) {
    launcher.runCommandlet(pauseOnStart, function(_childProcess, _session) {
      session = _session;
      childProcess = _childProcess;

      session.resourceTreeResolved = false;
      session.once('resource-tree-resolved', function() {
        session.resourceTreeResolved = true;
      });
      session.injectorClient = new InjectorClient({}, session);
      session.scriptManager = new ScriptManager({}, session);
      session.breakEventHandler = new BreakEventHandler({}, session);

      callback();
    });
  }
});
