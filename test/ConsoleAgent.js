'use strict';

var co = require('co');
var expect = require('chai').expect;
var launcher = require('./helpers/launcher.js');
var inherits = require('util').inherits;
var InjectorClient = require('../lib/InjectorClient');
var ConsoleAgent = require('../lib/Agents/ConsoleAgent');

var child;
var session;
var consoleAgent;
var debuggerClient;
var frontendClient;
var injectorClient;

describe('ConsoleAgent', () => {
  before(() => initializeConsole());

  it('should translate console message to frontend', done => {
    frontendClient.once('Console.messageAdded', message => done());
    child.stdin.write('log simple text\n');
  });

  it('should translate objects', done => {
    frontendClient.once('Console.messageAdded', message => {
      expect(JSON.stringify(message.message.parameters)).to.equal(JSON.stringify([{
        type: 'object',
        subtype: undefined,
        objectId: '{"injectedScriptId":' + child.pid + ',"id":1}',
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
    child.stdin.write('log object\n');
  });

  it('should translate async console message to frontend', done => {
    frontendClient.once('Console.messageAdded', message => done());
    child.stdin.write('log simple text async\n');
  });

  it('should clear messages', done => {
    frontendClient.on('Console.messagesCleared', () => done());
    consoleAgent.handle('clearMessages');
  });
});

function expand(instance) {
  child = instance.child;
  session = instance.session;
  debuggerClient = session.debuggerClient;
  frontendClient = session.frontendClient;
}

function fill() {
  injectorClient = new InjectorClient({}, session);
  session.injectorClient = injectorClient;
  consoleAgent = new ConsoleAgent({}, session);
}

function initializeConsole() {
  return co(function * () {
    yield launcher.runCommandlet(true).then(expand).then(fill);
    yield injectorClient.injected();
    yield debuggerClient.request('continue');
  });
}
