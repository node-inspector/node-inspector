var Http = require('http'),
    EventEmitter = require('events').EventEmitter,
    path = require('path'),
    WebSocket = require('websocket-server'),
    paperboy = require('paperboy'),
    Session = require('./session'),
    WEBROOT = path.join(__dirname, '../front-end'),
    sessions = {};

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
        session = sessions[port];
    if (!session) {
      session = Session.create(port, config);
      sessions[port] = session;
    }
    session.join(conn)
    // XXX should session and debugger be bound together?
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
