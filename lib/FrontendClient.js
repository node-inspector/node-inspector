var EventEmitter = require('events');
var format = require('util').format;
var inherits = require('util').inherits;
var debugProtocol = require('debug')('node-inspector:protocol:devtools');
var FrontendCommandHandler = require('./FrontendCommandHandler.js');
var ErrorNotConnected = require('./DebuggerClient.js').ErrorNotConnected;
var ErrorNotImplemented = require('./Agents/BaseAgent.js').ErrorNotImplemented;

/**
 * FrontendClient encapsulates communication with front-end running in browser.
 * @param {{on: Function, send: Function}} connection
 *   Socket.io connection object.
 * @constructor
 * @extends EventEmitter
 */
function FrontendClient(config, session) {
  this.commandHandler = new FrontendCommandHandler(config, session);

  this._connection = session.client;
  this._connection.on('close', () => this._onConnectionClose());
  this._connection.on('message', (message) => this._onConnectionMessage(message));
}

inherits(FrontendClient, EventEmitter);

Object.defineProperties(FrontendClient.prototype, {
  /** @type {boolean} */
  isConnected: {
    get: function() {
      return this._connection != null;
    }
  }
});

FrontendClient.prototype._onConnectionClose = function() {
  this._connection = null;
  this.emit('close');
};

FrontendClient.prototype._onConnectionMessage = function(message) {
  debugProtocol('frontend: ' + message);
  var request = JSON.parse(message);
  this.commandHandler.handleCommand(request)
    .then(result => this.sendResponse(request, result))
    .catch(error => this.sendError(request, error));
};

/**
 * Send a message to front-end.
 * @param {!Object|string} message
 */
FrontendClient.prototype._sendMessage = function(message) {
  var payload = typeof message == 'string' ? message : JSON.stringify(message);
  debugProtocol('backend: ' + payload);

  if (!this._connection) {
    if (!this._errorMessageDisplayed) {
      console.log('Cannot send response - there is no front-end connection.');
      this._errorMessageDisplayed = true;
    }

    return;
  }

  this._errorMessageDisplayed = false;

  this._connection.send(payload);
};

/**
 * Send a response to a front-end request.
 * @param {number} requestId Id of the request.
 * @param {string} fullMethodName
 * @param {?string} error Error message or null/undefined on success.
 * @param {Object=} result Response data on success.
 */
FrontendClient.prototype.sendResponse = function(request, result) {
  this._sendMessage({
    id: request.id,
    result: result
  });
};

FrontendClient.prototype.sendError = function(request, error) {
  if (error instanceof ErrorNotConnected)
    this.sendInspectorDetached(error.message);
  else if (error instanceof ErrorNotImplemented)
    console.log('Received request for a method not implemented:', method);
  else
    this.sendLogToConsole('error', request.method + ' failed.\n' + error);

  this._sendMessage({
    id: request.id,
    error: error
  });
};

/**
 * Send an event to the front-end.
 * @param {string} eventName Event name in form 'Agent.method'.
 * @param {Object=} data Event data (method arguments).
 */
FrontendClient.prototype.emitEvent = function(eventName, data) {
  this._sendMessage({
    method: eventName,
    params: data || {}
  });
};

/**
 * Ask frontend to add a new log into console window.
 * @param {string} level Message level (error, warning, log, debug).
 * @param {string} text
 */
FrontendClient.prototype.sendLogToConsole = function(level, args) {
  this.emitEvent('Console.showConsole');
  this.emitEvent('Console.messageAdded', {
    message: {
      source: 3,
      type: 0,
      level: level,
      line: 0,
      column: 0,
      url: '',
      groupLevel: 7,
      repeatCount: 1,
      text: format.apply(this, args)
    }
  });
};

/**
 * Shortcut for emitEvent('Inspector.detached', reason)
 * @param {string} reason
 */
FrontendClient.prototype.sendInspectorDetached = function(reason) {
  this.emitEvent('Inspector.detached', { reason: reason });
};

module.exports = FrontendClient;
module.exports.FrontendClient = FrontendClient;
