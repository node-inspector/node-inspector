var expect = require('chai').expect,
    semver = require('semver'),
    launcher = require('./helpers/launcher.js'),
    inherits = require('util').inherits,
    EventEmitter = require('events').EventEmitter,
    InjectorClient = require('../lib/InjectorClient').InjectorClient,
    ConsoleClient = require('../lib/ConsoleClient').ConsoleClient,
    ConsoleAgent = require('../lib/ConsoleAgent').ConsoleAgent;

var PROP_TYPE = semver.lt(process.version, '1.0.0') ? 1 : 0;

var consoleAgent,
    consoleClient,
    childProcess,
    debuggerClient,
    frontendClient;

describe('ConsoleAgent', function() {
  before(initializeConsole);

  it('should translate console message to frontend', function(done) {
    frontendClient.once('Console.messageAdded', function(message) {
      done();
    });
    childProcess.stdin.write('log simple text\n');
  });

  it('should translate objects', function(done) {
    frontendClient.once('Console.messageAdded', function(message) {
      expect(message.message.parameters).to.deep.equal([{
        type: 'object',
        subtype: undefined,
        objectId: 'console:1:1',
        className: 'Object',
        description: 'Object'
      }]);
      done();
    });
    childProcess.stdin.write('log object\n');
  });

  it('should translate async console message to frontend', function(done) {
    frontendClient.once('Console.messageAdded', function(message) {
      done();
    });
    childProcess.stdin.write('log simple text async\n');
  });

  it('should clear messages', function(done) {
    frontendClient.on('Console.messagesCleared', function() {
      done();
    });
    consoleAgent.clearMessages();
  });
});

describe('ConsoleClient', function() {
  var _messages = [];

  before(logInChildProcess);

  function logInChildProcess(done) {
    var state = 0;
    function updateState() {
      if (++state == 2) {
        frontendClient.removeAllListeners();
        done();
      }
    }

    frontendClient.on('Console.messageAdded', function(message) {
      _messages.push(message.message);
      updateState();
    });
    childProcess.stdin.write('log object\n');
    childProcess.stdin.write('log console\n');
  }

  it('should match only valid consoleId', function() {
    function expectIsConsoleId(id, value) {
      expect(consoleClient.isConsoleId(id), id).to.be.equal(value);
    }

    expectIsConsoleId('console:1:1', true);
    expectIsConsoleId('console:1:1:1', false);
    expectIsConsoleId('console:1:a', false);
    expectIsConsoleId('console:1:', false);
    expectIsConsoleId('console::', false);
    expectIsConsoleId('consol:1:1', false);
    expectIsConsoleId('::', false);
    expectIsConsoleId('1', false);
  });

  it('should provide object data', function(done) {
    consoleClient.lookupConsoleId(
      _messages[0].parameters[0].objectId,
      function(error, lookupBody, lookupRefs) {
        expect(error).to.equal(null);
        expect(lookupBody).to.deep.equal({
          handle: 7,
          type: 'object',
          className: 'Object',
          constructorFunction: { ref: 8 },
          protoObject: { ref: 9 },
          prototypeObject: { ref: 10 },
          properties: [{ name: 'a', propertyType: PROP_TYPE, ref: 11}],
          text: '#<Object>'
        });
        expect(lookupRefs).to.include.keys(['8', '9', '10', '11']);
        done();
      }
    );
  });

  it('should provide object (with internal properties) data', function(done) {
    consoleClient.lookupConsoleId(
      _messages[0].parameters[0].objectId,
      function(error, lookupBody, lookupRefs) {
        expect(error).to.equal(null);
        done();
      }
    );
  });

  it('should return error on not existed object', function(done) {
    consoleClient.lookupConsoleId(
      'console:3:0',
      function(error, lookupBody, lookupRefs) {
        expect(error).to.equal('Object #0# not found');
        done();
      }
    );
  });

  it('should return error on not existed message', function(done) {
    consoleClient.lookupConsoleId(
      'console:5:1',
      function(error, lookupBody, lookupRefs) {
        expect(error).to.equal('Console message #5# not found');
        done();
      }
    );
  });
});

function initializeConsole(done) {
  launcher.runCommandlet(true, function(child, session) {
    childProcess = child;
    debuggerClient = session.debuggerClient;
    frontendClient = session.frontendClient;

    var injectorClient = new InjectorClient({}, session);
    session.injectorClient = injectorClient;

    consoleClient = new ConsoleClient({}, session);
    session.consoleClient = consoleClient;

    consoleAgent = new ConsoleAgent({}, session);

    injectorClient.once('inject', function(injected) {
      if (injected) debuggerClient.request('continue', null, done);
    });
    injectorClient.once('error', done);

    injectorClient.inject();
  });
}
