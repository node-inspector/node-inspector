var fs = require('fs');
var co = require('co');
var path = require('path');
var dataUri = require('strong-data-uri');
var inherits = require('util').inherits;
var promisify = require('bluebird').promisify;
var BaseAgent = require('./BaseAgent.js');

var _injection = require.resolve('../Injections/NetworkAgent');

function NetworkAgent(config, session) {
  BaseAgent.call(this, config, session);

  this._name = 'Network';
  this._inject = true;
  this._injectorClient = session.injectorClient;

  this._capturingEnabled = true;
  this._dataStorage = {};

  try {
    this._inject = !(config.inject === false || config.inject.network === false);
  } catch (e) {}

  this.registerEvent('requestWillBeSent');
  this.registerEvent('responseReceived');
  this.registerEvent('dataReceived');
  this.registerEvent('loadingFinished');
  this.registerEvent('loadingFailed');

  this.registerEvent('_requestWillBeSent', this._registerInDataStorage.bind(this));
  this.registerEvent('_dataReceived', this._saveToDataStorage.bind(this));
  this.registerEvent('_loadingFinished', this._constructRequestData.bind(this));
  this.registerEvent('_loadingFailed', this._dumpRequestData.bind(this));

  this.registerCommand('_setCapturingEnabled', this._setCapturingEnabled.bind(this));
  this.registerCommand('_clearCapturedData', this._clearCapturedData.bind(this));
  this.registerCommand('getResponseBody', this.getResponseBody.bind(this));
  this.registerCommand('loadResourceForFrontend', this.loadResourceForFrontend.bind(this));

  this._ready = this._inject ? this._injection() : Promise.resolve();
}
inherits(NetworkAgent, BaseAgent);

NetworkAgent.prototype._injection = function() {
  var injection = function(require, debug, options) {
    require(options.injection)(require, debug, options);
  };
  var options = { injection: _injection };

  return new Promise((resolve, reject) => this._injectorClient.injection(
    injection,
    options,
    (error, result) => (error ? reject : resolve)(error && error.message || error)
  ));
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

NetworkAgent.prototype._setCapturingEnabled = function(params) {
  this._capturingEnabled = params.enabled;
};

NetworkAgent.prototype._clearCapturedData = function(params) {
  Object.keys(this._dataStorage).forEach(key => this._dataStorage[key].dispose());
  this._dataStorage = {};
};

NetworkAgent.prototype.getResponseBody = function(params) {
  return co(function * () {
      var response = this._dataStorage[params.requestId];

      if (!response)
        return Promise.reject(new Error('There is no data for request #' + params.requestId));

      var result = yield {
        base64Encoded: false,
        body: response.data
      };

      return result;
  });
};

NetworkAgent.prototype.loadResourceForFrontend = function(params) {
  return co(function * () {
    if (!/^data:/.test(params.url))
      return yield loadFileResource(params);

    return {
      statusCode: 200,
      headers: {},
      content: dataUri.decode(params.url).toString('ascii')
    }
  });
};

function loadFileResource(params) {
  return co(function * () {
    var match = params.url.match(/^file:\/\/(.*)$/);
    if (!match) {
      return Promise.reject(
        new Error('URL scheme not supported by Network.loadResourceForFrontend: ' + params.url));
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

    return yield {
      statusCode: 200,
      headers: {},
      content: promisify(fs.readFile)(filePath, { encoding: 'utf8' })
    };
  });
}

function ResponseData() {
  this._data = [];
  this._finished = false;

  this.data = new Promise((resolve, reject) => {
    this._resolve = resolve;
    this._reject = reject;
  });
}

ResponseData.prototype.finish = function() {
  if (this._finished) return;
  this._finished = true;

  this._data = this._data.join('');
  this._resolve(this._data);
};

ResponseData.prototype.dump = function() {
  if (this._finished) return;
  this._finished = true;

  this._data = '';
  this._resolve(this._data);
};

ResponseData.prototype.push = function(chunk) {
  this._data.push(chunk);
};

ResponseData.prototype.dispose = function() {
  this.dump();
};

module.exports = NetworkAgent;
module.exports.NetworkAgent = NetworkAgent;
