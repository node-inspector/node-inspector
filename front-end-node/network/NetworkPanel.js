/*jshint browser:true, nonew:false*/
/*global WebInspector:true, NetworkAgent:true*/
WebInspector.NetworkLogView.prototype.orig_toggleRecordButton =
  WebInspector.NetworkLogView.prototype._toggleRecordButton;

WebInspector.NetworkLogView.prototype._toggleRecordButton = function(toggled) {
  this.orig_toggleRecordButton.apply(this, arguments);

  if (!window.NetworkAgent) return;
  NetworkAgent._setCapturingEnabled(this._recordButton.toggled());
};

WebInspector.NetworkPanel._instance()._networkLogView.addEventListener(
  WebInspector.NetworkLogView.EventTypes.ViewCleared,
  function() {
    NetworkAgent._clearCapturedData();
  });

WebInspector.NetworkPanel._instance()._networkLogView._preserveLogCheckbox.setVisible(false);
WebInspector.NetworkPanel._instance()._networkLogView._disableCacheCheckbox.setVisible(false);
