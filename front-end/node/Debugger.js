WebInspector.nodeDebugger = (function() {
  var socket = null,
      callbacks = {},
      breakpoints = {},
      listeners = {},
      debugr;
  
  function takeCallId(request_seq) {
    var callId = callbacks[request_seq];
    delete callbacks[request_seq];
    return callId;
  }

  function dispatch(data) {
    var msg = JSON.parse(data),
        cmd = msg.command || msg.event;
    msg.callId = takeCallId(msg.request_seq);
    if (listeners[cmd]) {
      listeners[cmd].forEach(function(callback) {
        callback.call(this, msg);
      });
    }
  }

  function makeRequest(command, params) {
    var msg = {
      seq: Math.floor((Math.random() * 999999999999)),
      type: 'request',
      command: command
    };
    if (params) {
      Object.keys(params).forEach(function(key) {
        msg[key] = params[key];
      });
    }
    return msg;
  }

  function sendRequest(command, params, callId) {
    var msg = makeRequest(command, params);
    if (typeof callId !== 'undefined') {
      callbacks[msg.seq] = callId;
    }
    socket.send(JSON.stringify(msg));
  }

  debugr = {
    port: 5858,
    connect: function() {
      var addr;
      if (['http:', 'https:'].indexOf(window.location.protocol) > -1) {
        addr = window.location.host;
      }
      else {
        addr = '127.0.0.1:8080'; //FIXME
      }
      socket = new WebSocket('ws://' + addr + '/testme');
      socket.onmessage = function(event) {
        dispatch(event.data);
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
        debugr.attach(debugr.port);
      };
    },
    close: function() {
      socket.close();
      socket = null;
    },
    on: function(event, callback) {
      var list = listeners[event] || [];
      list.push(callback);
      listeners[event] = list;
    },
    attach: function(port, options) {
      var args = { arguments: { debugPort: port }};
      sendRequest('attach', args);
    },
    getScripts: function(ids) {
      var args = { arguments: { includeSource: true, types: 4 }};
      if(ids) { args.arguments.ids = ids; }
      sendRequest('scripts', args);
    },
    setBreakpoint: function(callId, sourceID, line, enabled, condition) {
      var bp = breakpoints[sourceID + ':' + line];
      if(bp) {
        sendRequest('changebreakpoint', {
          arguments: {
            breakpoint: bp,
            enabled: enabled,
            condition: condition,
            id: sourceID + ':' + line}}, callId);
      }
      else {
        sendRequest('setbreakpoint',{
          arguments: {
            type: 'scriptId',
            target: sourceID,
            line: line - 1,
            enabled: enabled,
            condition: condition
          }}, callId);
      }
    },
    clearBreakpoint: function(sourceID, line) {
      var id = sourceID + ':' + line;
      sendRequest('clearbreakpoint', {
        arguments: { breakpoint: breakpoints[id],
                     id: id }}, id);
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
      var params;
      if(step) {
        params = {arguments: { stepaction: step }};
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
    takeHeapSnapshot: function() {
      sendRequest('profile', {arguments: {command: 'resume', modules: 65542, tag: 0}});
    },
    startProfiling: function() {
      sendRequest('profile', {arguments: {command: 'resume', modules: 1, tag: 0}});
    },
    stopProfiling: function() {
      sendRequest('profile', {arguments: {command: 'pause', modules: 1, tag: 0}});
    },
    liveEdit: function(callId, sourceID, newContext) {
      var args = {
        script_id: sourceID,
        preview_only: false,
        new_source: newContext
      };
      sendRequest('changelive', {arguments: args}, {id: callId, body: newContext});
    }
  };
  
  debugr.on('attach', function(msg) {
    if (msg.success) {
      WebInspector.debuggerWasEnabled();
      debugr.getScripts();
      debugr.listBreakpoints();
    }
    else {
      var err = msg.message;
      if (err.match(/ECONNREFUSED/)) {
        err = 'Node not listening on port ' + debugr.port + '.\nIs it running with --debug?';
      }
      WebInspector.panels.scripts.panelEnablerView.error.textContent = err;
      debugr.close();
    }
  });

  debugr.on('setbreakpoint', function(msg) {
    if (msg.arguments) {
      var a = msg.arguments;
      breakpoints[a.target + ':' + (a.line + 1)] = msg.body.breakpoint;
    }
  });
  
  debugr.on('clearbreakpoint', function(msg) {
    if (msg.arguments) {
      var a = msg.arguments;
      delete breakpoints[a.id];
    }
  });
  
  debugr.on('listbreakpoints', function(msg) {
    breakpoints = {};
    msg.body.breakpoints.forEach(function(bp) {
      if(bp.type === 'scriptId') {
        var l = bp.line + 1,
            url = WebInspector.panels.scripts._sourceIDMap[bp.script_id].sourceURL;
        breakpoints[bp.script_id + ':' + l] = bp.number;
      }
    });
  });
  return debugr;
}());

