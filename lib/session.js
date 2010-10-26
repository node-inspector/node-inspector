var http = require('http'),
    events = require('events'),
    path = require('path'),
    debugr = require('./debugger');

///////////////////////////////////////////////////////////
// exports

exports.createSession = function (conn) {
  var debug = null,
      //map from sourceID:lineNumber to breakpointID
      breakpoints = {},
      //map from sourceID to filename
      sourceIDs = {};
  
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
      default:
        desc = ref.text;
      break;
    }
    var kids = ref.properties ? ref.properties.length : false;
    return wrapperObject(ref.type, desc, kids, 0, 0, ref.handle);
  }
  
  function breakEvent(obj) {
    var data = {};
    if(!sourceIDs[obj.body.script.id]) {
      var args = { arguments: { includeSource: true, types: 4, ids: [obj.script.id] }};
      debug.request('scripts', args, parsedScripts);
    }
    debug.request(
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
      sourceIDs[s.id] = s.name;
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
  
  function sendEvent(name, data) {
    data = data || {};
    conn.write(JSON.stringify({
      type: 'event',
      event: name,
      data: data
    }));
  }
  
  function sendResponse(seq, success, data) {
    data = data || {};
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
        this.emit('close');
      }
    },
    //Backend
    enableDebugger: {
      value: function(always) {
        debug = debugr.attachDebugger(5858);
        debug.on('break', breakEvent);
        debug.on('close', function () {
          //TODO determine proper close behavior
          debug = null;
          sendEvent('debuggerWasDisabled');
        });
        debug.on('connect', function () {
          sendEvent('showPanel', { name: 'scripts' });
          sendEvent('debuggerWasEnabled');
          var args = { arguments: { includeSource: true, types: 4 }};
          debug.request('scripts', args, function(msg) {
            parsedScripts(msg);
            debug.request('listbreakpoints', {},
              function(msg) {
                msg.body.breakpoints.forEach(function(bp) {
                  if (bp.type === 'scriptId') {
                    var data = {
                      sourceID: bp.script_id,
                      url: sourceIDs[bp.script_id],
                      line: bp.line + 1,
                      enabled: bp.active,
                      condition: bp.condition
                    };
                    sendEvent('restoredBreakpoint', data);
                  }
                });
              });
          });
        });
        debug.on('error', function (e) {
          var data = {
            messageObj:{
              source: 3,
              type: 0,
              level: 3,
              line: 0,
              url: '',
              groupLevel: 7,
              repeatCount: 1,
              message: e.toString()
            }
          };
          sendEvent('addConsoleMessage', data);
        });
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
            debug.request('scope', { arguments: { number:scope, frameNumber:frame, inlineRefs:true }},
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
                sendResponse(seq, true, { result:props });
              });
          }
          else {
            var handle = parseInt(ref, 10);
            debug.request('lookup', { arguments: { handles:[handle], includeSource: false }},
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
                sendResponse(seq, true, { result:props });
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
    disableDebugger: {
      value: function(always) {
        if (debug && debug.connected) {
          debug.close();
        }
      }
    },
    populateScriptObjects: {
      value: function() {
        this.enableDebugger();
      }
    },
    getSettings: {
      value: function(seq) {
        sendResponse(seq, true, {
              settings:{
                 application:"{\"scripts-sidebar-width\":230,\"event-listeners-filter\":\"all\",\"color-format\":\"hex\",\"resources-large-rows\":true,\"watch-expressions\":[],\"last-viewed-script-file\":\"\",\"show-inherited-computed-style-properties\":false,\"show-user-agent-styles\":true,\"resource-view-tab\":\"content\",\"console-history\":[],\"resources-sort-options\":{\"timeOption\":\"responseTime\",\"sizeOption\":\"transferSize\"}}",
                 session:"{}"
              }});
      }
    },
    getInspectorState: {
      value: function(seq) {
        sendResponse(seq, true, {
              state:{
                 monitoringXHREnabled:false,
                 resourceTrackingEnabled:false
              }});
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
          if (msg.success) {
            var b = msg.body;
            breakpoints[b.script_id + ':' + (b.line + 1)] = b.breakpoint;
            var data = { success: true, actualLineNumber: b.line + 1 };
            sendResponse(seq, true, data);
          }
        };
        
        if(bp) {
          debug.request(
            'changebreakpoint',
            { arguments: {
                breakpoint: bp,
                enabled: enabled,
                condition: condition
            }},
            function(msg) {
              var data = { success: true, actualLineNumber: lineNumber };
              sendResponse(seq, true, data);
            });
        }
        else {
          debug.request(
            'setbreakpoint',
            { arguments: {
                type: 'scriptId',
                target: sourceID,
                line: lineNumber - 1,
                enabled: enabled,
                condition: condition
            }},
            handleResponse);
        }
      }
    },
    removeBreakpoint: {
      value: function(sourceID, lineNumber) {
        var id = sourceID + ':' + lineNumber;
        debug.request(
          'clearbreakpoint',
          { arguments: { breakpoint: breakpoints[id] }},
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
        debug.request('suspend');
      }
    },
    resume: {
      value: function() {
        debug.request('continue');
        sendEvent('resumedScript');
      }
    },
    stepOverStatement: {
      value: function() {
        debug.request('continue', { arguments: {stepaction:'next'}});
        sendEvent('resumedScript');
      }
    },
    stepIntoStatement: {
      value: function() {
        debug.request('continue', { arguments: {stepaction:'in'}});
        sendEvent('resumedScript');
      }
    },
    stepOutOfFunction: {
      value: function() {
        debug.request('continue', { arguments: {stepaction:'out'}});
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
