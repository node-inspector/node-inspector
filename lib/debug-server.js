var Http = require('http'),
    EventEmitter = require('events').EventEmitter,
    path = require('path'),
    WebSocket = require('../vendor/ws/server'),
    paperboy = require('../vendor/paperboy'),
    Session = require('./session');
    
var WEBROOT = path.join(path.dirname(__filename), '../front-end');
function staticFile(req, res) {
  req.url = req.url.replace(/^\/debug/, '/');
  paperboy.deliver(WEBROOT, req, res);
}

function override(options, defaults) {
  var result = {};
  Object.keys(defaults).forEach(function (key) {
    result[key] = options[key] || defaults[key];
  });
  return result;
}

exports.create = function(options) {
  var defaults = { webPort: 8080 },
      settings = override(options || {}, defaults),
      httpServer = Http.createServer(staticFile),
      wsServer = WebSocket.createServer({server: httpServer});

  wsServer.on('connection', function (conn) {
    var port = parseInt((/\?port=(\d+)/.exec(conn._req.url) || [null,'5858'])[1], 10),
        session = Session.create(conn, port);

    conn.on('message', function (data) {
      session.handleRequest(data);
    });
    conn.on('close', function () {
      session.close();
      console.log('connection closed');
    });
  });

  wsServer.listen(settings.webPort);

  wsServer.on('listening', function(){
    console.log(
      'visit http://127.0.0.1:' +
      settings.webPort +
      '/debug?port=5858 to start debugging');
  });

  return Object.create(EventEmitter.prototype, {
    close: {
      value: function ()
      {
        if (wsServer) {
          wsServer.close();
        }
        this.emit('close');
      }
    },
    webPort: {
      get: function () { return settings.webPort; }
    }
  });
};
