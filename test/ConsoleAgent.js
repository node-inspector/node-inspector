var expect = require('chai').expect,
    semver = require('semver'),
    launcher = require('./helpers/launcher.js'),
    inherits = require('util').inherits,
    EventEmitter = require('events').EventEmitter,
    InjectorClient = require('../lib/InjectorClient').InjectorClient,
    ConsoleAgent = require('../lib/Agents/ConsoleAgent').ConsoleAgent;

var PROP_TYPE = semver.lt(process.version, '1.0.0') ? 1 : 0;

var consoleAgent,
    childProcess,
    debuggerClient,
    frontendClient;

describe.only('ConsoleAgent', function() {
  before(initializeConsole);

  it('should translate console message to frontend', function(done) {
    frontendClient.once('Console.messageAdded', function(message) {
      done();
    });
    childProcess.stdin.write('log simple text\n');
  });

  it('should translate objects', function(done) {
    frontendClient.once('Console.messageAdded', function(message) {
      expect(JSON.stringify(message.message.parameters)).to.equal(JSON.stringify([{
        type: 'object',
        subtype: undefined,
        objectId: '{"injectedScriptId":' + childProcess.pid + ',"id":1}',
        className: 'Object',
        description: 'Object',
        preview: {
          type: 'object',
          description: 'Object',
          lossless: true,
          overflow: false,
          properties: [
            {
              name: 'a',
              type: 'string',
              value: 'test'
            }
          ]
        }
      }]));
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

function initializeConsole(done) {
  launcher.runCommandlet(true, function(child, session) {
    childProcess = child;
    debuggerClient = session.debuggerClient;
    frontendClient = session.frontendClient;

    var injectorClient = new InjectorClient({}, session);
    session.injectorClient = injectorClient;

    consoleAgent = new ConsoleAgent({}, session);

    injectorClient.inject(function(error) {
      if (error) return done(error);
      debuggerClient.request('continue', null, done);
    });
  });
}
