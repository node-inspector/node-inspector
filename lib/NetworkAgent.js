var fs = require('fs');
var path = require('path');

function NetworkAgent() {
}

NetworkAgent.prototype.loadResourceForFrontend = function(params, done) {
  var uri
  var match = params.url.match(/^file:\/\/(.*)$/);
  if (!match) {
    return done(
      'URL scheme not supported by Network.loadResourceForFrontend: ' +
        params.url);
  }

  var filePath = match[1];

  if (process.platform == 'win32') {
   // On Windows, we should receive '/C:/path/to/file'.
   if (!/^\/[a-zA-Z]:\//.test(filePath)) {
     return done('Invalid windows path: ' + filePath);
   }

   // Remove leading '/' and replace all other '/' with '\'
   filePath = filePath.slice(1).split('/').join(path.sep);
  }

  // ensure there are no ".." in the path
  filePath = path.normalize(filePath);

  fs.readFile(
    filePath,
    { encoding: 'utf8' },
    function(err, content) {
      if (err) return done(err);
      done(null, {
        statusCode: 200,
        headers: {},
        content: content
      });
    }
  );
}

NetworkAgent.prototype.setUserAgentOverride = function(params, done) {
  done(null, {});
}

exports.NetworkAgent = NetworkAgent;
