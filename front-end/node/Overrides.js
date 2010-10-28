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
/*
(function() {
  window.addEventListener("load", function() {
    WebInspector.WatchExpressionsSection.NewWatchExpression = "''";

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
                this._removeBreakpointDelegate(breakpoint);
                breakpoint = null;
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

    var panel = WebInspector.panels.scripts.panelEnablerView;
    panel.choicesForm.removeChild(panel.disclaimerElement);
    panel.choicesForm.removeChild(panel.enabledForSession.parentNode);
    panel.choicesForm.removeChild(panel.enabledAlways.parentNode);
    panel.headerElement.textContent = "all your node are belong to us";
    panel.enableButton.textContent = 'Connect to Node';
    var div = document.createElement('div');
    panel.error = document.createElement('h3');
    panel.error.style.color = 'red';
    var plabel = document.createElement('label');
    plabel.style.left = '65px';
    var port = document.createElement('input');
    port.style.width = '50px';
    port.type = 'text';
    port.value = 5858;
    plabel.appendChild(document.createTextNode('Debug port: '));
    plabel.appendChild(port);
    div.appendChild(plabel);
    panel.choicesForm.insertBefore(div, panel.enableButton);
    panel.choicesForm.appendChild(panel.error);

    panel.enableButton.addEventListener("click", function() {
      panel.error.textContent = ' ';
      WebInspector.nodeDebugger.port = parseInt(port.value, 10);
    }, false);
  }, false);
}())
*/
