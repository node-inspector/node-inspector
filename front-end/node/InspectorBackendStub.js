/*
 * Copyright (C) 2009 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *	   * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *	   * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *	   * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

if (!window.InspectorBackend) {

WebInspector.InspectorBackendStub = function()
{
  this._attachedWindowHeight = 0;
  this._timelineEnabled = false;
}

WebInspector.InspectorBackendStub.prototype = {
  wrapCallback: function(func)
  {
    return func;
  },

  closeWindow: function()
  {
    this._windowVisible = false;
  },

  attach: function()
  {
  },

  detach: function()
  {
  },

  storeLastActivePanel: function(panel)
  {
  },

  clearConsoleMessages: function()
  {
    WebInspector.console.clearMessages();
  },

  getOuterHTML: function()
  {
  },

  setOuterHTML: function()
  {
  },

  addInspectedNode: function()
  {
  },

  search: function(sourceRow, query)
  {
  },

  moveByUnrestricted: function(x, y)
  {
  },

  getResourceContent: function(callId, identifier)
  {
    WebInspector.didGetResourceContent(callId, "");
  },

  highlightDOMNode: function(node)
  {
  },

  hideDOMNodeHighlight: function()
  {
  },

  inspectedWindow: function()
  {
    return window;
  },

  loaded: function()
  {
  },

  localizedStringsURL: function()
  {
    return undefined;
  },

  windowUnloading: function()
  {
    return false;
  },

  hiddenPanels: function()
  {
    return "";
  },

  enableResourceTracking: function()
  {
    WebInspector.resourceTrackingWasEnabled();
  },

  disableResourceTracking: function()
  {
    WebInspector.resourceTrackingWasDisabled();
  },


  enableSearchingForNode: function()
  {
    WebInspector.searchingForNodeWasEnabled();
  },

  disableSearchingForNode: function()
  {
    WebInspector.searchingForNodeWasDisabled();
  },

  enableMonitoringXHR: function()
  {
    WebInspector.monitoringXHRWasEnabled();
  },

  disableMonitoringXHR: function()
  {
    WebInspector.monitoringXHRWasDisabled();
  },

  reloadPage: function()
  {
  },

  enableDebugger: function()
  {
    WebInspector.nodeDebugger.connect();
  },

  disableDebugger: function()
  {
    WebInspector.nodeDebugger.close();
  },

  setBreakpoint: function(callId, sourceID, line, enabled, condition)
  {
    WebInspector.nodeDebugger.setBreakpoint(callId, sourceID, line, enabled, condition);
  },

  removeBreakpoint: function(sourceID, line)
  {
    WebInspector.nodeDebugger.clearBreakpoint(sourceID, line);
  },

  activateBreakpoints: function()
  {
    var bps = WebInspector.breakpointManager._breakpoints;
    Object.keys(bps).forEach(
      function(key) {
        bps[key].enabled = true;
      });
    this._breakpointsActivated = true;
  },

  deactivateBreakpoints: function()
  {
    var bps = WebInspector.breakpointManager._breakpoints;
    Object.keys(bps).forEach(
      function(key) {
        bps[key].enabled = false;
      });
    this._breakpointsActivated = false;
  },

  pause: function()
  {
    WebInspector.nodeDebugger.pause();
  },

  setPauseOnExceptionsState: function(value)
  {
    WebInspector.updatePauseOnExceptionsState(value);
  },

  editScriptSource: function()
  {
    WebInspector.didEditScriptSource(callId, false);
  },

  getScriptSource: function(callId, sourceID)
  {
    WebInspector.didGetScriptSource(callId, null);
  },

  resume: function()
  {
    WebInspector.nodeDebugger.resume();
  },

  enableProfiler: function()
  {
    WebInspector.profilerWasEnabled();
  },

  disableProfiler: function()
  {
    WebInspector.profilerWasDisabled();
  },

  startProfiling: function()
  {
  },

  stopProfiling: function()
  {
  },

  getProfileHeaders: function(callId)
  {
    WebInspector.didGetProfileHeaders(callId, []);
  },

  getProfile: function(callId, uid)
  {
  },

  takeHeapSnapshot: function()
  {
  },

  databaseTableNames: function(database)
  {
    return [];
  },

  stepIntoStatement: function()
  {
    WebInspector.nodeDebugger.resume('in');
  },

  stepOutOfFunction: function()
  {
    WebInspector.nodeDebugger.resume('out');
  },

  stepOverStatement: function()
  {
    WebInspector.nodeDebugger.resume('next');
  },

  saveApplicationSettings: function()
  {
  },

  saveSessionSettings: function()
  {
  },
  
  
  dispatchOnInjectedScript: function()
  {
    console.log("injected: " + JSON.stringify(arguments));
    switch(arguments[2]) {
      case 'getProperties':
        var id = arguments[1];
    
        var _decode = function(local) 
        {
          var n = local.name || 'arguments[' + argi + ']';
          argi += 1;
          var p = {name: n};
          switch (local.value.type) {
            case 'object':
              p.value = {
                description: local.value.className,
                hasChildren: true,
                injectedScriptId: local.value.ref
                };
              break;
            case 'function':
              p.value = {
                description: 'function ' + n + '()',
                hasChildren: true,
                injectedScriptId: local.value.ref
                };
              break;
            case 'undefined':
              p.value = {description: 'undefined'};
              break;
            case 'null':
              p.value = {description: 'null'};
              break;
            default:
              p.value = {description: local.value.value};
              break;
          }
          return p;
        };
        if (id.scopeId !== undefined) {
          var x = JSON.parse(arguments[3]);
          if(x[0] && x[0].isLocal)
          {
            var obj = x[0];
            var props = obj.locals.map(_decode);
            var argi = 0;
            props = props.concat(obj.arguments.map(_decode));
            WebInspector.Callback.processCallback(arguments[0], props);
          }
          else {
            WebInspector.nodeDebugger.getScope(id.frameId, id.scopeId, arguments[0]);
          }
        }
        else {
          WebInspector.nodeDebugger.lookup(id, arguments[0]);
        }
        break;
      case 'evaluate':
        var expr = JSON.parse(arguments[3])[0];
        WebInspector.nodeDebugger.evaluate(expr, arguments[0]);
        break;
      case 'evaluateInCallFrame':
        var args = JSON.parse(arguments[3]);
        var frameId = args[0];
        var expr = args[1];
        //HACK: protect against evaluating known dangerous expressions,
        // i.e. ones that crash node
        if (['require', 'exports', 'module', '__filename', '__dirname'].indexOf(expr) > -1) {
          WebInspector.Callback.processCallback(arguments[0], null);
        }
        else {
          WebInspector.nodeDebugger.evaluate(expr, arguments[0], frameId);
        }
        break;
      default:
        // so the callback list doesn't leak
        WebInspector.Callback.processCallback(arguments[0], null);
        break;
    }
  },

  releaseWrapperObjectGroup: function()
  {
  },

  setInjectedScriptSource: function()
  {
  },
  
  addScriptToEvaluateOnLoad: function()
  {
  },

  removeAllScriptsToEvaluateOnLoad: function()
  {
  },

  performSearch: function()
  {
  },

  searchCanceled: function()
  {
  }
}

InspectorBackend = new WebInspector.InspectorBackendStub();

}
