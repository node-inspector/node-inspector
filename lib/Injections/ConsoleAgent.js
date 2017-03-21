// This function will be injected into the target process.
module.exports = function injection(require, debug, options) {
  var consoleIsWrapped = false,
      nextMessageId = 0,
      messagesCache = {};

  var makeMirror = debug.get('MakeMirror');

  function ConsoleMessage(fn, wrapper, args) {
    var location = getCallerFuncLocation(wrapper);

    this.id = nextMessageId++;
    this.source = 'console-api';
    this.level = getLevel(fn);
    this.type = this.level == 'log' ? fn : undefined;
    this.line = location.line;
    this.column = location.column;
    this.url = location.url;
    this.repeatCount = 0;
    this.timestamp = Date.now();
    this.parameters = args;
  }

  function getLevel(fn) {
    return ['warning', 'error', 'debug', 'log'].indexOf(fn) > -1 ? fn : 'log';
  }

  function getCallerFuncLocation(wrapper) {
    var oldPrepareStackTrace = Error.prepareStackTrace,
        error = new Error(),
        callerFrame;

    Error.prepareStackTrace = function(error, stack) { return stack; };

    Error.captureStackTrace(error, wrapper);
    callerFrame = error.stack[0];

    Error.prepareStackTrace = oldPrepareStackTrace;

    var fileName = callerFrame.getFileName();

    fileName = debug.convert.v8NameToInspectorUrl(fileName);

    var url = fileName || callerFrame.getEvalOrigin();

    return {
      url: url,
      line: callerFrame.getLineNumber(),
      column: callerFrame.getColumnNumber()
    };
  }

  function clearMessages() {
    messagesCache = {};
  }

  var originalConsole = console;

  function wrapConsole() {
    if (consoleIsWrapped) return;
    var _console = {};
    for (var method in originalConsole) {
      if (['log', 'warn', 'error', 'info'].indexOf(method) > -1) {
        _console[method] = wrapFunction(method, originalConsole[method]);
      } else if (method === 'assert') {
        _console.assert = wrapAssertFunction('assert', originalConsole.assert);
      } else {
        _console[method] = originalConsole[method];
      }
    }

    consoleIsWrapped = true;

    Object.defineProperty(global, 'console', {
      configurable: true,
      enumerable: true,
      get: function() {
        return _console;
      }
    });
  }

  function unwrapConsole() {
    if (!consoleIsWrapped) return;

    clearMessages();
    Object.defineProperty(global, 'console', {
      configurable: true,
      enumerable: true,
      get: function() {
        return originalConsole;
      }
    });
    consoleIsWrapped = false;
  }

  function wrapFunction(fn, func) {
    return function WRAPPED_BY_NODE_INSPECTOR() {
      var args = [];
      Array.prototype.push.apply(args, arguments);
      sendMessageToInspector(fn, WRAPPED_BY_NODE_INSPECTOR, args);
      return func.apply(originalConsole, args);
    };
  }

  function wrapAssertFunction(fn, func) {
    return function wrapper(condition) {
      var args = [];
      Array.prototype.push.apply(args, arguments);

      if (!condition)
        sendMessageToInspector(fn, wrapper, args);

      return func.apply(originalConsole, args);
    };
  }

  function sendMessageToInspector(fn, wrapper, args) {
    var message = new ConsoleMessage(fn, wrapper, args);

    var cache = messagesCache[message.id] = {};
    message.parameters = message.parameters.map(function(arg) {
      return debug.serializeAndCacheMirror(cache, makeMirror(arg));
    });
    debug.command('Console.messageAdded', { message: message });
  }

  debug.register('Console.messageAdded', debug.commandToEvent);
  debug.register('Console.messagesCleared', debug.commandToEvent);
  debug.register('Console.messageRepeatCountUpdated', debug.commandToEvent);

  debug.register('Console.clearMessages', function(request, response) {
    clearMessages();
    debug.command('Console.messagesCleared');
  });

  debug.register('Console._lookupConsoleId', function(request, response) {
    var messageId = request.arguments.messageId;
    var objectId = request.arguments.objectId;

    var cache = messagesCache[messageId];
    if (!cache)
      return response.failed('Console message #' + messageId + '# not found');

    var mirror = cache[objectId];
    if (!mirror)
      return response.failed('Object #' + objectId + '# not found');

    //serialize body and append serialized refs to response
    response.body = debug.serializeAndCacheMirror(cache, mirror, response);
  });

  debug.on('close', unwrapConsole);

  wrapConsole();
};
