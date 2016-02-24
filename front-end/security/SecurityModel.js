// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.SDKModel}
 * @param {!WebInspector.Target} target
 */
WebInspector.SecurityModel = function(target)
{
    WebInspector.SDKModel.call(this, WebInspector.SecurityModel, target);
    this._dispatcher = new WebInspector.SecurityDispatcher(this);
    this._securityAgent = target.securityAgent();
    target.registerSecurityDispatcher(this._dispatcher);
    this._securityAgent.enable();
}

WebInspector.SecurityModel.EventTypes = {
    SecurityStateChanged: "SecurityStateChanged"
}

WebInspector.SecurityModel.prototype = {
    __proto__: WebInspector.SDKModel.prototype
}

/**
 * @param {!WebInspector.Target} target
 * @return {?WebInspector.SecurityModel}
 */
WebInspector.SecurityModel.fromTarget = function(target)
{
    var model = /** @type {?WebInspector.SecurityModel} */ (target.model(WebInspector.SecurityModel));
    if (!model)
        model = new WebInspector.SecurityModel(target);
    return model;
}

/**
 * @constructor
 * @param {!SecurityAgent.SecurityState} securityState
 * @param {!Array<!SecurityAgent.SecurityStateExplanation>} explanations
 * @param {?SecurityAgent.MixedContentStatus} mixedContentStatus
 * @param {boolean} schemeIsCryptographic
 */
WebInspector.PageSecurityState = function (securityState, explanations, mixedContentStatus, schemeIsCryptographic) {
    this.securityState = securityState;
    this.explanations = explanations;
    this.mixedContentStatus = mixedContentStatus;
    this.schemeIsCryptographic = schemeIsCryptographic;
}

/**
 * @constructor
 * @implements {SecurityAgent.Dispatcher}
 */
WebInspector.SecurityDispatcher = function(model)
{
    this._model = model;
}

WebInspector.SecurityDispatcher.prototype = {
    /**
     * @override
     * @param {!SecurityAgent.SecurityState} securityState
     * @param {!Array<!SecurityAgent.SecurityStateExplanation>=} explanations
     * @param {!SecurityAgent.MixedContentStatus=} mixedContentStatus
     * @param {boolean=} schemeIsCryptographic
     */
    securityStateChanged: function(securityState, explanations, mixedContentStatus, schemeIsCryptographic)
    {
        var pageSecurityState = new WebInspector.PageSecurityState(securityState, explanations || [], mixedContentStatus || null, schemeIsCryptographic || false);
        this._model.dispatchEventToListeners(WebInspector.SecurityModel.EventTypes.SecurityStateChanged, pageSecurityState);
    }
}
