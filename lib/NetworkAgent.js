var fs = require('fs');
var path = require('path');
var dataUri = require('strong-data-uri');

function NetworkAgent() {
}

NetworkAgent.prototype.loadResourceForFrontend = function(params, done) {
  if (/^data:/.test(params.url)) {
    try {
      done(null, {
        statusCode: 200,
        headers: {},
        content: dataUri.decode(params.url).toString('ascii')
      });
    } catch (err) {
      done(err);
    }
    return;
  }

  loadFileResource(params, done);
}

function loadFileResource(params, done) {
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
