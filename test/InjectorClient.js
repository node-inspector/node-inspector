var expect = require('chai').expect,
    InjectorClient = require('../lib/InjectorClient').InjectorClient,
    launcher = require('./helpers/launcher.js');

describe('InjectorClient', function() {
  describe('with inject=false', function() {
    var injectorClient, debuggerClient, breakedObject;

    function setupInjector(done) {
      // increase the timeout for Travis CI
      this.timeout(5000);

      launcher.runCommandlet(false, function(childProcess, session) {
        debuggerClient = session.debuggerClient;
        injectorClient = new InjectorClient({inject: false}, session);
        debuggerClient.once('break', function(obj) {
          breakedObject = obj;
          done();
        });
        injectorClient._pause();
      });
    }

    before(setupInjector);

    it('ignores break events not created by the injector', function() {
      var pausedByInjector = injectorClient.containsInjectorMark('wrongInvocationText');
      expect(pausedByInjector, 'invocation text not equal to PAUSE_CHECK').to.equal(false);
    });

    it('checks that application paused by injector', function() {
      var pausedByInjector = injectorClient.containsInjectorMark(breakedObject.invocationText);
      expect(pausedByInjector, 'invocation text equal to PAUSE_CHECK').to.equal(true);
    });

    it('breaks the injection flow with injected=false', function(done) {
      injectorClient.once('inject', function(injected) {
        expect(injected, 'injection command discarded').to.equal(false);
        done();
      });
      injectorClient.inject();
    });
  });

  describe('with inject=true', function() {
    before(setupInjector);
    var injectorClient, debuggerClient, serverPort;

    function setupInjector(done) {
      // increase the timeout for Travis CI
      this.timeout(5000);

      launcher.runCommandlet(false, function(childProcess, session) {
        debuggerClient = session.debuggerClient;
        injectorClient = new InjectorClient({}, session);
        injectorClient._pause();
        debuggerClient.once('break', function(obj) {
          injectorClient._appPausedByInjector = injectorClient.containsInjectorMark(obj.invocationText);
          done();
        });
      });
    }

    it('is ready to inject', function() {
      expect(injectorClient.needsInject, 'injection is needed').to.equal(true);
    });

    it('inject server', function(done) {
      injectorClient.once('inject', function(injected) {
        expect(injected).to.equal(true);
        if (injected) done();
      });
      injectorClient.once('error', function(error) {
        done(error);
      });
      injectorClient.inject();
    });

    it('does not need to inject if already injected', function() {
      expect(injectorClient.needsInject, 'injection is not needed').to.equal(false);
    });

    it('notify that is already injected', function(done) {
      injectorClient.once('inject', function(injected) {
        expect(injected, 'is already injected').to.equal(true);
        done();
      });
      injectorClient.inject();
    });

    it('would close on "close" debuggerClient', function(done) {
      injectorClient.once('close', function() {
        expect(injectorClient._injected).to.equal(false);
        expect(injectorClient._appPausedByInjector).to.equal(false);
        done();
      });
      debuggerClient.close();
    });

    it('is ready to inject after close', function() {
      expect(injectorClient.needsInject, 'injection is needed').to.equal(true);
    });
  });

  describe('with inject=true and debug-brk flag', function() {
    before(setupInjector);
    var injectorClient, debuggerClient;

    function setupInjector(done) {
      // increase the timeout for Travis CI
      this.timeout(5000);

      launcher.runCommandlet(true, function(childProcess, session) {
        debuggerClient = session.debuggerClient;
        injectorClient = new InjectorClient({}, session);
        done();
      });
    }

    it('connects to server', function(done) {
      injectorClient.once('inject', function(injected) {
        expect(injected, 'is injected').to.equal(true);
        done();
      });
      injectorClient.inject();
    });
  });

  describe('works with events.', function() {
    before(setupInjector);
    var injectorClient, debuggerClient;

    function setupInjector(done) {
      // increase the timeout for Travis CI
      this.timeout(5000);

      launcher.runCommandlet(true, function(childProcess, session) {
        debuggerClient = session.debuggerClient;
        injectorClient = new InjectorClient({}, session);
        injectorClient.once('inject', function(injected) {
          if (injected) debuggerClient.request('continue', null, done);
        });
        injectorClient.once('error', function(error) {
          done(error);
        });
        injectorClient.inject();
      });
    }

    it('Register event handle in app and emits it', function(done) {
      var injection = function(require, debug, options) {
        debug.register('console', function(request, response) {
          debug.commandToEvent(request, response);
        });

        console.log = (function(fn) {
          return function() {
            var message = arguments[0];

            debug.command('console', {
              level: 'log',
              message: options.message + message
            });

            return fn && fn.apply(console, arguments);
          };
        })(console.log);

        console.log('test');
      };

      debuggerClient.registerDebuggerEventHandlers('console');
      debuggerClient.once('console', function(message) {
        expect(message.level).to.equal('log');
        expect(message.message).to.equal('testtest');
        done();
      });

      injectorClient.injection(
        injection,
        { message: 'test' },
        function(error, result) {
          if (error) return done(error);
        }
      );
    });
  });

  describe('works with commands.', function() {
    before(setupInjector);
    var injectorClient, debuggerClient;

    function setupInjector(done) {
      // increase the timeout for Travis CI
      this.timeout(5000);

      launcher.runCommandlet(true, function(childProcess, session) {
        debuggerClient = session.debuggerClient;
        injectorClient = new InjectorClient({}, session);
        injectorClient.once('inject', function(injected) {
          if (injected) debuggerClient.request('continue', null, done);
        });
        injectorClient.once('error', function(error) {
          done(error);
        });
        injectorClient.inject();
      });
    }

    it('Registers command in app and responds to it', function(done) {
      var injection = function(require, debug, options) {
        debug.register('testcommand', function(request, response) {
          response.body = request.arguments;
        });
      };

      injectorClient.injection(
        injection,
        {},
        function(error, result) {
          if (error) return done(error);

          debuggerClient.request(
            'testcommand',
            {
              param: 'test'
            },
            function(error, result) {
              expect(error).to.equal(null);
              expect(result).to.have.property('param', 'test');
              done();
            }
          );
        }
      );
    });
  });
});
