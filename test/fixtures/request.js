var http = require('http');

var server = http.createServer(function(req, res) {
  res.statusCode = 201;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(req.headers));
});
server.listen(0, sendRequest);

function sendRequest() {
  var opts = 'http://127.0.0.1:' + server.address().port + '/page?a=b';
  // var opts = {
  //   host: '127.0.0.1',
  //   port: server.address().port,
  //   path: '/page?a=b'
  // };
  var req = http.request(opts);
  req.on('response', function(res) {
    res.setEncoding('utf8');
    res.on('data', function(chunk) {
      console.log(chunk);
    });
    res.on('end', function() {
      console.log('ok');
      server.close();
    });
  });
  req.setHeader('Content-Type', 'application/json');
  req.setHeader('Content-Length', 12);
  req.end('{"x":[true]}');
}
