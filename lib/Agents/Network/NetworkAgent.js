'use strict';

const co = require('co');
const fs = require('mz/fs');
const path = require('path');
const dataUri = require('strong-data-uri');

const ResponseData = require('./ResponseData.js');

class NetworkAgent extends require('../InjectableAgent') {
  /**
   * @param {Config} config
   * @param {Session} session
   */
  constructor(config, session) {
    super('Network', config, session);

    this._capturingEnabled = true;
    this._dataStorage = {};

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

    this._ready = this._inject ? this.injected() : Promise.resolve();
  }

  get injection() {
    return {
      injection: require.resolve('./NetworkInjection.js')
    };
  }

  _registerInDataStorage(message) {
    if (!this._capturingEnabled) return;

    var requestId = message.requestId;
    if (this._dataStorage[requestId])
      throw new Error(`Data storage for request #${requestId} already exists`);

    this._dataStorage[requestId] = new ResponseData();
  }

  _saveToDataStorage(message) {
    if (!this._capturingEnabled) return;

    const responseData = this._dataStorage[message.requestId];
    if (!responseData) return;

    responseData.push(message.data);
  }

  _constructRequestData(message) {
    if (!this._capturingEnabled) return;

    const responseData = this._dataStorage[message.requestId];
    if (!responseData) return;

    responseData.finish();
  }

  _dumpRequestData(message) {
    if (!this._capturingEnabled) return;

    const responseData = this._dataStorage[message.requestId];
    if (!responseData) return;

    responseData.dump();
  }

  _setCapturingEnabled(params) {
    this._capturingEnabled = params.enabled;
  }

  _clearCapturedData(params) {
    Object.keys(this._dataStorage).forEach(key => this._dataStorage[key].dump());
    this._dataStorage = {};
  }

  getResponseBody(params) {
    return co(function * () {
        const response = this._dataStorage[params.requestId];

        if (!response)
          throw new Error(`There is no data for request #${params.requestId}`);

        return yield {
          base64Encoded: false,
          body: response.data
        };
    }.bind(this));
  }

  loadResourceForFrontend(params) {
    return co(function * () {
      if (!/^data:/.test(params.url))
        return yield loadFileResource(params);

      return {
        statusCode: 200,
        headers: {},
        content: dataUri.decode(params.url).toString('ascii')
      }
    });
  }
}

function loadFileResource(params) {
  return co(function * () {
    const match = params.url.match(/^file:\/\/(.*)$/);

    if (!match)
      throw new Error(`URL scheme not supported: ${params.url}`);

    let filePath = match[1];

    if (process.platform == 'win32') {
      // On Windows, we should receive '/C:/path/to/file'.
      if (!/^\/[a-zA-Z]:\//.test(filePath))
        throw new Error(`Invalid windows path: ${filePath}`);

      // Remove leading '/' and replace all other '/' with '\'
      filePath = filePath.slice(1).replace(/\//g, path.sep);
    }

    // ensure there are no ".." in the path
    filePath = path.normalize(filePath);

    return yield {
      statusCode: 200,
      headers: {},
      content: fs.readFile(filePath, 'utf8')
    };
  });
}

module.exports = NetworkAgent;
