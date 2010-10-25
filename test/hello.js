var http = require('http');

var x = 0;
http.createServer(function (req, res) {
  x += 1;
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hello World ' + x);
}).listen(8124);
console.log('Server running at http://127.0.0.1:8124/');
