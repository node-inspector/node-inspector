var http = require('http');

module.exports = function(commands) {
  Object.assign(commands, {
    'send GET request': function() {
      startServer({
          res: {
            statusCode: 200,
            headers: {
              'X-RESPONSE-HEADER': 'X-RESPONSE-DATA'
            },
            data: 'RESPONSE DATA'
          }
        },
        function sendRequest(server) {
          http.request({
            method: 'GET',
            host: '127.0.0.1',
            path: '/page?a=b',
            port: server.address().port,
            headers: {
              'X-REQUEST-HEADER': 'X-REQUEST-DATA'
            }
          })
          .end('Body for GET request? Really?!');
        }
      );
    },
    'send GET request with unhandled failure': function() {
      startServer({
          res: {},
          destroy: true
        },
        function sendRequest(server) {
          http.request({
            method: 'GET',
            host: '127.0.0.1',
            path: '/page?a=b',
            port: server.address().port
          }).end();
        }
      );
    },
    'send GET request with handled failure': function() {
      startServer({
          res: {},
          destroy: true
        },
        function sendRequest(server) {
          http.request({
            method: 'GET',
            host: '127.0.0.1',
            path: '/page?a=b',
            port: server.address().port
          })
          .once('error', function() {/*noop*/})
          .end();
        }
      );
    },
    'send GET request aborted on creation step': function() {
      startServer({
          res: {
            statusCode: 200
          }
        },
        function sendRequest(server) {
          var req = http.request({
            method: 'GET',
            host: '127.0.0.1',
            path: '/page?a=b',
            port: server.address().port
          });
          req.end();
          req.abort();
        }
      );
    },
    'send GET request aborted on response step': function() {
      startServer({
          res: {
            statusCode: 200
          }
        },
        function sendRequest(server) {
          var req = http.request({
            method: 'GET',
            host: '127.0.0.1',
            path: '/page?a=b',
            port: server.address().port
          }).on('response', function(res) {
            res.req.abort();
          }).end();
        }
      );
    }
  });
}

function startServer(options, callback) {
  var server = http.createServer(function(req, res) {
    res.statusCode = options.res.statusCode;

    // set headers
    if (options.res.headers)
      Object.keys(options.res.headers).forEach(function(key) {
        res.setHeader(key, options.res.headers[key]);
      });

    if (options.destroy) {
      res.socket.destroy();
    } else {
      res.end(options.res.data);
    }

    server.close();
  }).listen(0, function() {
    callback(server);
  });
}
