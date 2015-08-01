/*jshint debug:true */
var http = require('http');

var commands = {
  'log simple text': function() {
    console.log('test');
  },
  'log simple text async': function() {
    setTimeout(console.log.bind(console, 'test'), 0);
  },
  'log object': function() {
    console.log({ a: 'test' });
  },
  'log console': function() {
    console.log(console);
  },
  'log in loop': function() {
    var a = 0;
    console.log(a);
    setInterval(function(){
      console.log(++a);
    }, 1000);
  },
  'pause': function() {
    debugger;
  },
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
  'send GET request to unexisted server': function() {
    http.request({
      method: 'GET',
      host: '127.0.0.2',
      path: '/page?a=b',
      port: '80'
    })
    .once('error', function() {/*noop*/})
    .end();
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
};

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

var buffer = '';
process.stdin.on('data', function(data) {
  buffer += data;
  while(/\n/.test(buffer)) {
    var parts = buffer.split('\n');
    var command = parts.splice(0, 1);
    buffer = parts.join('\n');

    if (commands[command]) commands[command]();
  }
});
