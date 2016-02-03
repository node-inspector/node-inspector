'use strict';

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

inherits(BaseAgent, EventEmitter);
function BaseAgent(config, session) {
  this._commands = [];
  this._debuggerClient = session.debuggerClient;
  this._frontendClient = session.frontendClient;

  this._ready = Promise.resolve();
};
module.exports = BaseAgent;
module.exports.BaseAgent = BaseAgent;
module.exports.ErrorNotImplemented = ErrorNotImplemented;

/**
 * @param {String[]} eventNames
*/
BaseAgent.prototype._translateEventToFrontend = function(event) {
  this._debuggerClient.on(event, message =>
    this._frontendClient.emitEvent(event, message));
};

/**
 * @param {String[]} commandNames
*/
BaseAgent.prototype._translateCommandToInjection = function(command) {
  return (params) => this._debuggerClient.request(this._name + '.' + command, params);
};

BaseAgent.prototype.ready = function() {
  return this._ready;
};

BaseAgent.prototype.registerCommand = function(command, cb) {
  if (typeof cb !== 'function')
    cb = this._translateCommandToInjection(command);

  this._commands[command] = cb;
};

BaseAgent.prototype.registerEvent = function(event, cb) {
  event = this._name + '.' + event;

  if (typeof cb !== 'function')
    return this._translateEventToFrontend(event);

  this._debuggerClient.on(event, cb);
};

BaseAgent.prototype.emitEvent = function(event, data) {
  this._frontendClient.emitEvent(this._name + '.' + event, data);
};

BaseAgent.prototype.handle = function(command, params) {
  var handler = this._commands[command];

  if (!handler)
    throw new ErrorNotImplemented(this._name + '.' + command);

  return this.ready()
    .then(() => handler(params));
};

BaseAgent.prototype.notify = function(level) {
  var args = Array.prototype.slice.call(arguments, 1);
  this._frontendClient.sendLogToConsole(level, args);
  console.log(args);
};

/**
 * @param {string} message
 * @constructor
 */
function ErrorNotImplemented(method) {
  Error.call(this);
  this.name = ErrorNotImplemented.name;
  this.message = 'Not implemented. ' + method;
}
inherits(ErrorNotImplemented, Error);
