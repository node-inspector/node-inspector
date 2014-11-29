// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @interface
 */
WebInspector.Renderer = function()
{
}

WebInspector.Renderer.prototype = {
    /**
     * @param {!Object} object
     * @return {!Promise.<!Element>}
     */
    render: function(object) {}
}

/**
 * @param {!Object} object
 * @return {!Promise.<!Element>}
 */
WebInspector.Renderer.renderPromise = function(object)
{
    if (!object)
        return Promise.rejectWithError("Can't render " + object);

    return self.runtime.instancePromise(WebInspector.Renderer, object).then(render);

    /**
     * @param {!WebInspector.Renderer} renderer
     */
    function render(renderer)
    {
        return renderer.render(object);
    }
}

/**
 * @interface
 */
WebInspector.Revealer = function()
{
}

/**
 * @param {?Object} revealable
 * @param {number=} lineNumber
 */
WebInspector.Revealer.reveal = function(revealable, lineNumber)
{
    WebInspector.Revealer.revealPromise(revealable, lineNumber).done();
}

/**
 * @param {?Object} revealable
 * @param {number=} lineNumber
 * @return {!Promise.<undefined>}
 */
WebInspector.Revealer.revealPromise = function(revealable, lineNumber)
{
    if (!revealable)
        return Promise.rejectWithError("Can't reveal " + revealable);

    return self.runtime.instancesPromise(WebInspector.Revealer, revealable).then(reveal);

    /**
     * @param {!Array.<!WebInspector.Revealer>} revealers
     * @return {!Promise.<undefined>}
     */
    function reveal(revealers)
    {
        var promises = [];
        for (var i = 0; i < revealers.length; ++i)
            promises.push(revealers[i].reveal(/** @type {!Object} */ (revealable), lineNumber));
        return Promise.race(promises);
    }
}

WebInspector.Revealer.prototype = {
    /**
     * @param {!Object} object
     * @param {number=} lineNumber
     * @return {!Promise}
     */
    reveal: function(object, lineNumber) {}
}
