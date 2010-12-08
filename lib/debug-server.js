var Http = require('http'),
    EventEmitter = require('events').EventEmitter,
    path = require('path'),
    WebSocket = require('../vendor/ws'),
    paperboy = require('../vendor/paperboy'),
    debugr = require('./debugger'),
    Session = require('./session');

var WEBROOT = path.join(__dirname, '../front-end');
function staticFile(req, res) {
  req.url = req.url.replace(/^\/debug/, '/');
  paperboy.deliver(WEBROOT, req, res);
}

function override(options, defaults) {
  var result = {};
  Object.keys(defaults).forEach(function(key) {
    result[key] = options[key] || defaults[key];
  });
  return result;
}

exports.create = function(options, config) {
  var defaults = { webPort: config.webPort },
      settings = override(options || {}, defaults),
      httpServer = Http.createServer(staticFile),
      wsServer = WebSocket.createServer({server: httpServer}),
      debugPort = config.debugPort.toString();

  wsServer.on('connection', function(conn) {
    var port =
        parseInt((/\?port=(\d+)/.exec(conn._req.url) || [null, debugPort])[1], 10),
        session = Session.create(conn, debugr, port, config);

    conn.on('message', function(data) {
      session.handleRequest(data);
    });
    conn.on('close', function() {
      session.close();
      console.log('connection closed');
    });
  });

  wsServer.listen(settings.webPort);

  wsServer.on('listening', function() {
    console.log(
        'visit http://0.0.0.0:' +
        settings.webPort +
        '/debug?port=5858 to start debugging');
  });

  return Object.create(EventEmitter.prototype, {
    close: {
      value: function()
      {
        if (wsServer) {
          wsServer.close();
        }
        this.emit('close');
      }
    },
    webPort: {
      get: function() { return settings.webPort; }
    }
  });
};
