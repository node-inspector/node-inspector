var Net = require('net'),
    Protocol = require('_debugger').Protocol,
    inherits = require('util').inherits,
    EventEmitter = require('events').EventEmitter,
    debugProtocol = require('debug')('node-inspector:protocol:v8-debug'),
    callbackHandler = require('./callback').create();

/**
* @param {Number} port
*/
function Debugger(port){
  this._port = port;
  this._connected = false;
  this._connection = null;
  this._lastError = null;
  
  this._setupConnection();
}

inherits(Debugger, EventEmitter);

Object.defineProperties(Debugger.prototype, {
  /** @type {boolean} */
  isRunning: { writable: true, value: true },
  
  /** @type {boolean} */
  connected: {
    get: function() {
      return this._connected;
    }
  }
});

Debugger.prototype._setupConnection = function() {
  var connection = Net.createConnection(this._port),
      protocol = new Protocol();
  
  protocol.onResponse = this._processResponse.bind(this);

  connection
    .on('connect', this._onConnectionOpen.bind(this))
    .on('data', protocol.execute.bind(protocol))
    .on('error', this._onConnectionError.bind(this))
    .on('end', this.close.bind(this))
    .on('close', this._onConnectionClose.bind(this))
    .setEncoding('utf8');
    
  this._connection = connection;
};

Debugger.prototype._onConnectionOpen = function() {
  this._connected = true;
  this.emit('connect');
};


/**
* @param {Error} err
*/
Debugger.prototype._onConnectionError = function(err) {
  if (err.code == 'ECONNREFUSED') {
    err.helpString = 'Is node running with --debug port ' + this._port + '?';
  } else if (err.code == 'ECONNRESET') {
    err.helpString = 'Check there is no other debugger client attached to port ' + this._port + '.';
  }

  this._lastError = err.toString();
  if (err.helpString) {
    this._lastError += '. ' + err.helpString;
  }

  this.emit('error', err);
};

Debugger.prototype._onConnectionClose = function(hadError) {
  this.emit('close', hadError ? this._lastError : 'Debugged process exited.');
  
  this._port = null;
  this._connected = false;
  this._connection = null;
  this._lastError = null;
};

Debugger.prototype._processResponse = function(message) {
  var obj = message.body;

  if (typeof obj.running === 'boolean') {
    this.isRunning = obj.running;
  }
  if (obj.type === 'response' && obj.request_seq > 0) {
    debugProtocol('response: ' + JSON.stringify(message.body));
    callbackHandler.processResponse(obj.request_seq, [obj]);
  }
  else if (obj.type === 'event') {
    debugProtocol('event: ' + JSON.stringify(message.body));
    if (['break', 'exception'].indexOf(obj.event) > -1) {
      this.isRunning = false;
    }
    this.emit(obj.event, obj);
  }
  else {
    debugProtocol('unknown: ' + JSON.stringify(message.body));
  }
};

/**
* @param {string} data
*/
Debugger.prototype.send = function(data) {
  debugProtocol('request: ' + data);
  if (this.connected) {
    this._connection.write('Content-Length: ' + Buffer.byteLength(data, 'utf8') + '\r\n\r\n' + data);
  }
};


/**
* @param {string} command
* @param {Object} params
* @param {function} callback
*/
Debugger.prototype.request = function(command, params, callback) {
  var message = {
    seq: 0,
    type: 'request',
    command: command
  };
  if (typeof callback === 'function') {
    message.seq = callbackHandler.wrap(callback);
  }
  if (params) {
    Object.keys(params).forEach(function(key) {
      message[key] = params[key];
    });
  }
  this.send(JSON.stringify(message));
};

/**
*/
Debugger.prototype.close = function() {
  this._connection.end();
};

/**
* @param {Number} port
* @type {Debugger}
*/
module.exports.attachDebugger = function(port) {
  return new Debugger(port);
};
