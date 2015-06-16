var fs = require('fs');
var path = require('path');
var dataUri = require('strong-data-uri');

var networkInjection = require('./networkInjection');

function NetworkAgent(config, session) {
  this._noInject = config.inject === false;
  this._debuggerClient = session.debuggerClient;
  this._frontendClient = session.frontendClient;
  this._injectorClient = session.injectorClient;

  if (!this._noInject) this._injectorClient.on('inject', this._inject.bind(this));
}

NetworkAgent.prototype._inject = function(injected) {
  if (!injected) return;

  this._translateEventToFrontend(
    'requestWillBeSent',
    'responseReceived'
  );

  this._injectorClient.injection(
    networkInjection,
    {},
    function(error, result) {
      this._injected = !error;

      if (error) return this._frontendClient.sendLogToConsole('error', error.message || error);
    }.bind(this)
  );
};

/**
 * @param {...string} eventNames
*/
NetworkAgent.prototype._translateEventToFrontend = function(eventNames) {
  Array.prototype.forEach.call(arguments, function(event) {
    event = 'Network.' + event;
    this._debuggerClient.registerDebuggerEventHandlers(event);
    this._debuggerClient.on(event, function(message) {
      this._frontendClient.sendEvent(event, message);
    }.bind(this));
  }, this);
};

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
};

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
};

exports.NetworkAgent = NetworkAgent;
