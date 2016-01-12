var expect = require('chai').expect,
    InjectorClient = require('../lib/InjectorClient').InjectorClient,
    launcher = require('./helpers/launcher.js');

describe('InjectorClient', function() {
  describe('with inject=false', function() {
    var injectorClient, debuggerClient, breakedObject;

    function setupInjector(done) {
      launcher.runCommandlet(false, function(childProcess, session) {
        debuggerClient = session.debuggerClient;
        injectorClient = new InjectorClient({inject: false}, session);
        done();
      });
    }

    before(setupInjector);

    it('breaks the injection flow with injected=false', function(done) {
      injectorClient.inject(function() {
        expect(injectorClient._injected).to.be.equal(false);
        done();
      });
    });
  });

  describe('with inject=true', function() {
    before(setupInjector);
    var injectorClient, debuggerClient, serverPort;

    function setupInjector(done) {
      launcher.runCommandlet(false, function(childProcess, session) {
        debuggerClient = session.debuggerClient;
        injectorClient = new InjectorClient({}, session);
        done();
      });
    }

    it('is ready to inject', function() {
      expect(injectorClient.needsInject, 'injection is needed').to.equal(true);
    });

    it('injects server', function(done) {
      injectorClient.inject(done);
    });

    it('does not need to inject if already injected', function() {
      expect(injectorClient.needsInject, 'injection is not needed').to.equal(false);
    });

    it('should don`t emit `inject` event if is already injected', function(done) {
      injectorClient.once('inject', done);
      injectorClient.inject(done);
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
      launcher.runCommandlet(true, function(childProcess, session) {
        debuggerClient = session.debuggerClient;
        injectorClient = new InjectorClient({}, session);
        done();
      });
    }

    it('connects to server', function(done) {
      injectorClient.inject(done);
    });
  });

  describe('works with events.', function() {
    before(setupInjector);
    var injectorClient, debuggerClient;

    function setupInjector(done) {
      launcher.runCommandlet(true, function(childProcess, session) {
        debuggerClient = session.debuggerClient;
        injectorClient = new InjectorClient({}, session);
        injectorClient.inject(function(error) {
          if (error) return done(error);
          debuggerClient.request('continue', null, done);
        });
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
      launcher.runCommandlet(true, function(childProcess, session) {
        debuggerClient = session.debuggerClient;
        injectorClient = new InjectorClient({}, session);
        injectorClient.inject(function(error) {
          if (error) return done(error);
          debuggerClient.request('continue', null, done);
        });
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
