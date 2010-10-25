var http = require('http'),
    events = require('events'),
    path = require('path'),
    ws = require('../vendor/ws'),
    paperboy = require('../vendor/paperboy'),
    dsession = require('./session');
    
var WEBROOT = path.join(path.dirname(__filename), '../front-end');
function staticFile(req, res) {
  paperboy
    .deliver(WEBROOT, req, res)
    .error(function (statCode, msg) {
      res.writeHead(statCode, {'Content-Type': 'text/plain'});
      res.end("Error: " + statCode);
    })
    .otherwise(function (err) {
      var statCode = 404;
      res.writeHead(statCode, {'Content-Type': 'text/plain'});
      res.end();
    });
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
    var session = dsession.createSession(conn);
    conn.on('message', function (data) {
      session.handleRequest(data);
    });
    conn.on('close', function () {
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
