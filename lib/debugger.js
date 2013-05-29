var Net = require('net'),
    EventEmitter = require('events').EventEmitter,
    Buffer = require('buffer').Buffer,
    callbackHandler = require('./callback').create();

function makeMessage() {
  return {
    headersDone: false,
    headers: null,
    contentLength: 0
  };
}

///////////////////////////////////////////////////////////
//  exports

exports.attachDebugger = function(port) {
  var connected = false,
      debugBuffer = '',
      msg = false,
      conn = Net.createConnection(port),
      debugr,
      offset,
      contentLengthMatch,
      lastError;
  conn.setEncoding('utf8');

  function parse() {
    var b, obj;
    if (msg && msg.headersDone) {
      //parse body
      if (Buffer.byteLength(debugBuffer) >= msg.contentLength) {
        b = new Buffer(debugBuffer);
        msg.body = b.toString('utf8', 0, msg.contentLength);
        debugBuffer = b.toString('utf8', msg.contentLength, b.length);
        if (msg.body.length > 0) {
          obj = JSON.parse(msg.body);
          if (typeof obj.running === 'boolean') {
            debugr.isRunning = obj.running;
          }
          if (obj.type === 'response' && obj.request_seq > 0) {
            callbackHandler.processResponse(obj.request_seq, [obj]);
          }
          else if (obj.type === 'event') {
            debugr.emit(obj.event, obj);
          }
        }
        msg = false;
        parse();
      }
      return;
    }
    if (!msg) {
      msg = makeMessage();
    }

    offset = debugBuffer.indexOf('\r\n\r\n');
    if (offset > 0) {
      msg.headersDone = true;
      msg.headers = debugBuffer.substr(0, offset + 4);
      contentLengthMatch = /Content-Length: (\d+)/.exec(msg.headers);
      if (contentLengthMatch[1]) {
        msg.contentLength = parseInt(contentLengthMatch[1], 10);
      }
      else {
        console.warn('no Content-Length');
      }
      debugBuffer = debugBuffer.slice(offset + 4);
      parse();
    }
  }

  debugr = Object.create(EventEmitter.prototype, {
    isRunning: { writable: true, value: true },

    send: {
      value: function(data)
      {
        if (connected) {
          conn.write('Content-Length: ' + data.length + '\r\n\r\n' + data);
        }
      }
    },

    request: {
      value: function(command, params, callback) {
        var msg = {
                   seq: 0,
                   type: 'request',
                   command: command
                  };
        if (typeof callback == 'function') {
          msg.seq = callbackHandler.wrap(callback);
        }
        if (params) {
          Object.keys(params).forEach(function(key) {
            msg[key] = params[key];
          });
        }
        this.send(JSON.stringify(msg));
      }
    },

    close: {
      value: function()
      {
        conn.end();
      }
    },
    connected: {
      get: function() { return connected; }
    }
  });

  conn.on('connect', function() {
    connected = true;
    debugr.emit('connect');
  });

  conn.on('data', function(data) {
    debugBuffer += data;
    parse();
  });

  conn.on('error', function(e) {
    if (e.code == 'ECONNREFUSED') {
      e.helpString = 'Is node running with --debug port ' + port + '?';
    } else if (e.code == 'ECONNRESET') {
      e.helpString = 'Check there is no other debugger client attached to port ' + port + '.';
    }

    lastError = e.toString();
    if (e.helpString) {
      lastError += '. ' + e.helpString;
    }

    debugr.emit('error', e);
  });

  conn.on('end', function() {
    debugr.close();
  });

  conn.on('close', function() {
    connected = false;
    debugr.emit('close', lastError || 'Debugged process exited.');
  });

  return debugr;
};

