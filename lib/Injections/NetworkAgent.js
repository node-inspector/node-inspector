// This function will be injected into the target process.
module.exports = function injection(require, debug, options) {
  var http = require('http'),
    https = require('https'),
    EventEmitter = require('events').EventEmitter;

  var addRequest = http.Agent.prototype.addRequest,
      onSocket = http.ClientRequest.prototype.onSocket;

  var lastRequestId = 0,
      lastConnectionId = 0;

  function timestamp() {
    return Date.now() / 1000000;
  }

  function Timing() {
    this._hrtime = process.hrtime();

    this.json = {
      requestTime: Date.now() / 1000,
      proxyStart: -1,
      proxyEnd: -1,
      dnsStart: -1,
      dnsEnd: -1,
      connectStart: -1,
      connectEnd: -1,
      sslStart: -1,
      sslEnd: -1,
      serviceWorkerFetchStart: -1,
      serviceWorkerFetchReady: -1,
      serviceWorkerFetchEnd: -1,
      sendStart: -1,
      sendEnd: -1,
      receiveHeadersEnd: -1
    };
  }

  [
    'proxyStart', 'proxyEnd',
    'dnsStart', 'dnsEnd',
    'connectStart', 'connectEnd',
    'sslStart', 'sslEnd',
    'serviceWorkerFetchStart', 'serviceWorkerFetchReady', 'serviceWorkerFetchEnd',
    'sendStart', 'sendEnd',
    'receiveHeadersEnd'
  ].forEach(function(method) {
    Timing.prototype[method] = function() {
      var diff = process.hrtime(this._hrtime);
      this.json[method] = diff[0] * 1e3 + diff[1] / 1e6;
      return this;
    };
  });

  function getStackTrace() {
    var backup = Error.prepareStackTrace;

    Error.prepareStackTrace = function(_, stack) { return stack; };
    // We want to trim stack trace to display user caller function.
    // We wait what request will be sent by one of functions in `callers` list.
    // If function exists in stack trace, his length will be great than 0
    // If there is no known caller func we sent full stack trace
    var callers = [handleHttpRequest, http.request, http.get, https.request, https.get],
      error,
      stack;

    while (!stack && callers.length) {
      error = new Error();
      Error.captureStackTrace(error, callers.pop());
      if (error.stack.length) stack = error.stack;
    }

    if (!stack) stack = new Error().stack;

    Error.prepareStackTrace = backup;

    return stack.reduce(function(stack, frame) {
      var fileName = frame.getFileName();

      fileName = debug.convert.v8NameToInspectorUrl(fileName);

      var url = fileName || frame.getEvalOrigin();

      stack.push({
        url: url,
        functionName: frame.getFunctionName(),
        lineNumber: frame.getLineNumber(),
        columnNumber: frame.getColumnNumber()
      });

      return stack;
    }, []);
  }

  function renderHeaders(request) {
    var headers = request._headers;
    if (!headers) return {};

    return Object.keys(headers).reduce(function renderHeader(result, key) {
      var headerName = request._headerNames[key];
      result[headerName] = '' + headers[key];
      return result;
    }, {});
  }

  function getCorrectHeaders(response) {
    return Object.keys(response.headers).reduce(function correctHeader(result, key) {
      var value = response.headers[key];

      if (Array.isArray(value))
        value = value.join('\n');

      result[key] = '' + value;
      return result;
    }, {});
  }

  function getStatusText(response) {
    return response.statusMessage || http.STATUS_CODES[response.statusCode] || '?';
  }

  function restoreHeadersText(response) {
    var headers = response.rawHeaders;
    // TODO: there is no `rawHeaders` in node 0.10.*
    // We can wrap parser to find raw headers, but it's not so useful to see original string
    // So, maybe won't fix
    if (!headers) return;

    var headersPrefix = [
      'HTTP/' + response.httpVersion,
      response.statusCode,
      response.statusMessage
    ].join(' ');

    var joinedHeaders = [headersPrefix];
    while (headers.length)
      joinedHeaders.push(headers.splice(-2).join(': '));

    return joinedHeaders.join('\r\n') + '\r\n\r\n';
  }

  function getMimeType(response) {
    if (typeof response.headers['content-type'] != 'string')
      return 'text/plain';

    return response.headers['content-type'].split(';')[0];
  }

  function constructRequestInfo(request) {
    var requestId = request.__inspector_ID__;
    var timestamp = request.__inspector_timing__.json.requestTime;
    var url = request.__inspector_url__;

    return {
      requestId: requestId,
      loaderId: process.pid + '',
      documentURL: url,
      type: 'XHR',
      request: {
        headers: renderHeaders(request),
        method: request.method,
        postData: '',
        url: url
      },
      timestamp: timestamp,
      initiator: {
        stackTrace: getStackTrace(),
        type: 'script'
      }
    };
  }

  function constructResponseInfo(response) {
    var request = response.req;

    return {
      requestId: request.__inspector_ID__,
      loaderId: process.pid + '',
      timestamp: timestamp(),
      type: 'XHR',
      response: {
        url: request.__inspector_url__,
        status: response.statusCode,
        statusText: getStatusText(response),
        headers: getCorrectHeaders(response),
        mimeType: getMimeType(response),
        connectionReused: request.shouldKeepAlive,
        connectionId: request.connection.__inspector_ID__,
        encodedDataLength: -1,
        fromDiskCache: false,
        fromServiceWorker: false,
        timing: request.__inspector_timing__.json,
        headersText: restoreHeadersText(response),
        requestHeaders: renderHeaders(request),
        requestHeadersText: request._header
      }
    };
  }

  function constructFailureInfo(request, err, canceled) {
    // NOTE: If there is no other `error` listeners
    // handling of `error` event changes program behavior
    // We won't to destroy app on each failed request,
    // but we need to notify user about unhandled `error` event.
    var unhandled = err && EventEmitter.listenerCount(request, 'error') === 0;
    var errorText = (unhandled ? '(unhandled) ' : '') + (err && err.code);
    return {
      requestId: request.__inspector_ID__,
      timestamp: timestamp(),
      type: 'XHR',
      errorText: errorText,
      canceled: canceled
    };
  }

  function handleHttpRequest(options) {
    var timing = new Timing();
    var protocol = options.protocol || this.agent.protocol || 'http:',
      host = options.host,
      port = options.port,
      path = this.path;

    this.__inspector_timing__ = timing;
    this.__inspector_ID__ = '' + lastRequestId++;
    this.__inspector_url__ = protocol + '//' + host + ':' + port + path;

    var requestInfo = constructRequestInfo(this);

    // NOTE: if request was called as `http.request(options, cb)`
    // then there is one action, which we can't detect in handleHttpResponse.
    // We need to send this information to handleHttpResponse.
    var willBeHandled = EventEmitter.listenerCount(this, 'response') > 0;

    this.once('socket', handleSocket.bind(this, requestInfo));
    this.once('response', handleHttpResponse.bind(null, willBeHandled));
    this.once('error', handleFailure.bind(this, requestInfo));
    handleRequestData.call(this, requestInfo);
    handleAbort.call(this, requestInfo);

    timing.dnsStart();
  }

  function handleRequestData(requestInfo) {
    var oldWrite = this.write;

    this.write = function(chunk) {
      requestInfo.request.postData += chunk || '';
      return oldWrite.apply(this, arguments);
    };
  }

  function sendRequestWillBeSent(requestInfo) {
    if (requestInfo.handled) return;
    requestInfo.handled = true;

    debug.emitEvent('Network.requestWillBeSent', requestInfo);
    debug.emitEvent('Network._requestWillBeSent', {
      requestId: requestInfo.requestId
    });
  }

  function handleSocket(requestInfo, socket) {
    socket.__inspector_ID__ = socket.__inspector_ID__ || '' + lastConnectionId++;

    this.__inspector_timing__.dnsEnd().connectStart();

    socket.once('connect', function() {
      this.__inspector_timing__.connectEnd().sendStart();
      setImmediate(this.__inspector_timing__.sendEnd.bind(this.__inspector_timing__));
    }.bind(this));

    sendRequestWillBeSent(requestInfo);
  }

  function handleAbort(requestInfo) {
    var abort = this.abort;
    this.abort = function() {
      var result = abort.apply(this, arguments);
      handleFailure.call(this, requestInfo);
      return result;
    };
  }

  function handleFailure(requestInfo, err) {
    sendRequestWillBeSent(requestInfo);

    var failureInfo = constructFailureInfo(this, err, !err);
    debug.emitEvent('Network.loadingFailed', failureInfo);
    debug.emitEvent('Network._loadingFailed', {
      requestId: this.__inspector_ID__
    });
  }

  function handleHttpResponse(wasHandled, response) {
    var request = response.req;
    request.__inspector_timing__.receiveHeadersEnd();

    // NOTE: If there is no other `response` listeners
    // handling of `response` event changes program behavior
    // Without our listener all data will be dumped, but we pause data by our listener.
    // Most simple solution here to `resume` data stream, instead of dump it,
    // otherwise we'll never get a data.
    if (!wasHandled && EventEmitter.listenerCount(request, 'response') === 0)
      response.resume();

    var requestId = request.__inspector_ID__,
      responseInfo = constructResponseInfo(response),
      dataLength = 0;

    debug.emitEvent('Network.responseReceived', responseInfo);

    var push = response.push;

    response.push = function(chunk) {
      if (chunk) {
        dataLength += chunk.length;

        debug.emitEvent('Network._dataReceived', {
          requestId: requestId,
          data: chunk + ''
        });

        debug.emitEvent('Network.dataReceived', {
          requestId: requestId,
          timestamp: timestamp(),
          dataLength: chunk.length,
          encodedDataLength: chunk.length
        });
      }

      return push.apply(this, arguments);
    };

    response.once('end', function() {
      response.push = push;

      debug.emitEvent('Network._loadingFinished', {
        requestId: requestId
      });

      debug.emitEvent('Network.loadingFinished', {
        requestId: requestId,
        timestamp: timestamp(),
        encodedDataLength: dataLength
      });
    });
  }

  debug.registerEvent('Network.requestWillBeSent');
  debug.registerEvent('Network._requestWillBeSent');
  debug.registerEvent('Network.responseReceived');
  debug.registerEvent('Network.dataReceived');
  debug.registerEvent('Network._dataReceived');
  debug.registerEvent('Network.loadingFinished');
  debug.registerEvent('Network._loadingFinished');
  debug.registerEvent('Network.loadingFailed');
  debug.registerEvent('Network._loadingFailed');

  wrapHttpRequests();
  debug.once('close', unwrapHttpRequests);

  function wrapHttpRequests() {
    // We can't wrap only `onSocket` for handling all requests,
    // there is one case, when `onSocket` will be never called
    // (Agent + no free sockets)
    http.Agent.prototype.addRequest = function(req, options) {
      // NOTE: For node 0.10.*
      // We can't redefine options itself, this changes arguments
      var _options = options;

      // Legacy API: addRequest(req, host, port, path)
      if (typeof _options === 'string') {
        _options = {
          host: options,
          port: arguments[2],
          path: arguments[3]
        };
      }
      handleHttpRequest.call(req, _options);

      return addRequest.apply(this, arguments);
    };

    http.ClientRequest.prototype.onSocket = function(socket) {
      var handledByAddRequest = this.__inspector_ID__ !== undefined,
          isUnixSocket = this.socketPath,
          options;

      if (!handledByAddRequest && !isUnixSocket) {
        options = debug.getFromFrame(1, 'options');

        if (!options || !(options instanceof Object)) {
          console.error(
            'Unexpected state in node-inspector network profiling.\n' +
            'Something wrong with request `options` object in frame #1\n' +
            'Current stackstace:', new Error().stack
          );
        } else {
          handleHttpRequest.call(this, {
            host: options.host,
            port: options.port,
            path: this.path
          });
        }

        options = null;
      }

      return onSocket.apply(this, arguments);
    };
  }

  function unwrapHttpRequests() {
    http.Agent.prototype.addRequest = addRequest;
    http.ClientRequest.prototype.onSocket = onSocket;
  }
};
