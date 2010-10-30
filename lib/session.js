var http = require('http'),
    events = require('events'),
    path = require('path'),
    debugr = require('./debugger');

///////////////////////////////////////////////////////////
// exports

exports.createSession = function (conn, debuggerPort) {
  var debug = null,
      //map from sourceID:lineNumber to breakpoint
      breakpoints = {},
      //map from sourceID to filename
      sourceIDs = {},
      //limit on the number of properties able to show
      MAX_PROPERTIES = 256;
  
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
        var name = /#<an?\s(\w+)>/.exec(ref.text);
        if (name && name.length > 1) {
          desc = name[1];
          if (desc === 'Array' || desc === 'Buffer') {
            desc += '[' + (ref.properties.length - 1) + ']'; // -1 for .length
          }
        }
        else {
          desc = ref.className || 'Object';
        }
      break;
      case 'function':
        desc = ref.text || 'function()';
      break;
      default:
        desc = ref.text || '';
      break;
    }
    if (desc.length > 100) {
      desc = desc.substring(0, 100) + "\u2026";
    }
    //Buffers are too massive to show their properties
    var kids = (!/Buffer.+/.test(desc) && ref.properties) ? ref.properties.length : false;
    return wrapperObject(ref.type, desc, kids, 0, 0, ref.handle);
  }
  
  function callFrames(bt) {
      return bt.body.frames.map(function(frame) {
        var f = {
          type: 'function',
          functionName: frame.func.inferredName,
          sourceID: frame.func.scriptId,
          line: frame.line + 1,
          id: frame.index,
          worldId: 1,
          scopeChain: frame.scopes.map(
            function(scope) {
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
              c.objectId = frame.index + ':' + scope.index + ':backtrace';
              return c;
            })
          };
          return f;
        });
  }

  function evaluate(expr, frame, andThen) {
    if (['require', 'exports', 'module', '__filename', '__dirname'].indexOf(expr) > -1) {
      andThen({success: false, message:'could not evaluate \'' + expr + '\'' });
    }
    else {
      var args = { expression: expr, disable_break: true, global: true };
      if (frame != null) {
        args.frame = frame;
        args.global = false;
      }
      debug.request(
        'evaluate',
        { arguments: args},
        andThen);
    }
  }

  function sendBacktrace() {
    debug.request(
      'backtrace',
      {arguments: { inlineRefs: true }},
      function(msg) {
        sendEvent('pausedScript', { details: { callFrames: callFrames(msg) }});
      });
  }

  function breakEvent(obj) {
    var data = {};
    if(!sourceIDs[obj.body.script.id]) {
      var args = { arguments: { includeSource: true, types: 4, ids: [obj.body.script.id] }};
      debug.request('scripts', args, parsedScripts);
    }
    sendBacktrace();
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
        debug = debugr.attachDebugger(debuggerPort);
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
                      condition: bp.condition,
                      number: bp.number,
                    };
                    breakpoints[bp.script_id + ':' + (bp.line + 1)] = data;
                    sendEvent('restoredBreakpoint', data);
                  }
                });
                if (!msg.running) {
                  sendBacktrace();
                }
              });
          });
        });
        debug.on('exception', function(msg) {
          breakEvent(msg);
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
    dispatchOnInjectedScript: {
      value: function(injectedScriptId, methodName, argString, seq) {
        var args = JSON.parse(argString);
        if (methodName === 'getProperties') {
          var objectId = args[0];
          var tokens = objectId.split(":");
          
          var frame = parseInt(tokens[0], 10);
          var scope = parseInt(tokens[1], 10);
          var ref = tokens[2];
          
          if (ref === 'backtrace') {
            debug.request('scope', { arguments: { number:scope, frameNumber:frame, inlineRefs:true }},
              function(msg) {
                if (msg.success) {
                  var refs = {};
                  if (msg.refs && Array.isArray(msg.refs)) {
                    msg.refs.forEach(function(r) {
                      refs[r.handle] = r;
                    });
                  }
                  var props = msg.body.object.properties.map(function(p) {
                    var r = refs[p.value.ref];
                    return {
                      name: p.name,
                      value: refToObject(r)
                    };
                  });
                  sendResponse(seq, true, { result:props });
                }
              });
          }
          else {
            var handle = parseInt(ref, 10);
            debug.request('lookup', { arguments: { handles:[handle], includeSource: false }},
              function(msg) {
                //TODO break out commonality with above
                if (msg.success) {
                  var refs = {};
                  var props = [];
                  if (msg.refs && Array.isArray(msg.refs)) {
                    var obj = msg.body[handle];
                    var objProps = obj.properties;
                    var proto = obj.protoObject;
                    //Lame guard against objects that are too big to show
                    if (msg.refs.length > MAX_PROPERTIES || objProps.length > MAX_PROPERTIES) {
                      props.push({name: 'sorry', value: wrapperObject('string', 'object too big to show', false, 0,0,0)});
                    }
                    else {
                      msg.refs.forEach(function(r) {
                        refs[r.handle] = r;
                      });
                      props = objProps.map(function(p) {
                        var r = refs[p.ref];
                        return {
                          name: String(p.name),
                          value: refToObject(r)
                        };
                      });
                      if (proto) {
                        props.push({name:'__proto__', value: refToObject(refs[proto.ref])});
                      }
                    }
                  }
                  sendResponse(seq, true, { result:props });
                }
              });
          }
          
        }
        else if (methodName === 'getCompletions') {
          var expr = args[0];
          var data = {
              result: {},
              isException: false
            };
          // expr looks to be empty "" a lot so skip evaluate
          if (expr === '') {
            sendResponse(seq, true, data);
            return;
          }
          evaluate(expr, args[2], function(msg) {
            if(msg.success &&
               msg.body.properties &&
               msg.body.properties.length < MAX_PROPERTIES) {

                msg.body.properties.forEach(function(p) {
                  data.result[p.name] = true;
                });
            }
            sendResponse(seq, true, data);
          });

        }
        else {
          var evalResponse = function (msg) {
            if (msg.success) {
              sendResponse(seq, true, { result: refToObject(msg.body),isException: false });
            }
            else {
              sendResponse(seq, true, { result: { type:'error', description:msg.message }, isException:false });
            }
          }
          if (methodName === 'evaluateInCallFrame') {
            evaluate(args[1], args[0], evalResponse);
          }
          else if (methodName === 'evaluate') {
            evaluate(args[0], null, evalResponse);
          }
        }
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
    getInspectorState: {
      value: function(seq) {
        sendResponse(seq, true, {
              state:{
                 monitoringXHREnabled:false,
                 resourceTrackingEnabled:false
              }});
      }
    },
    getResourceContent: {
      value: function(identifier, encode) {
        // ???
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
    clearConsoleMessages: {
      value: function() {
        sendEvent('consoleMessagesCleared');
      }
    },
    //Debug
    setBreakpoint: {
      value: function(sourceID, lineNumber, enabled, condition, seq) {
        var bp = breakpoints[sourceID + ':' + lineNumber];
        var handleResponse = function(msg) {
          if (msg.success) {
            var b = msg.body;
            breakpoints[b.script_id + ':' + (b.line + 1)] = {
              sourceID: b.script_id,
              url: sourceIDs[b.script_id],
              line: b.line + 1,
              enabled: enabled,
              condition: condition,
              number: b.breakpoint
            };
            b.breakpoint;
            var data = { success: true, actualLineNumber: b.line + 1 };
            sendResponse(seq, true, data);
          }
        };
        
        if(bp) {
          debug.request(
            'changebreakpoint',
            { arguments: {
                breakpoint: bp.number,
                enabled: enabled,
                condition: condition
            }},
            function(msg) {
              bp.enabled = enabled;
              bp.condition = condition;
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
          { arguments: { breakpoint: breakpoints[id].number }},
          function(msg) {
            if (msg.success) {
              delete breakpoints[id];
            }
          });
      }
    },
    activateBreakpoints: {
      value: function() {
        Object.keys(breakpoints).forEach(
          function(key) {
            var bp = breakpoints[key];
            debug.request(
              'changebreakpoint',
              { arguments: {
                  breakpoint: bp.number,
                  condition: bp.condition,
                  enabled: true
              }},
              function(msg) {
                if (msg.success) {
                  bp.enabled = true;
                  sendEvent('restoredBreakpoint', bp);
                }
              });
          });
      }
    },
    deactivateBreakpoints: {
      value: function(injectedScriptId, objectGroup) {
        Object.keys(breakpoints).forEach(
          function(key) {
            var bp = breakpoints[key];
            debug.request(
              'changebreakpoint',
              { arguments: {
                  breakpoint: bp.number,
                  condition: bp.condition,
                  enabled: false
              }},
              function(msg) {
                if (msg.success) {
                  bp.enabled = false;
                  sendEvent('restoredBreakpoint', bp);
                }
              });
          });
      }
    },
    pause: {
      value: function() {
        debug.request('suspend', {}, function(msg){
          if(!msg.running) {
            sendBacktrace();
          }
        });
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
      value: function(state, seq) {
        var params = {
          arguments: {
            flags: [{
              name:'breakOnCaughtException',
              value: state === 1}]
           }
         };
        debug.request('flags', params, function(msg) {
          if (msg.success) {
            var value = 0;
            if(msg.body.flags.some(function (x) {
                return x.name === 'breakOnCaughtException' && x.value})) {
              value = 1;
            }
            sendResponse(seq, true, {pauseOnExceptionState: value});
          }
        });
      }
    },
    editScriptSource: {
      value: function(sourceID, newContent, seq) {
        var args = {
          script_id: sourceID,
          preview_only: false,
          new_source: newContent
        };
        debug.request(
          'changelive',
          {arguments: args},
          function(msg) {
            sendResponse(
              seq,
              msg.success,
              {
                success: msg.success,
                newBodyOrErrorMessage: msg.message || newContent
              });
              //TODO: new callframes?
          });
      }
    },
    getScriptSource: {
      value: function(sourceID, seq) {
        // unobserved / unverified
        var args = { arguments: { includeSource: true, types: 4, ids: [sourceID] }};
        debug.request('scripts', args, function(msg) {
          sendResponse(seq, msg.success, { scriptSource: msg.body[0].source });
        });
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
