
// Wire up websocket to talk to backend
WebInspector.loaded = function() {
  WebInspector.socket = new WebSocket("ws://" + window.location.host + '/debug?port=' + WebInspector.queryParamsObject.port);
  WebInspector.socket.onmessage = function(message) { WebInspector_syncDispatch(message.data); }
  WebInspector.socket.onerror = function(error) { console.error(error); }
  WebInspector.socket.onopen = function() {
      InspectorFrontendHost.sendMessageToBackend = WebInspector.socket.send.bind(WebInspector.socket);
      WebInspector.doLoadedDone();
  }
  return;
};

// debugger always enabled
Preferences.debuggerAlwaysEnabled = true;
// enable LiveEdit
Preferences.canEditScriptSource = true;
// enable heap profiler
Preferences.heapProfilerPresent = true;

// patch new watch expression (default crashes node)
WebInspector.WatchExpressionsSection.NewWatchExpression = "''";

// enable ctrl+click for conditional breakpoints
WebInspector.SourceFrame.prototype._mouseDown = function(event)
{
  this._resetHoverTimer();
  this._hidePopup();
  if (event.button != 0 || event.altKey || event.metaKey)
      return;
  var target = event.target.enclosingNodeOrSelfWithClass("webkit-line-number");
  if (!target)
      return;
  var row = target.parentElement;

  var lineNumber = row.lineNumber;

  var breakpoint = this._textModel.getAttribute(lineNumber, "breakpoint");
  if (breakpoint) {
      if (event.shiftKey) {
          breakpoint.enabled = !breakpoint.enabled;
      }
      else if (!event.ctrlKey) {
          breakpoint.remove();
      }
  } else {
      this._addBreakpointDelegate(lineNumber + 1);
      breakpoint = this._textModel.getAttribute(lineNumber, "breakpoint");
  }
  if (breakpoint && event.ctrlKey) {
      this._editBreakpointCondition(breakpoint);
  }
  event.preventDefault();
};

