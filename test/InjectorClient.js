var expect = require('chai').expect,
    InjectorClient = require('../lib/InjectorClient').InjectorClient,
    launcher = require('./helpers/launcher.js');

describe('InjectorClient', function() {
  describe('with inject=false', function() {
    var injectorClient, debuggerClient, breakedObject;

    function setupInjector(done) {
      launcher.runPeriodicConsoleLog(false, function(childProcess, client) {
        debuggerClient = client;
        injectorClient = new InjectorClient({inject: false}, debuggerClient);
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

    it('breaks the connection flow with connected=false', function(done) {
      injectorClient.once('connect', function(connected) {
        expect(connected, 'connection command discarded').to.equal(false);
        done();
      });
      injectorClient.connect();
    });

    it('caches injections as stringified functions', function() {
      var injection = function(require, injector) {},
          injToString = injection.toString();
      injectorClient.inject(injection);

      var cached = injectorClient._needsToInject;

      expect(cached, 'injections cache length').to.have.length(1);
      expect(cached, 'injection in cache').to.include(injToString);
    });
  });

  describe('with inject=true', function() {
    before(setupInjector);
    var injectorClient, debuggerClient, serverPort;

    function setupInjector(done) {
      launcher.runPeriodicConsoleLog(false, function(childProcess, client) {
        debuggerClient = client;
        injectorClient = new InjectorClient({}, debuggerClient);
        injectorClient._pause();
        debuggerClient.once('break', function(obj) {
          injectorClient._appPausedByInjector = injectorClient.containsInjectorMark(obj.invocationText);
          done();
        });
      });
    }

    it('is ready to inject', function() {
      expect(injectorClient.needsConnect, 'connection allowed').to.equal(true);
    });
    
    it('inject server', function(done) {
      injectorClient._injectServer(function(error, result) {
        expect(error, 'injectet without errors').to.equal(null);
        expect(result.value, 'port is a valid number').to.be.within(0, 65535);
        serverPort = result.value;
        done();
      }, 1);
    });

    it('connects to server', function(done) {
      injectorClient._connect(null, {value: serverPort});
      injectorClient.once('connect', function(connected) {
        expect(connected, 'is connected').to.equal(true);
        done();
      });
    });
    
    it('does not need to connect if connected', function() {
      expect(injectorClient.needsConnect, 'connection not allowed').to.equal(false);
    });
    
    it('discards connection command if connected', function(done) {
      injectorClient.once('connect', function(connected) {
        expect(connected, 'connection command discarded').to.equal(false);
        done();
      });
      injectorClient.connect();
    });

    it('would close on "close" debuggerClient', function(done) {
      injectorClient.on('close', done.bind(undefined, null));
      debuggerClient.close();
    });
    
    it('is ready to inject after close', function() {
      expect(injectorClient.needsConnect, 'connection allowed').to.equal(true);
    });
  });

  describe('works with events.', function() {
    before(setupInjector);
    var injectorClient, debuggerClient;

    function setupInjector(done) {
      launcher.runPeriodicConsoleLog(false, function(childProcess, client) {
        debuggerClient = client;
        injectorClient = new InjectorClient({}, debuggerClient);
        injectorClient.inject(function(require, injector) {
          injector.on(
            'Agent.clientEvent',
            function(message) {
              injector.sendEvent('Agent.serverEvent', message.body);
            }
          );
        });
        injectorClient._pause();
        debuggerClient.once('break', function(obj) {
          injectorClient._appPausedByInjector = injectorClient.containsInjectorMark(obj.invocationText);
          done();
        });
      });
    }

    it('Register events', function() {
      var events = ['Agent.serverEvent', 'Agent.serverEventOther'];
      injectorClient.registerInjectorEvents.apply(injectorClient, events);

      var cached = injectorClient._eventNames;

      expect(cached, 'events cache length').to.have.length(2);
      expect(cached, 'cache contains event').to.have.members(events);
    });

    it('Cache messages if not connected', function() {
      injectorClient.sendEvent('Agent.clientEvent', 'test1');
      injectorClient.sendEvent('Agent.clientEvent', 'test2');

      var cached = injectorClient._messagesCache;

      expect(cached, 'messages cache length').to.have.length(2);
    });

    it('Receive events', function(done) {
      var result = [];
      injectorClient.on('Agent.serverEvent', function(message) {
        result.push(message);
        if (result.length == 2) {
          expect(result, 'events has true ordered').to.deep.equal(['test1', 'test2']);
          done();
        }
      });
      injectorClient.connect();
    });

    it('Clear messages cache after connection', function() {
      expect(injectorClient._messagesCache).to.have.length(0);
    });
  });
  
  describe('works with requests.', function() {
    before(setupInjector);
    var injectorClient, debuggerClient;

    function setupInjector(done) {
      launcher.runPeriodicConsoleLog(false, function(childProcess, client) {
        debuggerClient = client;
        injectorClient = new InjectorClient({}, debuggerClient);
        injectorClient.inject(function(require, injector) {
          injector.commands['Agent.clientRequest'] = function(request, response) {
            response.body = request.arguments;
          };
          injector.commands['Agent.clientBadRequest'] = function(request, response) {
            response.body = {result: true};
            throw new Error('Bad request was thrown');
          };
        });
        injectorClient._pause();
        debuggerClient.once('break', function(obj) {
          injectorClient._appPausedByInjector = injectorClient.containsInjectorMark(obj.invocationText);
          done();
        });
      });
    }
    
    it('Cache messages when not connected', function() {
      injectorClient.request('Agent.clientRequest');
      injectorClient.sendEvent('Agent.clientBadRequest');

      var cached = injectorClient._messagesCache;

      expect(cached, 'messages cache length').to.have.length(2);
    });
    
    it('Receive responces when connected', function(done) {
      var doneCounter = 0;
      injectorClient.connect();
      
      injectorClient.request('Agent.clientRequest', {param: 1}, function(error, response){
        expect(error, 'no errors').to.equal(null);
        expect(response.param, 'param was passed').to.equal(1);
        if (++doneCounter == 2) done();
      });
      injectorClient.request('Agent.clientBadRequest', {}, function(error, response) {
        expect(error, 'error was thrown').to.equal('Bad request was thrown');
        expect(response, 'response is empty').to.equal(undefined);
        if (++doneCounter == 2) done();
      });
    });
  });

  describe('with inject=true and debug-brk flag', function() {
    before(setupInjector);
    var injectorClient, debuggerClient;

    function setupInjector(done) {
      launcher.runPeriodicConsoleLog(true, function(childProcess, client) {
        debuggerClient = client;
        injectorClient = new InjectorClient({}, debuggerClient);
        injectorClient.inject(function(require, injector) {
          console.log = (function(fn) {
            return function() {
              injector.sendEvent('Console.messageAdded', arguments[0]);
              fn.apply(console, arguments);
            };
          }(console.log));
        });
        injectorClient.registerInjectorEvents('Console.messageAdded');
        done();
      });
    }

    it('connects to server', function(done) {
      injectorClient.once('connect', function(connected) {
        expect(connected, 'is connected').to.equal(true);
        done();
      });
      injectorClient.connect();
    });

    it('does not lose the data', function(done) {
      debuggerClient.request('continue');
      injectorClient.once('Console.messageAdded', function(message) {
        expect(message).to.equal(0);
        done();
      });
    });
  });
});
