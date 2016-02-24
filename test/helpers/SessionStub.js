'use strict';

const Session = require('../../lib/session.js');
const EventEmitter = require('events');
const inherits = require('util').inherits;

const FrontendClient = require('../../lib/FrontendClient/FrontendClient.js');

module.exports = SessionStub;

function SessionStub() {
  this.client = new EventEmitter();
  this.debugger = new DebuggerClientStub();
  this.frontend = new FrontendClientStub({}, this);
}
inherits(SessionStub, Session);

class DebuggerClientStub extends EventEmitter {
  close() {
    this.emit('close');
  }
}

class FrontendClientStub extends FrontendClient {
  constructor(config, session) {
    super(config, session);
  }

  emitEvent(event, message) {
    this.emit(event, message);
  }

  sendLogToConsole(type, message) {
    throw new Error(message);
  }

  off() {
    this.removeListener.apply(this, arguments);
  }
}
