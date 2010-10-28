var net = require('net'),
    events = require('events'),
    Buffer = require('buffer').Buffer,
    callback = require('./callback').create();

function makeMessage() {
  return {
    headersDone: false,
    headers: null,
    contentLength: 0
  };
}

///////////////////////////////////////////////////////////
//  exports

exports.attachDebugger = function (port) {
  var connected = false,
      buffer = '',
      msg = false,
      conn = net.createConnection(port),
      debugr,
      offset,
      m;
  conn.setEncoding('utf8');

  function parse() {
    if (msg && msg.headersDone) {
      //parse body
      if (Buffer.byteLength(buffer) >= msg.contentLength) {
        var b = new Buffer(buffer);
        msg.body = b.toString('utf8', 0, msg.contentLength);
        buffer = b.toString('utf8', msg.contentLength, b.length);
        if (msg.body.length > 0) {
          var obj = JSON.parse(msg.body);
          if (obj.type === 'response' && obj.request_seq > 0) {
            callback.processResponse(obj.request_seq, [obj]);
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

    offset = buffer.indexOf('\r\n\r\n');
    if (offset > 0) {
      msg.headersDone = true;
      msg.headers = buffer.substr(0, offset + 4);
      m = /Content-Length: (\d+)/.exec(msg.headers);
      if (m[1]) {
        msg.contentLength = parseInt(m[1], 10);
      }
      else {
        console.warn('no Content-Length');
      }
      buffer = buffer.slice(offset + 4);
      parse();
    }
  }

  debugr = Object.create(events.EventEmitter.prototype, {
    send: {
      value: function (data)
      {
        if (connected) {
          var message = 'Content-Length: ' + data.length + '\r\n\r\n' + data;
          conn.write(message);
        }
      }
    },
    request: {
     value: function (command, params, cb) {
        var seq = 0;
        if (typeof cb == 'function') {
          seq = callback.wrap(cb);
        }
        var msg = {
          seq: seq,
          type: 'request',
          command: command
        };
        if (params) {
          Object.keys(params).forEach(function(key) {
            msg[key] = params[key];
          });
        }
        this.send(JSON.stringify(msg));
      }
    },
    close: {
      value: function ()
      {
        conn.end();
      }
    },
    connected: {
      get: function() { return connected; }
    }
  });

  conn.on('connect', function () {
    connected = true;
    debugr.emit('connect');
  });

  conn.on('data', function (data) {
    buffer += data;
    parse();
  });
  
  conn.on('error', function(e) {
    debugr.emit('error', e);
  });

  conn.on('end', function () {
    debugr.close();
  });
  
  conn.on('close', function () {
    connected = false;
    debugr.emit('close');
  });

  return debugr;
};

