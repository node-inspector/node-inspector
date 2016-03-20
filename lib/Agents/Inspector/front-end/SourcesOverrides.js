/*jshint browser:true, nonew:false*/
/*global WebInspector:true*/
WebInspector.SourcesOverrides = function() {
  this._chromeSpecificsAreHidden = false;
  this._hideChromeSpecifics();
};

WebInspector.SourcesOverrides.prototype = {
  _hideChromeSpecifics: function() {
    WebInspector.targetManager.addModelListener(
      WebInspector.ResourceTreeModel,
      WebInspector.ResourceTreeModel.EventTypes.CachedResourcesLoaded,
      () => WebInspector.inspectorView.panel('sources').then(
        (panel) => {
          if (this._chromeSpecificsAreHidden) return;

          var panes = panel.sidebarPanes;
          [
            panes.domBreakpoints,
            panes.eventListenerBreakpoints,
            panes.objectEventListeners,
            panes.xhrBreakpoints
          ].forEach(function(element) {
            element.setVisible(false);
          });
          this._chromeSpecificsAreHidden = true;
        })
    );
  }
};

new WebInspector.SourcesOverrides();
