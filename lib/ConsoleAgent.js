var convert = require('./convert');

/**
 * @param {Object} config
 * @param {DebuggerClient} debuggerClient
 * @param {FrontendClient} frontendClient
 * @param {InjectorClient} injectorClient
 * @param {ConsoleClient} consoleClient
 * @constructor
 */
function ConsoleAgent(config, debuggerClient, frontendClient, injectorClient, consoleClient) {
  this._noInject = config.inject === false;
  this._injected = false;
  this._consoleEnabled = false;
  this._debuggerClient = debuggerClient;
  this._frontendClient = frontendClient;
  this._injectorClient = injectorClient;
  this._consoleClient = consoleClient;
  this._translateCommandToInjection(
    'clearMessages'
  );

  if (!this._noInject) this._injectorClient.on('inject', this._inject.bind(this));
}

ConsoleAgent.prototype._inject = function(injected) {
  if (!injected) return;

  this._translateEventToFrontend(
    'messageAdded',
    'messagesCleared',
    'messageRepeatCountUpdated'
  );

  this._injectorClient.injection(
    this.injection,
    {},
    function(error, result) {
      this._injected = !error;

      if (error) return this._frontendClient.sendLogToConsole('error', error.message || error);

      if (this._consoleEnabled) this._debuggerClient.request('Console.enable');
    }.bind(this)
  );
};

/**
 * @param {...string} eventNames
*/
ConsoleAgent.prototype._translateEventToFrontend = function(eventNames) {
  Array.prototype.forEach.call(arguments, function(event) {
    event = 'Console.' + event;
    this._debuggerClient.registerDebuggerEventHandlers(event);
    this._debuggerClient.on(event, function(message) {
      if (event == 'Console.messageAdded') {
        message.message.parameters = message.message.parameters.map(function(ref) {
          this._consoleClient.convertHandleToConsoleHandle(ref, message.message.id);
          return convert.v8ResultToInspectorResult(ref);
        }, this);
      }
      this._frontendClient.sendEvent(event, message);
    }.bind(this));
  }, this);
};

/**
 * @param {...string} commandNames
*/
ConsoleAgent.prototype._translateCommandToInjection = function(commandNames) {
  Array.prototype.forEach.call(arguments, function(command) {
    this[command] = function(params, done) {
      this._debuggerClient.request('Console.' + command, params, done);
    };
  }, this);
};

ConsoleAgent.prototype.enable = function(params, done) {
  this._consoleEnabled = true;
  done();
};

ConsoleAgent.prototype.injection = function(require, debug, options) {
  var consoleIsWrapped = false,
      nextMessageId = 0,
      messagesCache = {},
      lastMessage;

  var makeMirror = debug.get('MakeMirror');

  function ConsoleMessage(fn, args) {
    var location = getCallerFuncLocation();

    if (equalToLastMessage(location, args)) {
      lastMessage.repeatCount++;
      return lastMessage;
    }

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

    lastMessage = this;
  }

  function equalToLastMessage(location, args) {
    if (!lastMessage) return false;

    var lastMessageLocation = resolveLocation(lastMessage),
        currentMessageLocation = resolveLocation(location);

    return lastMessageLocation == currentMessageLocation &&
      args.every(equalToLastMessageArg);
  }

  function resolveLocation(location) {
    return  location.url + ':' + location.line + ':' + location.column;
  }

  function equalToLastMessageArg(value, index) {
    return value == null ||
      (typeof value === 'string' || typeof value === 'number') &&
      value === lastMessage.parameters[index].value;
  }

  function getLevel(fn) {
    return ['warning', 'error', 'debug', 'log'].indexOf(fn) > -1 ? fn : 'log';
  }

  function getCallerFuncLocation() {
    var oldPrepareStackTrace = Error.prepareStackTrace,
        callerFrame;

    Error.prepareStackTrace = function(error, stack) { return stack; };

    //Magic 3 is:                                                        3
    //[getCallerFuncLocation]->[ConsoleMessage]->[Wrapped function]->[Caller]
    callerFrame = new Error().stack[3];

    Error.prepareStackTrace = oldPrepareStackTrace;

    return {
      url: callerFrame.getFileName() || callerFrame.getEvalOrigin(),
      line: callerFrame.getLineNumber(),
      column: callerFrame.getColumnNumber()
    };
  }

  function clearMessages() {
    messagesCache = {};
    lastMessage = null;
  }

  function wrapConsole() {
    if (consoleIsWrapped) return;

    Object.keys(console).forEach(function(fn) {
      if (!/^_/.test(fn)) {
        console['_'+fn] = console[fn];
        console[fn] = wrapFunction(fn, console[fn]);
      }
    });
    consoleIsWrapped = true;
  }

  function unwrapConsole() {
    if (!consoleIsWrapped) return;

    clearMessages();
    Object.keys(console).forEach(function(fn) {
      if (!/^_/.test(fn)) {
        console[fn] = console['_' + fn];
        delete console['_' + fn];
      }
    });
    consoleIsWrapped = false;
  }

  function wrapFunction(fn, func) {
    return function() {
      var args = Array.prototype.slice.call(arguments);
      var message = new ConsoleMessage(fn, args);
      if (message.repeatCount) {
        debug.command('Console.messageRepeatCountUpdated', {
          count: message.repeatCount,
          timestamp: Date.now()
        });
        return func.apply(console, args);
      }

      var cache = messagesCache[message.id] = {};
      message.parameters = message.parameters.map(function(arg) {
        return debug.serializeAndCacheMirror(cache, makeMirror(arg));
      });

      debug.command('Console.messageAdded', { message: message });

      return func.apply(console, args);
    };
  }

  debug.register('Console.messageAdded', debug.commandToEvent);
  debug.register('Console.messagesCleared', debug.commandToEvent);
  debug.register('Console.messageRepeatCountUpdated', debug.commandToEvent);

  debug.register('Console.enable', wrapConsole);
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
};

module.exports.ConsoleAgent = ConsoleAgent;
