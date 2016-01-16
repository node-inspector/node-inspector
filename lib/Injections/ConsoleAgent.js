// This function will be injected into the target process.
module.exports = function injection(require, debug, options) {
  var util = require('util');
  var format = util.format;
  var inspect = util.inspect;

  var consoleIsWrapped = false,
      nextMessageId = 1;

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
    callerFrame = error.stack[1];

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
    debug.releaseObjectGroup('console');
    debug.emitEvent('Console.messagesCleared');
  }

  function wrapConsole() {
    if (consoleIsWrapped) return;

    wrapFormatFunction();
    wrapInspectFunction();

    consoleIsWrapped = true;
  }

  function unwrapConsole() {
    if (!consoleIsWrapped) return;

    clearMessages();
    unwrapFormatFunction();
    unwrapInspectFunction();

    consoleIsWrapped = false;
  }

  function wrapFormatFunction(fn, func) {
    util.format = function WRAPPED_BY_NODE_INSPECTOR() {
      var fn = fnCalledFromConsole(util.format);
      if (fn) {
        var args = [];
        Array.prototype.push.apply(args, arguments);

        sendMessageToInspector(fn, WRAPPED_BY_NODE_INSPECTOR, args);
      }

      return format.apply(this, arguments);
    };
  }

  function unwrapFormatFunction() {
    util.format = format;
  }

  function wrapInspectFunction() {
    util.inspect = function WRAPPED_BY_NODE_INSPECTOR() {
      var fn = fnCalledFromConsole(util.inspect);
      if (fn) {
          var args = [arguments[0]];

          sendMessageToInspector(fn, WRAPPED_BY_NODE_INSPECTOR, args);
      }

      return inspect.apply(this, arguments);
    };
  }

  function unwrapInspectFunction() {
    util.inspect = inspect;
  }

  function fnCalledFromConsole(fn) {
    var _prepareStackTrace = Error.prepareStackTrace;
    var error = new Error();
    var stack = 0;

    Error.prepareStackTrace = function(error, stack) { return stack; };
    Error.captureStackTrace(error, fn);
    stack = error.stack.length;

    var result = ['dir', 'log', 'info', 'warn', 'error'].filter(consoleCallIsPrev.bind(null, stack))[0];
    Error.prepareStackTrace = _prepareStackTrace;
    return result;
  }

  function consoleCallIsPrev(originStackDepth, level) {
    var error = new Error();
    Error.captureStackTrace(error, console.Console.prototype[level]);
    var checkedStackDepth = error.stack.length || NaN;
    var stackDiff = originStackDepth - checkedStackDepth;
    return stackDiff == 1;
  }

  function sendMessageToInspector(fn, wrapper, args) {
    var message = new ConsoleMessage(fn, wrapper, args);
    debug.emitAgentEvent('Console.messageAdded', function(response, InjectedScript, DebuggerScript) {
      message.parameters = message.parameters.map(function(arg) {
        return InjectedScript.wrapObject(arg, 'console', true, true);
      });

      response.body = { message: message };
    });
  }

  debug.registerCommand('Console.clearMessages', clearMessages);

  debug.on('close', unwrapConsole);

  wrapConsole();
};
