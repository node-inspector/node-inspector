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
  () => NetworkAgent._clearCapturedData()
);

WebInspector.NetworkPanelOverrides = function() {
  this._chromeSpecificsAreHidden = false;

  this._hideChromeSpecifics();
}

WebInspector.NetworkPanelOverrides.prototype = {
  _hideChromeSpecifics: function() {
    WebInspector.targetManager.addModelListener(
      WebInspector.ResourceTreeModel,
      WebInspector.ResourceTreeModel.EventTypes.CachedResourcesLoaded,
      () => WebInspector.inspectorView.panel('network').then(
        (panel) => {
          if (this._chromeSpecificsAreHidden) return;

          panel._panelToolbar._items.forEach((item, index) => {
            if (item instanceof WebInspector.ToolbarCheckbox)
              return item.setVisible(false);

            if (item instanceof WebInspector.ToolbarSeparator)
              if (!panel._panelToolbar._items[index - 1].visible())
                return item.setVisible(false);

            if (item instanceof WebInspector.ToolbarButton)
              if (item.title() == "Block network requests")
                return item.setVisible(false);

            if (item instanceof WebInspector.ToolbarComboBox)
              return item.setVisible(false);
          });
          this._chromeSpecificsAreHidden = true;
        })
    );
  }
};

new WebInspector.NetworkPanelOverrides();
