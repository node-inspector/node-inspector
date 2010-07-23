(function() {
  window.addEventListener("load", function() {
    //var box = document.createElement('input');
    var panel = WebInspector.panels.scripts.panelEnablerView;
    panel.disclaimerElement.style.display = 'none';
    panel.enabledForSession.parentNode.style.display = 'none';
    panel.enabledAlways.parentNode.style.display = 'none';
    panel.enableButton.textContent = 'Connect to Node';
    panel.enableButton.addEventListener("click", function() {
      console.log('blah');
    }, false);
  }, false);
}())
