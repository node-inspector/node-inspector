// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!WebInspector.AnimationModel.AnimationGroup} model
 */
WebInspector.AnimationGroupPreviewUI = function(model)
{
    this._model = model;
    this.element = createElementWithClass("div", "animation-buffer-preview");
    this._svg = this.element.createSVGChild("svg");
    this._svg.setAttribute("width", "100%");
    this._svg.setAttribute("preserveAspectRatio", "none");
    this._svg.setAttribute("height", "100%");
    this._svg.setAttribute("viewBox", "0 0 100 27");
    this._svg.setAttribute("shape-rendering", "crispEdges");
    this._render();
}

WebInspector.AnimationGroupPreviewUI.prototype = {
    /**
     * @return {number}
     */
    _groupDuration: function()
    {
        var duration = 0;
        for (var anim of this._model.animations()) {
            var animDuration = anim.source().delay() + anim.source().duration();
            if (animDuration > duration)
                duration = animDuration;
        }
        return duration;
    },

    _render: function()
    {
        this._svg.removeChildren();
        const numberOfAnimations = Math.min(this._model.animations().length, 10);
        var timeToPixelRatio = 100 / Math.max(this._groupDuration(), 300);
        for (var i = 0; i < numberOfAnimations; i++) {
            var effect = this._model.animations()[i].source();
            var line = this._svg.createSVGChild("line");
            line.setAttribute("x1", effect.delay() * timeToPixelRatio);
            line.setAttribute("x2", (effect.delay() + effect.duration()) * timeToPixelRatio);
            var y = Math.floor(27 / numberOfAnimations * i) + 1;
            line.setAttribute("y1", y);
            line.setAttribute("y2", y);
            line.style.stroke = WebInspector.AnimationUI.Color(this._model.animations()[i]);
        }
    }
}