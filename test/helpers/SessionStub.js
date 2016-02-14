var Session = require('../../lib/session.js'),
    EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits;

module.exports = SessionStub;

function SessionStub() {
  this.debugger = new DebuggerClientStub();
  this.frontend = new FrontendClientStub();
}
inherits(SessionStub, Session);

SessionStub.prototype.inject

function DebuggerClientStub() {}
inherits(DebuggerClientStub, EventEmitter);

DebuggerClientStub.prototype.close = function() {
  this.emit('close');
};

function FrontendClientStub() {}
inherits(FrontendClientStub, EventEmitter);

FrontendClientStub.prototype.emitEvent = function(event, message) {
  this.emit(event, message);
};
FrontendClientStub.prototype.sendLogToConsole = function(type, message) {
  throw new Error(message);
};
FrontendClientStub.prototype.off = function() {
  this.removeListener.apply(this, arguments);
};
