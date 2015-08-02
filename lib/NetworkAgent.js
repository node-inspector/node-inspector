var fs = require('fs');
var path = require('path');
var dataUri = require('strong-data-uri');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

var injection = require.resolve('./Injections/NetworkAgent');

function NetworkAgent(config, session) {
  try {
    this._noInject = config.inject === false || config.inject.network === false;
  } catch (e) {
    this._noInject = false;
  }

  this._debuggerClient = session.debuggerClient;
  this._frontendClient = session.frontendClient;
  this._injectorClient = session.injectorClient;

  this._capturingEnabled = true;
  this._dataStorage = {};

  if (!this._noInject) this._injectorClient.on('inject', this._inject.bind(this));
}

NetworkAgent.prototype._inject = function(injected) {
  if (!injected) return;

  this._translateEventToFrontend(
    'requestWillBeSent',
    'responseReceived',
    'dataReceived',
    'loadingFinished',
    'loadingFailed'
  );

  this._handleEvent('_requestWillBeSent', this._registerInDataStorage.bind(this));
  this._handleEvent('_dataReceived', this._saveToDataStorage.bind(this));
  this._handleEvent('_loadingFinished', this._constructRequestData.bind(this));
  this._handleEvent('_loadingFailed', this._dumpRequestData.bind(this));

  this._injectorClient.injection(
    function(require, debug, options) {
      require(options.injection)(require, debug, options);
    },
    {
      injection: injection
    },
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

NetworkAgent.prototype._handleEvent = function(event, handle) {
  event = 'Network.' + event;
  this._debuggerClient.registerDebuggerEventHandlers(event);
  this._debuggerClient.on(event, handle);
};

NetworkAgent.prototype._registerInDataStorage = function(message) {
  if (!this._capturingEnabled) return;

  var requestId = message.requestId;
  if (this._dataStorage[requestId])
    throw new Error('Data storage for request #' + requestId + ' already exists');

  this._dataStorage[requestId] = new ResponseData();
};

NetworkAgent.prototype._saveToDataStorage = function(message) {
  if (!this._capturingEnabled) return;

  var responseData = this._dataStorage[message.requestId];
  if (!responseData) return;

  responseData.push(message.data);
};

NetworkAgent.prototype._constructRequestData = function(message) {
  if (!this._capturingEnabled) return;

  var responseData = this._dataStorage[message.requestId];
  if (!responseData) return;

  responseData.finish();
};

NetworkAgent.prototype._dumpRequestData = function(message) {
  if (!this._capturingEnabled) return;

  var responseData = this._dataStorage[message.requestId];
  if (!responseData) return;

  responseData.dump();
};

NetworkAgent.prototype.getResponseBody = function(params, done) {
  var responseData = this._dataStorage[params.requestId];

  if (!responseData)
    return done(new Error('There is no data for request #' + params.requestId));

  var result = {
    base64Encoded: false,
    body: null
  };

  if (!responseData.finished) {
    responseData.once('finish', function(data) {
      result.body = data;
      done(null, result);
    });
  } else {
    process.nextTick(function() {
      result.body = responseData.data;
      done(null, result);
    });
  }
};

NetworkAgent.prototype._setCapturingEnabled = function(params, done) {
  this._capturingEnabled = params.enabled;
  done();
};

NetworkAgent.prototype._clearCapturedData = function(params, done) {
  Object.keys(this._dataStorage).forEach(function(key) {
    this._dataStorage[key].dispose();
  }, this);
  this._dataStorage = {};
  done();
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

function ResponseData(id) {
  this.data = [];
  this.finished = false;
}
inherits(ResponseData, EventEmitter);

ResponseData.prototype.finish = function() {
  if (this.finished) return;

  this.data = this.data.join('');
  this.finished = true;
  this.emit('finish', this.data);
};

ResponseData.prototype.dump = function() {
  if (this.finished) return;

  this.data = '';
  this.finished = true;
  this.emit('finish', this.data);
};

ResponseData.prototype.push = function(chunk) {
  this.data.push(chunk);
};

ResponseData.prototype.dispose = function() {
  if (!this.finished) this.dump();

  this.removeAllListeners();
};

exports.NetworkAgent = NetworkAgent;
