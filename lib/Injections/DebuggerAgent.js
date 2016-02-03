// This function will be injected into the target process.
module.exports = function injection(require, debug, options) {
  var stackTraceLimit = options.stackTraceLimit;
  var CallFrame = debug.CallFrame;

  debug.registerAgentCommand('Debugger.evaluateOnCallFrame',
    ['callFrameId', 'expression', 'objectGroup',
        'includeCommandLineAPI', 'returnByValue', 'generatePreview'],
    function(args, response, InjectedScript) {
      var execState = this.exec_state_;
      var maximumLimit = execState.frameCount();
      args.unshift(debug.wrapCallFrames(execState, maximumLimit, 3), false);

      response.body = InjectedScript.evaluateOnCallFrame.apply(InjectedScript, args);
    });

  debug.registerAgentCommand('Debugger.getFunctionDetails',
    ['functionId'],
    function(args, response, InjectedScript) {
      var details = InjectedScript.getFunctionDetails.apply(InjectedScript, args);
      response.body = { details: details };
    });

  debug.registerAgentCommand('Debugger.setVariableValue',
    ['callFrameId', 'functionObjectId', 'scopeNumber', 'variableName', 'newValue'],
    function(args, response, InjectedScript) {
      var execState = this.exec_state_;
      var maximumLimit = execState.frameCount();
      args.unshift(debug.wrapCallFrames(execState, maximumLimit, 3));
      args[5] = JSON.stringify(args[5]);

      var error = InjectedScript.setVariableValue.apply(InjectedScript, args);
      if (error) {
        response.body = {
          error: {
            message: error
          }
        };
      }
    });

  debug.registerAgentCommand('Debugger.pause', _pause);
  debug.registerAgentCommand('Debugger.resume', _continue);
  debug.registerAgentCommand('Debugger.stepOver', _stepOver);
  debug.registerAgentCommand('Debugger.stepInto', _stepInto);
  debug.registerAgentCommand('Debugger.stepOut', _stepOut);
  debug.registerAgentCommand('Debugger.restartFrame', ['callFrameId'], _restartFrame);
  debug.registerAgentCommand('Debugger.getBacktrace', _getBacktrace);


  function _getBacktrace(args, response, InjectedScript) {
    if (this.running_) return;

    var currentCallStack = debug.wrapCallFrames(this.exec_state_, stackTraceLimit, 3);
    var callFrames = InjectedScript.wrapCallFrames(currentCallStack);
    // TODO
    // var asyncStackTrace = ...

    response.body = callFrames || [];
  }

  function _restartFrame(args, response, InjectedScript, DebuggerScript) {
    if (this.running_) return;

    var callFrameId = args[0];
    var currentCallStack = debug.wrapCallFrames(this.exec_state_, stackTraceLimit, 1);
    InjectedScript.restartFrame(currentCallStack, callFrameId);
    _getBacktrace.call(this, args, response, InjectedScript);
  }

  function _pause(args, response, InjectedScript) {
    if (!this.running_) return;

    debug.setPauseOnNextStatement(true);
  }

  function _continue(args, response, InjectedScript) {
    if (this.running_) return;

    debug.releaseObjectGroup('backtrace');
    debug.emitEvent('Debugger.resumed');
    response.running = true;
  }

  function _stepOver(args, response, InjectedScript, DebuggerScript) {
    if (this.running_) return;

    var frame = debug.wrapCallFrames(this.exec_state_, 1, 0);
    if (frame.isAtReturn) {
      return _stepInto.call(this, args, response, InjectedScript, DebuggerScript);
    }

    _continue.call(this, args, response, InjectedScript);
    DebuggerScript.stepOverStatement(this.exec_state_);
  }

  function _stepInto(args, response, InjectedScript, DebuggerScript) {
    if (this.running_) return;

    _continue.call(this, args, response, InjectedScript);
    DebuggerScript.stepIntoStatement(this.exec_state_);
  }

  function _stepOut(args, response, InjectedScript, DebuggerScript) {
    if (this.running_) return;

    _continue.call(this, args, response, InjectedScript);
    DebuggerScript.stepOutOfFunction(this.exec_state_);
  }

/*
  var STATE = {
    javaScriptBreakpoints: {}
  };

  var breakpointIdToDebuggerBreakpointIds = new Map();

  debug.registerAgentCommand('Debugger.setBreakpointByUrl',
    ['url', 'urlRegex', 'lineNumber', 'columnNumber', 'condition'],
    function _setBreakpointByUrl(args, response, InjectedScript, DebuggerScript) {
      var url = args[0] || args[1];
      if (!url) {
        response.failure(new Error('Either url or urlRegex must be specified.'));
        return;
      }

      var lineNumber = args[2];
      var columnNumber = args[3] || 0;
      if (columnNumber < 0) {
        response.failure(new Error('Incorrect column number.'));
        return;
      }

      var condition = args[4] || '';
      var isRegex = Boolean(args[1]);

      if (!isRegex) url = debug.convert.inspectorUrlToV8Name(url);

      var breakpointId = (isRegex ? '/' + url + '/' : url) + ':' + lineNumber + ':' + columnNumber;
      if (breakpointIdToDebuggerBreakpointIds.has(breakpointId)) {
          response.failure(new Error('Breakpoint at specified location already exists.'));
          return;
      }

      var locations = debug.scripts().filter(script => {
        var lineOffset = script.line_offset;
        var lineEnd = script.line_ends.length + lineOffset;
        return matches(script.name, url, isRegex)
          && lineOffset <= lineNumber
          && lineEnd >= lineNumber;
      }).map(script => resolveBreakpoint(
        this.exec_state_, breakpointId, DebuggerScript,
        String(script.id), lineNumber, columnNumber, false, condition));

      response.body = {
        breakpointId: breakpointId,
        locations: locations
      };
    });

  debug.registerAgentCommand('Debugger.setBreakpoint',
    ['breakpointId'],
    function _setBreakpoint(args, response, InjectedScript, DebuggerScript) {
      var breakpointId = scriptId + ':' + lineNumber + ':' + columnNumber;
      var condition = condition || '';

      if (breakpointIdToDebuggerBreakpointIds.has(breakpointId)) {
          response.failure(new Error('Breakpoint at specified location already exists.'));
          return;
      }

      var location = resolveBreakpoint(
        this.exec_state_, breakpointId, DebuggerScript,
        scriptId, lineNumber, columnNumber, false, condition);

      if (!location) {
        response.failure(new Error('Could not resolve breakpoint'));
        return;
      }

      response.body = {
        breakpointId: breakpointId,
        location: location
      };
    });

  debug.registerAgentCommand('Debugger.removeBreakpoint',
    ['breakpointId'],
    function _removeBreakpoint(args, response, InjectedScript, DebuggerScript) {
      var breakpointId = args[0];
      var breakpointsCookie = STATE.javaScriptBreakpoints;
      delete breakpointsCookie[breakpointId];

      var debuggerBreakpointIds = breakpointIdToDebuggerBreakpointIds.get(breakpointId);
      if (!debuggerBreakpointIds) return;

      debuggerBreakpointIds.forEach(debuggerBreakpointId => {
        DebuggerScript.removeBreakpoint(this.exec_state_, {
          breakpointId: debuggerBreakpointId
        });
      });

      breakpointIdToDebuggerBreakpointIds.delete(breakpointId);
    });

  function resolveBreakpoint(
      execState, breakpointId, DebuggerScript,
      scriptId, lineNumber, columnNumber, interstatementLocation, condition)
  {
    var debuggerBreakpointIds = breakpointIdToDebuggerBreakpointIds.get(breakpointId) || new Set();
    breakpointIdToDebuggerBreakpointIds.set(breakpointId, debuggerBreakpointIds);

    var info = {
      sourceID: scriptId,
      lineNumber: lineNumber,
      columnNumber: columnNumber,
      interstatementLocation: interstatementLocation,
      condition: condition
    };

    var debuggerBreakpointId = DebuggerScript.setBreakpoint(execState, info);
    if (debuggerBreakpointId == null) return;

    debuggerBreakpointIds.add(debuggerBreakpointId);

    return {
      scriptId: scriptId,
      lineNumber: info.lineNumber,
      columnNumber: info.columnNumber
    };
  }

  function matches(url, pattern, isRegex) {
    return isRegex ? new RegExp(pattern).test(url) : url == pattern;
  }
*/
};
