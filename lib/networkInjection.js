// This function will be injected into the target process.
module.exports = function(require, debug, options) {
  var url = require('url');
  var STATUS_CODES = require('http').STATUS_CODES || {};

  var lastRequestId = 0;

  function _makeStackTrace(fn) {
    var backup = Error.prepareStackTrace;
    Error.prepareStackTrace = function(_, stack) { return stack; };
    var err = new Error();
    Error.captureStackTrace(err, fn);
    var stack = err.stack;
    Error.prepareStackTrace = backup;

    // TODO: handle empty stack (breaks frontend)
    return stack.map(function(frame) {
      return {
        url: (frame.getFileName() && 'file://' + frame.getFileName()) || frame.getEvalOrigin(),
        functionName: frame.getFunctionName(),
        lineNumber: frame.getLineNumber(),
        columnNumber: frame.getColumnNumber()
      };
    });
  }

  // Dirty trick reaching deep into core to access the headers about to be sent
  // Likely to break eventually.
  function _renderHeaders(req) {
    var headers = req._headers;
    if (!headers) return {};

    var out = {}, names = Object.keys(headers);
    names.forEach(function(name) {
      out[req._headerNames[name]] = String(headers[name]);
    });

    return out;
  }

  function _removeArraysFromHeaders(headers) {
    var out = {}, names = Object.keys(headers);
    names.forEach(function(name) {
      var value = headers[name];
      if (Array.isArray(value)) {
        value = value.join('\n');
      }
      out[name] = String(value);
    });
    return out;
  }

  var DEFAULT_MIME = 'text/plain';
  function _getMimeType(headers) {
    if (typeof headers['content-type'] === 'string') {
      return headers['content-type'].split(';')[0] || DEFAULT_MIME;
    }
    return DEFAULT_MIME;
  }

  function _patchLib(protocolLib, defaultProtocol) {
    var originalRequest;
    originalRequest = protocolLib.request;
    protocolLib.request = request;

    function _unpatchLib() {
      protocolLib.request = originalRequest;
    }

    function request(options, onResponse) {
      if (typeof options === 'string') {
        options = url.parse(options);
      }
      options.protocol = options.protocol || defaultProtocol;

      var initiatorStackTrace = _makeStackTrace(request);

      var requestId = '' + (++lastRequestId);
      var loaderId = requestId;
      var documentURL = url.format(options.uri || options);
      var clientRequest = originalRequest(options);
      var originalEnd = clientRequest.end;
      clientRequest.end = function end() {
        var data = {
          requestId: requestId,
          loaderId: loaderId,
          documentURL: documentURL,
          request: {
            headers: _renderHeaders(clientRequest),
            method: clientRequest.method,
            postData: '', // TODO: capture POST data/clientRequest.write
            url: documentURL
          },
          timestamp: Date.now(),
          initiator: {
            stackTrace: initiatorStackTrace,
            type: 'script'
          }
        };
        debug.command('Network.requestWillBeSent', data);
        return originalEnd.apply(this, arguments);
      };

      function patchResponse(clientResponse) {
        var mimeType = _getMimeType(clientResponse.headers);

        var data = {
          requestId: requestId,
          loaderId: loaderId,
          timestamp: Date.now(),
          type: 'XHR',
          response: {
            connectionId: requestId,
            connectionReused: false,
            // TODO: Could use .rawHeaders to show original casing
            headers: _removeArraysFromHeaders(clientResponse.headers),
            mimeType: mimeType,
            status: clientResponse.statusCode,
            statusText: STATUS_CODES[clientResponse.statusCode] || '?',
            url: documentURL
          }
        };
        debug.command('Network.responseReceived', data);

        // TODO: capture response data
      }

      clientRequest.on('response', patchResponse);

      if (onResponse !== undefined) {
        clientRequest.on('response', onResponse);
      }

      return clientRequest;
    }

    debug.on('close', _unpatchLib);
  }

  debug.register('Network.requestWillBeSent', debug.commandToEvent);
  debug.register('Network.responseReceived', debug.commandToEvent);

  _patchLib(require('http'), 'http:');
  _patchLib(require('https'), 'https:');
};
