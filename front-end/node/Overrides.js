(function() {
  window.addEventListener("load", function() {
    //var box = document.createElement('input');
    WebInspector.WatchExpressionsSection.NewWatchExpression = "''";
    
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
