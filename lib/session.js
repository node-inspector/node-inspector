var http = require('http'),
    events = require('events'),
    path = require('path'),
    Callback = require('./callback'),
    debugr = require('./debugger');

///////////////////////////////////////////////////////////
// exports

exports.createSession = function (conn) {
  var d = debugr.attachDebugger(5858),
      callback = Callback.create(),
      breakpoints = {},
      sourceIDs = {};
  
  d.on('data', function (obj) {
    if (obj.type === 'response' && obj.request_seq > 0) {
      callback.processResponse(obj.request_seq, [obj]);
    }
    else if (obj.type === 'event') {
      if (obj.event === 'break') {
        breakEvent(obj);
      }
      else {
        console.log(JSON.stringify(obj));
      }
    }
  });
  d.on('error', function (e) {
    conn.write(JSON.stringify({type:'response',command:'attach',success:false, message: e.message}));
  });
  
  function wrapperObject(type, description, hasChildren, frame, scope, ref) {
    return {
      type:type,
      description:description,
      hasChildren:hasChildren,
      objectId:frame + ':' + scope + ':' + ref
    };
  }
  
  function refToObject(ref) {
    var desc = '';
    switch (ref.type) {
      case 'object':
        desc = ref.className;
      break;
      case 'function':
        desc = ref.text || 'function()';
      break;
      case 'undefined':
        desc = 'undefined';
        break;
      case 'null':
        desc = 'null';
        break;
      case 'script':
        desc = ref.text;
        break;
      default:
        desc = ref.value;
        break;
    }
    var kids = ref.properties ? ref.properties.length : false;
    return wrapperObject(ref.type, desc, kids, 0, 0, ref.handle);
  }
  
  function breakEvent(obj) {
    var data = {};
    if(!sourceIDs[obj.body.script.id]) {
      var args = { arguments: { includeSource: true, types: 4, ids: [obj.script.id] }};
      debugRequest('scripts', args, parsedScripts);
    }
    debugRequest(
      'backtrace', 
      {arguments: { inlineRefs: true }},
      function(bt) {
        var callFrames = bt.body.frames.map(function(frame) {
          var f = {
            type: 'function',
            functionName: frame.func.inferredName,
            sourceID: frame.func.scriptId,
            line: frame.line + 1,
            id: frame.index,
            worldId: 1
          };
          f.scopeChain = frame.scopes.map(function(scope) {
            var c = {};
            switch (scope.type) {
              case 0:
                break;
              case 1:
                c.isLocal = true;
                c.thisObject = wrapperObject('object', frame.receiver.className, true, frame.index, scope.index, frame.receiver.ref);
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
            c.objectId = f.id + ':' + scope.index + ':backtrace';
            return c;
          });
          return f;
        });
        var data = { details: { callFrames: callFrames }};
        sendEvent('pausedScript', data);
    });
  }
  
  function parsedScripts(msg) {
    msg.body.forEach(function(s) {
      sourceIDs[s.id] = true;
      var data = { 
        sourceID: s.id.toString(),
        url: s.name,
        data: s.source,
        firstLine: s.lineOffset,
        scriptWorldType: 0
      };
      sendEvent('parsedScriptSource', data);
    });
  }
  
  function debugRequest(command, params, cb) {
    var seq = 0;
    if (typeof cb == 'function') {
      seq = callback.wrap(cb);
    }
    var msg = {
      seq: seq,
      type: 'request',
      command: command
    };
    if (params) {
      Object.keys(params).forEach(function(key) {
        msg[key] = params[key];
      });
    }
    d.request(JSON.stringify(msg));
  }
  
  function sendEvent(name, data) {
    data = data || {};
    conn.write(JSON.stringify({
      type: 'event',
      event: name,
      data: data
    }));
  }
  
  function sendResponse(seq, success, data) {
    conn.write(JSON.stringify({
      seq:seq,
      success:success,
      data:data
    }));
  }

  return Object.create(events.EventEmitter.prototype, {
    close: {
      value: function ()
      {
        if (debug && debug.connected) {
          debug.close();
        }
        conn.close();
        this.emit('close');
      }
    },
    //Backend
    enableDebugger: {
      value: function(always) {

      }
    },
    setInjectedScriptSource: {
      value: function(args) {
      
      }
    },
    dispatchOnInjectedScript: {
      value: function(injectedScriptId, methodName, argString, seq) {
        if (methodName === 'getProperties') {
          var args = JSON.parse(argString);
          var objectId = args[0];
          var tokens = objectId.split(":");
          
          var frame = parseInt(tokens[0], 10);
          var scope = parseInt(tokens[1], 10);
          var ref = tokens[2];
          
          if (ref === 'backtrace') {
            debugRequest('scope', { arguments: { number:scope, frameNumber:frame, inlineRefs:true }},
              function(msg) {
                var refs = {};
                msg.refs.forEach(function(r) {
                  refs[r.handle] = r;
                });
                var props = msg.body.object.properties.map(function(p) {
                  var r = refs[p.value.ref];
                  return {
                    name: p.name,
                    value: refToObject(r)
                  };
                });                
                var data = { result:props };
                sendResponse(seq, true, data);                
              });
          }
          else {
            var handle = parseInt(ref, 10);
            debugRequest('lookup', { arguments: { handles:[handle], includeSource: false }},
              function(msg) {
                //TODO break out commonality with above
                var refs = {};
                msg.refs.forEach(function(r) {
                  refs[r.handle] = r;
                });
                var props = msg.body[handle].properties.map(function(p) {
                  var r = refs[p.ref];
                  return {
                    name: p.name,
                    value: refToObject(r)
                  };
                });                
                var data = { result:props };
                sendResponse(seq, true, data);  
              });
          }
          
        }
      }
    },
    releaseWrapperObjectGroup: {
      value: function(injectedScriptId, objectGroup) {
        
      }
    },
    //Controller
    populateScriptObjects: {
      value: function() {
        sendEvent('showPanel', { name: 'scripts' });
        sendEvent('debuggerWasEnabled');
        var args = { arguments: { includeSource: true, types: 4 }};
        debugRequest('scripts', args, parsedScripts);
      }
    },
    getSettings: {
      value: function(seq) {
        conn.write(JSON.stringify({
           seq:seq,
           success:true,
           data:{
              settings:{
                 application:"{\"scripts-sidebar-width\":230,\"event-listeners-filter\":\"all\",\"color-format\":\"hex\",\"resources-large-rows\":true,\"watch-expressions\":[],\"last-viewed-script-file\":\"\",\"show-inherited-computed-style-properties\":false,\"show-user-agent-styles\":true,\"resource-view-tab\":\"content\",\"console-history\":[],\"resources-sort-options\":{\"timeOption\":\"responseTime\",\"sizeOption\":\"transferSize\"}}",
                 session:"{}"
              }
           }
        }));
      }
    },
    getInspectorState: {
      value: function(seq) {
        conn.write(JSON.stringify({
           seq:seq,
           success:true,
           data:{
              state:{
                 monitoringXHREnabled:false,
                 resourceTrackingEnabled:false
              }
           }
        }));
      }
    },
    storeLastActivePanel: {
      value: function(panelName) {
      
      }
    },
    saveApplicationSettings: {
      value: function(settings) {
      
      }
    },
    saveSessionSettings: {
      value: function(settings) {
      
      }
    },
    setSearchingForNode: {
      value: function(enabled) {
      
      }
    },
    setMonitoringXHREnabled: {
      value: function(enabled) {
      
      }
    },
    setResourceTrackingEnabled: {
      value: function(enabled, always) {
      
      }
    },
    getResourceContent: {
      value: function(identifier, encode) {
      
      }
    },
    reloadPage: {
      value: function() {
      
      }
    },
    startTimelineProfiler: {
      value: function() {
      
      }
    },
    stopTimelineProfiler: {
      value: function() {
      
      }
    },
    setNativeBreakpoint: {
      value: function(breakpoint) {
      
      }
    },
    removeNativeBreakpoint: {
      value: function(breakpointId) {
      
      }
    },
    enableProfiler: {
      value: function(always) {
      
      }
    },
    disableProfiler: {
      value: function(always) {
      
      }
    },
    addScriptToEvaluateOnLoad: {
      value: function(scriptSource) {
      
      }
    },
    removeAllScriptsToEvaluateOnLoad: {
      value: function() {

      }
    },
    clearConsoleMessages: {
      value: function() {
      
      }
    },
    highlightDOMNode: {
      value: function(nodeId) {
      
      }
    },
    openInInspectedWindow: {
      value: function(url) {
      
      }
    },
    getCookies: {
      value: function() {
      
      }
    },
    deleteCookie: {
      value: function() {
      
      }
    },
    didEvaluateForTestInFrontend: {
      value: function() {
      
      }
    },
    //Debug
    setBreakpoint: {
      value: function(sourceID, lineNumber, enabled, condition, seq) {
        var bp = breakpoints[sourceID + ':' + lineNumber];
        var handleResponse = function(msg) {
          if (msg.arguments) {
            var a = msg.arguments;
            breakpoints[a.target + ':' + (a.line + 1)] = msg.body.breakpoint;
            var data = { success: true, actualLineNumber: a.line + 1 };
            sendResponse(seq, true, data);
          }
        };
        
        if(bp) {
          debugRequest('changebreakpoint', {
            arguments: {
              breakpoint: bp,
              enabled: enabled,
              condition: condition,
              id: sourceID + ':' + lineNumber}}, handleResponse);
        }
        else {
          debugRequest('setbreakpoint',{
            arguments: {
              type: 'scriptId',
              target: sourceID,
              line: lineNumber - 1,
              enabled: enabled,
              condition: condition
            }}, handleResponse);
        }
      }
    },
    removeBreakpoint: {
      value: function(sourceID, lineNumber) {
        var id = sourceID + ':' + lineNumber;
        debugRequest('clearbreakpoint', { arguments: { breakpoint: breakpoints[id] }},
          function(msg) {
            if (msg.success) {
              delete breakpoints[id];
            }
          });
      }
    },
    activateBreakpoints: {
      value: function() {
        
      }
    },
    deactivateBreakpoints: {
      value: function(injectedScriptId, objectGroup) {
        
      }
    },
    pause: {
      value: function() {
        debugRequest('suspend');
      }
    },
    resume: {
      value: function() {
        debugRequest('continue');
        sendEvent('resumedScript');
      }
    },
    stepOverStatement: {
      value: function() {
        debugRequest('continue', { arguments: {stepaction:'next'}});
        sendEvent('resumedScript');
      }
    },
    stepIntoStatement: {
      value: function() {
        debugRequest('continue', { arguments: {stepaction:'in'}});
        sendEvent('resumedScript');
      }
    },
    stepOutOfFunction: {
      value: function() {
        debugRequest('continue', { arguments: {stepaction:'out'}});
        sendEvent('resumedScript');
      }
    },
    setPauseOnExceptionsState: {
      value: function(state) {
        
      }
    },
    editScriptSource: {
      value: function(sourceID, newContent) {
        
      }
    },
    getScriptSource: {
      value: function(sourceID) {
        
      }
    },
    //Profiler
    startProfiling: {
      value: function() {
        
      }
    },
    stopProfiling: {
      value: function() {
        
      }
    },
    getProfileHeaders: {
      value: function() {
        
      }
    },
    getProfile: {
      value: function(type, uid) {
        
      }
    },
    removeProfile: {
      value: function(type, uid) {
        
      }
    },
    clearProfiles: {
      value: function() {
        
      }
    },
    takeHeapSnapshot: {
      value: function() {
        
      }
    },
    
    handleRequest: {
      value: function (data) {
        console.log('\n\033[90m');
        console.log(data);
        console.log('\033[39m');
        var msg = JSON.parse(data);
        var command = this[msg.command];
        if (typeof command == 'function') {
          var args = Object.keys(msg.arguments).map(function(x) {
            return msg.arguments[x];
          });
          if (msg.seq > 0) {
            args.push(msg.seq);
          }
          command.apply(this, args);
        }
      }
    }
  });
};
