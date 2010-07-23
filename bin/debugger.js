var net = require('net'),
    events = require('events'),
    sys = require('sys');

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
  var connected = false;
  var buffer = '';
  var msg = false;
  var conn = net.createConnection(port);
  conn.setEncoding('ascii');
  
  function parse() {
    if (msg && msg.headersDone) {
      //parse body
      if (buffer.length >= msg.contentLength) {
        msg.body = buffer.slice(0, msg.contentLength);
        buffer = buffer.slice(msg.contentLength);
        if (msg.body.length > 0) {
          var obj = JSON.parse(msg.body);
          debugr.emit('data', obj);
        }
        msg = false;
        parse();
      }
      return;
    }
    if (!msg) msg = makeMessage();

    var offset = buffer.indexOf('\r\n\r\n');
    if (offset > 0) {
      msg.headersDone = true;
      msg.headers = buffer.substr(0, offset+4);
      var m = /Content-Length: (\d+)/.exec(msg.headers);
      if (m[1]) {
        msg.contentLength = parseInt(m[1], 10);
      }
      else {
        sys.debug('no Content-Length');
      }
      buffer = buffer.slice(offset+4);
      parse();
    }
  }

  var debugr = Object.create(events.EventEmitter.prototype, {
    request: {
      value: function(data)
      {
        if (connected) {
          var message = 'Content-Length: ' + data.length + '\r\n\r\n' + data;
          conn.write(message);
        }
      }},
    close: {
      value: function()
      {
        conn.end();
      }}
    });

  debugr.__defineGetter__('connected', function() { return connected; });

  conn.on('connect', function() {
    connected = true;
    debugr.emit('connect');
  });

  conn.on('data', function(data) {
    buffer += data;
    parse();
  });

  conn.on('end', function() {
    debugr.close();
  });
  
  conn.on('close', function() {
    connected = false;
    debugr.emit('close');
  });

  return debugr;
};


