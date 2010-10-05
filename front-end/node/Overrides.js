(function() {
  window.addEventListener("load", function() {
    WebInspector.WatchExpressionsSection.NewWatchExpression = "''";

    //Source Frame 
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

    //Script Panel
    var sPanel = WebInspector.panels.scripts.panelEnablerView;
    sPanel.choicesForm.removeChild(sPanel.disclaimerElement);
    sPanel.choicesForm.removeChild(sPanel.enabledForSession.parentNode);
    sPanel.choicesForm.removeChild(sPanel.enabledAlways.parentNode);
    sPanel.headerElement.textContent = "all your node are belong to us";
    sPanel.enableButton.textContent = 'Connect to Node';
    var div = document.createElement('div');
    sPanel.error = document.createElement('h3');
    sPanel.error.style.color = 'red';
    var plabel = document.createElement('label');
    plabel.style.left = '65px';
    var port = document.createElement('input');
    port.style.width = '50px';
    port.type = 'text';
    port.value = 5858;
    plabel.appendChild(document.createTextNode('Debug port: '));
    plabel.appendChild(port);
    div.appendChild(plabel);
    sPanel.choicesForm.insertBefore(div, sPanel.enableButton);
    sPanel.choicesForm.appendChild(sPanel.error);

    sPanel.enableButton.addEventListener("click", function() {
      sPanel.error.textContent = ' ';
      WebInspector.nodeDebugger.port = parseInt(port.value, 10);
    }, false);
    
    //Profile Panel
    var pPanel = WebInspector.panels.profiles.panelEnablerView;
    pPanel.choicesForm.removeChild(pPanel.disclaimerElement);
    pPanel.choicesForm.removeChild(pPanel.enabledForSession.parentNode);
    pPanel.choicesForm.removeChild(pPanel.enabledAlways.parentNode);
    pPanel.headerElement.textContent = 'Enter the path to the V8 log file';
    pPanel.enableButton.textContent = 'Set';
    var path = document.createElement('input');
    path.style.width = '300px';
    path.type = 'text';
    path.value = '/absolute/path/to/your/v8.log';
    var dv = document.createElement('div');
    dv.appendChild(path);
    pPanel.choicesForm.insertBefore(dv, pPanel.enableButton);
    path.addEventListener('blur', function() {
      WebInspector.nodeDebugger.logPath = path.value;
    }, false);
  }, false);
}())
