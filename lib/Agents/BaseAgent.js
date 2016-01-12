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
  return (params) => new Promise((resolve, reject) =>
    this._debuggerClient.request(this._name + '.' + command, params, (error, result) =>
      (error ? reject : resolve)(error || result) ));
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
  var method = command.split('.')[1];
  var handler = this._commands[method];

  if (!handler)
    return Promise.reject(new ErrorNotImplemented(command));

  return this.ready()
    .then(() => handler(params));
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
