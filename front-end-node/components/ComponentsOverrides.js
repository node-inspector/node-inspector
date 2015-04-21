/*jshint browser:true, nonew:false*/
/*global WebInspector:true*/

var drawer_proto = WebInspector.Drawer.prototype;
drawer_proto.oldWasShown = drawer_proto.wasShown;
drawer_proto.wasShown = function()
{
    WebInspector.inspectorView.registerRequiredCSS('node/components/ComponentsOverrides.css');
    drawer_proto.wasShown = drawer_proto.oldWasShown;
    drawer_proto.oldWasShown.call(this);
}

WebInspector.HandlerRegistry.prototype._appendContentProviderItems = function(contextMenu, target)
{
  if (!(target instanceof WebInspector.UISourceCode || target instanceof WebInspector.Resource || target instanceof WebInspector.NetworkRequest))
    return;
  var contentProvider = /** @type {!WebInspector.ContentProvider} */ (target);
  if (!contentProvider.contentURL())
    return;

  //contextMenu.appendItem(WebInspector.openLinkExternallyLabel(), this._openInNewTab.bind(this, contentProvider.contentURL()));
  // Skip 0th handler, as it's 'Use default panel' one.
  for (var i = 1; i < this.handlerNames.length; ++i) {
    var handler = this.handlerNames[i];
    contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Open using %s" : "Open Using %s", handler),
      this.dispatchToHandler.bind(this, handler, { url: contentProvider.contentURL() }));
  }
  //contextMenu.appendItem(WebInspector.copyLinkAddressLabel(), InspectorFrontendHost.copyText.bind(InspectorFrontendHost, contentProvider.contentURL()));

  if (!contentProvider.contentURL())
    return;

  var contentType = contentProvider.contentType();
  if (contentType !== WebInspector.resourceTypes.Document &&
    contentType !== WebInspector.resourceTypes.Stylesheet &&
    contentType !== WebInspector.resourceTypes.Script)
    return;

  /**
   * @param {boolean} forceSaveAs
   * @param {?string} content
   */
  function doSave(forceSaveAs, content)
  {
    var url = contentProvider.contentURL();
    WebInspector.fileManager.save(url, /** @type {string} */ (content), forceSaveAs);
    WebInspector.fileManager.close(url);
  }

  /**
   * @param {boolean} forceSaveAs
   */
  function save(forceSaveAs)
  {
    if (contentProvider instanceof WebInspector.UISourceCode) {
      var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (contentProvider);
      uiSourceCode.save(forceSaveAs);
      return;
    }
    contentProvider.requestContent(doSave.bind(null, forceSaveAs));
  }

  contextMenu.appendSeparator();
  contextMenu.appendItem(WebInspector.UIString("Save"), save.bind(null, false));

  if (contentProvider instanceof WebInspector.UISourceCode) {
    var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (contentProvider);
    if (uiSourceCode.project().type() !== WebInspector.projectTypes.FileSystem && uiSourceCode.project().type() !== WebInspector.projectTypes.Snippets)
      contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Save as..." : "Save As..."), save.bind(null, true));
  }
}
