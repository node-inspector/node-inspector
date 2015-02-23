var EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits;

module.exports = SessionStub;

function SessionStub() {
  this.debuggerClient = new EmptyEventEmitter();
  this.frontendClient = new FrontendClientStub();
  
  this.resourceTreeResolved = true;
}
inherits(SessionStub, EventEmitter);

function FrontendClientStub() {}
inherits(FrontendClientStub, EventEmitter);

FrontendClientStub.prototype.sendEvent = function(event, message) {
  this.emit(event, message);
};
FrontendClientStub.prototype.sendLogToConsole = function(type, message) {
  throw new Error(message);
};
FrontendClientStub.prototype.off = function() {
  this.removeListener.apply(this, arguments);
};

function EmptyEventEmitter() {}
EmptyEventEmitter.prototype.on =
EmptyEventEmitter.prototype.once = 
EmptyEventEmitter.prototype.emit = 
EmptyEventEmitter.prototype.removeListener = 
EmptyEventEmitter.prototype.off = function() {};
