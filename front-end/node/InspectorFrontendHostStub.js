
WebInspector.PlatformFlavor = {
    WindowsVista: "windows-vista",
    MacTiger: "mac-tiger",
    MacLeopard: "mac-leopard",
    MacSnowLeopard: "mac-snowleopard"
}

WebInspector.isMac = function()
{
    if (typeof WebInspector._isMac === "undefined")
        WebInspector._isMac = WebInspector.platform === "mac";

    return WebInspector._isMac;
}

if (!window.InspectorFrontendHost) {

/**
 * @constructor
 */
WebInspector.InspectorFrontendHostStub = function()
{
    this._attachedWindowHeight = 0;
}

WebInspector._platformFlavor = WebInspector.PlatformFlavor.MacLeopard;

WebInspector.InspectorFrontendHostStub.prototype = {
    platform: function()
    {
        var match = navigator.userAgent.match(/Windows NT/);
        if (match)
            return "windows";
        match = navigator.userAgent.match(/Mac OS X/);
        if (match)
            return "mac";
        return "linux";
    },

    port: function()
    {
        return "qt";
    },

    bringToFront: function()
    {
        this._windowVisible = true;
    },

    closeWindow: function()
    {
        this._windowVisible = false;
    },

    disconnectFromBackend: function()
    {
        this._windowVisible = false;
    },

    attach: function()
    {
    },

    detach: function()
    {
    },

    search: function(sourceRow, query)
    {
    },

    setAttachedWindowHeight: function(height)
    {
    },

    moveWindowBy: function(x, y)
    {
    },

    setExtensionAPI: function(script)
    {
    },

    loaded: function()
    {
    },

    localizedStringsURL: function()
    {
        return undefined;
    },

    hiddenPanels: function()
    {
        return "elements,resources,timeline,network,audits,profiles";
    },

    inspectedURLChanged: function(url)
    {
    },

    copyText: function()
    {
    },

    saveAs: function(fileName, content)
    {
        var builder = new WebKitBlobBuilder();
        builder.append(content);
        var blob = builder.getBlob("application/octet-stream");
    
        var fr = new FileReader();
        fr.onload = function(e) {
            // Force download
            window.location = this.result;
        }
        fr.readAsDataURL(blob);
    },

    canAttachWindow: function()
    {
        return false;
    },

    sendMessageToBackend: function(message)
    {
    },

    recordActionTaken: function(actionCode)
    {
    },

    recordPanelShown: function(panelCode)
    {
    },

    recordSettingChanged: function(settingCode)
    {
    }
}

var InspectorFrontendHost = new WebInspector.InspectorFrontendHostStub();
}
