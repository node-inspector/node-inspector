WebInspector.InspectorController = (function() {
  var seq = 0;
  var callbacks = {};
  var breakpoints = {};
  var makeRequest = function(command, params) {
    var msg = {
      seq: seq++,
      type: 'request',
      command: command
    }
    if (params) {
      Object.keys(params).forEach(function(key) {
        msg[key] = params[key];
      });
    }
    return msg;
  };
  var sendRequest = function(command, params, callId) {
    var msg = makeRequest(command, params);
    if (typeof callId !== 'undefined') {
      callbacks[msg.seq] = callId;
    }
    socket.send(JSON.stringify(msg));
  }
  var socket = null;
  
  var controller = {
    initialize: function() {
      if (['http:', 'https:'].indexOf(window.location.protocol) > -1) {
        var addr = window.location.host;
      }
      else {
        var addr = '127.0.0.1:8080'; //FIXME
      }
      socket = new WebSocket('ws://' + addr);
      socket.onmessage = function(event) {
        parseMessage(event.data);
      };
      socket.onclose = function() {
        breakpoints = {};
        callbacks = {};
        WebInspector.debuggerWasDisabled();
        WebInspector.panels.scripts.reset();
        console.log('socket closed');
      };
      socket.onopen = function() {
        console.log('socket open');
        WebInspector.debuggerWasEnabled();
        sendRequest('scripts', {
          arguments: { includeSource: true, types: 4 }});
      };
    },
    close: function() {
      socket.close();
      socket = null;
    },
    setBreakpoint: function(callId, sourceID, line, enabled, condition) {
      var bp = breakpoints[sourceID + ':' + line];
      if(bp) {
        sendRequest('changebreakpoint', {
          arguments: {
            breakpoint: bp,
            enabled: enabled,
            condition: condition}});
      }
      else {
        sendRequest('setbreakpoint',{
          arguments: {
            type: 'scriptId',
            target: sourceID,
            line: line - 1,
            enabled: enabled,
            condition: condition
          }}, sourceID + ':' + line);
      }
    },
    clearBreakpoint: function(sourceID, line) {
      var id = sourceID + ':' + line;
      sendRequest('clearbreakpoint', {
        arguments: { breakpoint: breakpoints[id] }}, id);
    },
    listBreakpoints: function() {
      sendRequest('listbreakpoints');
    },
    getBacktrace: function() {
      sendRequest('backtrace',{arguments: { inlineRefs: true }});
    },
    pause: function() {
      sendRequest('suspend');
    },
    resume: function(step) {
      if(step) {
        var params = {arguments: { stepaction: step }};
      }
      sendRequest('continue', params);
    },
    getScope: function(frameId, scopeId, callId) {
      sendRequest('scope', {
        arguments: { 
          number: scopeId,
          frameNumber: frameId,
          inlineRefs:true }},
        callId);
    },
    lookup: function(ref, callId) {
      sendRequest('lookup', {
        arguments: { handles: [ref], inlineRefs:true }},
        callId);
    },
    evaluate: function(expr, callId, frameId) {
      var args = { expression: expr, disable_break: true };
      if (frameId != null) {
        args.frame = frameId;
        args.global = false;
      }
      else {
        args.global = true;
      }
      sendRequest('evaluate', {arguments: args}, callId);
    },
    _valueOf: function(value) {
      var p = {};
      switch (value.type) {
        case 'object':
          p.value = {
            description: value.className,
            hasChildren: true,
            injectedScriptId: value.ref || value.handle,
            type: 'object'
            };
          break;
        case 'function':
          p.value = {
            description: value.text || 'function()',
            hasChildren: true,
            injectedScriptId: value.ref || value.handle,
            type: 'function'
            };
          break;
        case 'undefined':
          p.value = {description: 'undefined'};
          break;
        case 'null':
          p.value = {description: 'null'};
          break;
        default:
          p.value = {description: value.value};
          break;
      }
      return p;
    },
    _property: function(prop) {
      var p = controller._valueOf(prop.value);
      p.name = String(prop.name);
      return p;
    },
    refToProperties: function(ref) {
      if (ref) {
        return ref.properties.map(controller._property);
      }
    }
  };
  
  var parseResponse = function(msg) {
    var callId = callbacks[msg.request_seq];
    delete callbacks[msg.request_seq];
    switch (msg.command) {
      case 'scripts':
        msg.body.forEach(function(s) {
          WebInspector.parsedScriptSource(s.id, s.name, s.source, s.lineOffset, 0);
        });
        sendRequest('listbreakpoints');
        break;
      case 'scope':
        WebInspector.Callback.processCallback(callId, controller.refToProperties(msg.body.object));
        break;
      case 'suspend':
        if (msg.success && !msg.running) {
          controller.getBacktrace();
        }
        break;
      case 'lookup':
        console.log(JSON.stringify(msg));
        var ref = msg.body[Object.keys(msg.body)[0]];
        WebInspector.Callback.processCallback(callId, controller.refToProperties(ref));
        break;
      case 'evaluate':
        console.log(JSON.stringify(msg));
        if (msg.success) {
          WebInspector.Callback.processCallback(callId, controller._valueOf(msg.body));
        }
        else {
          WebInspector.Callback.processCallback(callId, {value: msg.message, isException: true});
        }
        break;
      case 'setbreakpoint':
        breakpoints[callId] = msg.body.breakpoint;
        break;
      case 'clearbreakpoint':
        delete breakpoints[callId];
        break;
      case 'listbreakpoints':
        breakpoints = {};
        WebInspector.breakpointManager.reset();
        msg.body.breakpoints.forEach(function(bp) {
          if(bp.type === 'scriptId') {
            var l = bp.line + 1;
            var url = WebInspector.panels.scripts._sourceIDMap[bp.script_id].sourceURL;
            breakpoints[bp.script_id + ':' + l] = bp.number;
            WebInspector.breakpointManager.setBreakpoint(bp.script_id, url, l, !!bp.active, bp.condition)
          }
        });
        break;
      case 'backtrace':
        var callFrames = msg.body.frames.map(function(frame) {
          var f = {
            type: 'function',
            functionName: frame.func.inferredName,
            sourceID: frame.func.scriptId,
            line: frame.line + 1,
            id: frame.index
          };
          f.scopeChain = frame.scopes.map(function(scope) {
            var c = {};
            switch (scope.type) {
              case 0:
                break;
              case 1:
                c.isLocal = true;
                c.thisObject = {description: frame.receiver.className, hasChildren: true, injectedScriptId: frame.receiver.ref};
                c.locals = frame.locals;
                c.arguments = frame.arguments;
                break;
              case 2:
                c.isWithBlock = true;
                break;
              case 3:
                c.isClosure = true;
                break;
              case 4:
                c.isElement = true;
                break;
              default:
                break;
            }
            c.injectedScriptId = {frameId: frame.index, scopeId: scope.index, isLocal: !!c.isLocal};
            return c;
          });
          return f;
        });
        WebInspector.pausedScript(callFrames);
        break;
      default:
        console.log(JSON.stringify(msg));
        break;
    }
  };
  var parseEvent = function(msg) {
    switch (msg.event) {
      case 'break':
        controller.getBacktrace();
        break;
      case 'exception':
        console.error(JSON.stringify(msg.body));
        break;
      case 'stdout':
        console.log(JSON.stringify(msg.body));
        WebInspector.addConsoleMessage({
          source: WebInspector.ConsoleMessage.MessageSource.JS,
          type: WebInspector.ConsoleMessage.MessageType.Log,
          level: WebInspector.ConsoleMessage.MessageLevel.Log,
          repeatCount: 1,
          message: 'stdout: ' + msg.body});
        break;
      case 'stderr':
        WebInspector.addConsoleMessage({
          source: WebInspector.ConsoleMessage.MessageSource.JS,
          type: WebInspector.ConsoleMessage.MessageType.Log,
          level: WebInspector.ConsoleMessage.MessageLevel.Error,
          repeatCount: 1,
          message: 'stderr: ' + msg.body});
        break;
      default:
        console.log(JSON.stringify(msg.body));
        break;
    }
  };
  var parseMessage = function(data) {
    var msg = JSON.parse(data);
    if (msg.type === 'response') {
      parseResponse(msg);
    }
    else {
      parseEvent(msg);
    }
  };

  return controller;
}());
