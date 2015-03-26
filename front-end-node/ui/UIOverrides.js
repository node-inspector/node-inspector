/*jshint browser:true, nonew:false*/
/*global WebInspector:true*/

var statusbar_proto = WebInspector.StatusBar.prototype;
WebInspector.StatusBar = function(parentElement)
{
    /** @type {!Array.<!WebInspector.StatusBarItem>} */
    this._items = [];
    this.element = parentElement ? parentElement.createChild("div", "status-bar") : createElementWithClass("div", "status-bar");

    this._shadowRoot = this.element.createShadowRoot();
    this._shadowRoot.appendChild(WebInspector.View.createStyleElement("ui/statusBar.css"));
    this._shadowRoot.appendChild(WebInspector.View.createStyleElement("node/ui/StatusBarOverrides.css"));
    this._contentElement = this._shadowRoot.createChild("div", "status-bar-shadow");
    this._contentElement.createChild("content");
    WebInspector.installComponentRootStyles(this._contentElement);
}
WebInspector.StatusBar.prototype = statusbar_proto;
