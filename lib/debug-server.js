var http = require('http'),
    events = require('events'),
    path = require('path'),
    ws = require('../vendor/ws'),
    paperboy = require('../vendor/paperboy'),
    dsession = require('./session');
    
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

exports.createServer = function(options) {
  var defaults = { webPort: 8080 },
      settings = override(options || {}, defaults),
      httpServer = http.createServer(staticFile),
      wsServer = ws.createServer({server: httpServer});

  wsServer.on('connection', function (conn) {
    var port = parseInt((/\?port=(\d+)/.exec(conn._req.url) || [null,'5858'])[1], 10);
    var session = dsession.createSession(conn, port);
    conn.on('message', function (data) {
      session.handleRequest(data);
    });
    conn.on('close', function () {
      session.close();
      console.log('connection closed');
    });
  });

  wsServer.listen(settings.webPort);

  return Object.create(events.EventEmitter.prototype, {
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
