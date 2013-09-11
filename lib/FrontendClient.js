var EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits,
    ErrorNotConnected = require('./DebuggerClient').ErrorNotConnected;

/**
 * FrontendClient encapsulates communication with front-end running in browser.
 * @param {{on: Function, send: Function}} connection
 *   Socket.io connection object.
 * @constructor
 * @extends EventEmitter
 */
function FrontendClient(connection) {
  this._connection = connection;
  this._registerEventHandlers();
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

FrontendClient.prototype._registerEventHandlers = function() {
  this._connection.on('disconnect', this._onConnectionClose.bind(this));
  this._connection.on('message', this._onConnectionMessage.bind(this));
};

FrontendClient.prototype._onConnectionClose = function() {
  this._connection = null;
  this.emit('close');
};

FrontendClient.prototype._onConnectionMessage = function(message) {
  this.emit('message', message);
};

/**
 * Send a message to front-end.
 * @param {!Object|string} message
 */
FrontendClient.prototype._sendMessage = function(message) {
  if (!this._connection) {
    console.log('Cannot send response - there is no front-end connection.');
    return;
  }

  var payload = typeof message == 'string' ? message : JSON.stringify(message);
  this._connection.send(payload);
};

/**
 * Send a response to a front-end request.
 * @param {number} requestId Id of the request.
 * @param {string} fullMethodName
 * @param {?string} error Error message or null/undefined on success.
 * @param {Object=} result Response data on success.
 */
FrontendClient.prototype.sendResponse = function(requestId,
                                                 fullMethodName,
                                                 error,
                                                 result) {
  if (requestId == null) {
    throw new Error(
      'Cannot send response to ' +
        fullMethodName +
        ' without a requestId');
  }

  var message = { id: requestId };
  if (error != null) {
    this._onErrorResponse(fullMethodName, error);
    message.error = error.toString();
  } else {
    message.result = result;
  }

  this._sendMessage(message);
};

FrontendClient.prototype._onErrorResponse = function(fullMethodName, error) {
  if (error instanceof ErrorNotConnected) {
    this.sendInspectorDetached(error.message);
  }
  this.sendLogToConsole('error', fullMethodName + ' failed.\n' + error);
};

/**
 * Send an event to the front-end.
 * @param {string} eventName Event name in form 'Agent.method'.
 * @param {Object=} data Event data (method arguments).
 */
FrontendClient.prototype.sendEvent = function(eventName, data) {
  var message = {
    method: eventName,
    params: data || {}
  };
  this._sendMessage(message);
};

/**
 * Ask frontend to add a new log into console window.
 * @param {string} level Message level (error, warning, log, debug).
 * @param {string} text
 */
FrontendClient.prototype.sendLogToConsole = function(level, text) {
  this._sendMessage('showConsole');
  this.sendEvent(
    'Console.messageAdded',
    {
      message: {
        source: 3,
        type: 0,
        level: level,
        line: 0,
        column: 0,
        url: '',
        groupLevel: 7,
        repeatCount: 1,
        text: text
      }
    }
  );
};

/**
 * Shortcut for sendEvent('Inspector.detached', reason)
 * @param {string} reason
 */
FrontendClient.prototype.sendInspectorDetached = function(reason) {
  this.sendEvent('Inspector.detached', { reason: reason });
};

exports.FrontendClient = FrontendClient;
