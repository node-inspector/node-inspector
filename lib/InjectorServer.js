/**
* @param {Array} injections
*/
function injectorServer(injections, options) {
  var injector,
      connection,
      server = require('net').createServer(),
      Protocol = require('_debugger').Protocol,
      inherits = require('util').inherits,
      EventEmitter = require('events').EventEmitter,
      connected = false,
      next_response_seq = 0;
  
  /**
  * @param {Object?} request
  */
  function ProtocolMessage(request) {
    this.seq = next_response_seq++;

    if (request) {
      this.type = 'response';
      this.request_seq = request.seq;
      this.command = request.command;
      this.running = true;
    } else {
      this.type = 'event';
    }
    this.success = true;
  }
  
  /**
  */
  function Injector() {
    this._connection = null;
    this._messagesCache = [];
    this.commands = {};
  }

  inherits(Injector, EventEmitter);

  Object.defineProperties(Injector.prototype, {
  /** @type {boolean} */
    connected: {
      get: function() {
        return connected;
      }
    }
  });

  /**
  * @param {string} message
  */
  Injector.prototype.send = function(message) {
    if (this.connected) {
      var data = 'Content-Length: ' + Buffer.byteLength(message, 'utf8') + '\r\n\r\n' + message;
      this._connection.write(data);
    }
    else {
      this._messagesCache.push(message);
    }
  };

  /**
  * @param {string} eventName
  * @param {Object} messageBody
  */
  Injector.prototype.sendEvent = function(eventName, messageBody) {
    var message = new ProtocolMessage();
    message.event = eventName;
    message.body = messageBody;
    this.send(JSON.stringify(message));
  };
  
  /**
  */
  Injector.prototype.close = function() {
    this.emit('close');
    this.removeAllListeners();
    this._connection.close();
    this._connection = null;
    this._messageCache = null;
    this.commands = null;
  };

  /**
  * @param {Socket} connection
  */
  function attachInjector(connection) {
    var protocol = new Protocol();
    protocol.onResponse = processResponse.bind(injector);
    
    connection
      .on('data', protocol.execute.bind(protocol))
      .on('error', console.error.bind(console))
      .on('close', detachInjector);

    connected = true;

    injector._connection = connection;
    injector._messagesCache.forEach(injector.send, injector);
    injector._messagesCache.length = 0;
    injector.emit('connect');
  }

  /**
  * @param {boolean} error
  */
  function detachInjector(error) {
    injector.close();
    connected = false;
    server
      .removeAllListeners()
      .destroy();

    server = null;
  }

  function processResponse(message){
    message = message.body;
    switch (message.type) {
      case 'event':
        injector.emit(message.event, message);
        break;
      case 'request':
        var response = new ProtocolMessage(message);
        try {
          injector.commands[message.command](message, response);
        } catch (e) {
          response.success = false;
          response.message = e.message;
        }
        this.send(JSON.stringify(response));
        break;
      default:
        console.log('Unknown message type: ' + message.type);
        break;
    }
  }
  
  server
    .on('connection', attachInjector)
    .on('error', console.error.bind(console))
    .listen()
    .unref();

  injector = new Injector();
  injections.forEach(function(injection, i) {
    injection(require, injector, options[i]);
  });
  
  return server.address().port;
}

module.exports = injectorServer;
