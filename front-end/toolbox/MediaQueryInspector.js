// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.View}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.MediaQueryInspector = function()
{
    WebInspector.View.call(this);
    this.element.classList.add("media-inspector-view", "media-inspector-view-empty");
    this.element.addEventListener("click", this._onMediaQueryClicked.bind(this), false);
    this.element.addEventListener("contextmenu", this._onContextMenu.bind(this), false);
    this._mediaThrottler = new WebInspector.Throttler(0);

    this._offset = 0;
    this._scale = 1;
    this._lastReportedCount = 0;

    WebInspector.targetManager.observeTargets(this);

    WebInspector.zoomManager.addEventListener(WebInspector.ZoomManager.Events.ZoomChanged, this._renderMediaQueries.bind(this), this);
}

/**
 * @enum {number}
 */
WebInspector.MediaQueryInspector.Section = {
    Max: 0,
    MinMax: 1,
    Min: 2
}

WebInspector.MediaQueryInspector.Events = {
    HeightUpdated: "HeightUpdated",
    CountUpdated: "CountUpdated"
}

WebInspector.MediaQueryInspector.prototype = {
    /**
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        // FIXME: adapt this to multiple targets.
        if (this._target)
            return;
        this._target = target;
        target.cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetAdded, this._scheduleMediaQueriesUpdate, this);
        target.cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetRemoved, this._scheduleMediaQueriesUpdate, this);
        target.cssModel.addEventListener(WebInspector.CSSStyleModel.Events.StyleSheetChanged, this._scheduleMediaQueriesUpdate, this);
        target.cssModel.addEventListener(WebInspector.CSSStyleModel.Events.MediaQueryResultChanged, this._scheduleMediaQueriesUpdate, this);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        if (target !== this._target)
            return;
        target.cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetAdded, this._scheduleMediaQueriesUpdate, this);
        target.cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetRemoved, this._scheduleMediaQueriesUpdate, this);
        target.cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.StyleSheetChanged, this._scheduleMediaQueriesUpdate, this);
        target.cssModel.removeEventListener(WebInspector.CSSStyleModel.Events.MediaQueryResultChanged, this._scheduleMediaQueriesUpdate, this);
    },

    /**
     * @param {number} offset
     * @param {number} scale
     */
    setAxisTransform: function(offset, scale)
    {
        if (this._offset === offset && Math.abs(this._scale - scale) < 1e-8)
            return;
        this._offset = offset;
        this._scale = scale;
        this._renderMediaQueries();
    },

    /**
     * @param {boolean} enabled
     */
    setEnabled: function(enabled)
    {
        this._enabled = enabled;
        this._scheduleMediaQueriesUpdate();
    },

    /**
     * @param {!Event} event
     */
    _onMediaQueryClicked: function(event)
    {
        var mediaQueryMarker = event.target.enclosingNodeOrSelfWithClass("media-inspector-marker");
        if (!mediaQueryMarker)
            return;

        /**
         * @param {number} width
         */
        function setWidth(width)
        {
            WebInspector.overridesSupport.settings.deviceWidth.set(width);
            WebInspector.overridesSupport.settings.emulateResolution.set(true);
        }

        var model = mediaQueryMarker._model;
        if (model.section() === WebInspector.MediaQueryInspector.Section.Max) {
            setWidth(model.maxWidthExpression().computedLength());
            return;
        }
        if (model.section() === WebInspector.MediaQueryInspector.Section.Min) {
            setWidth(model.minWidthExpression().computedLength());
            return;
        }
        var currentWidth = WebInspector.overridesSupport.settings.deviceWidth.get();
        if (currentWidth !== model.minWidthExpression().computedLength())
            setWidth(model.minWidthExpression().computedLength());
        else
            setWidth(model.maxWidthExpression().computedLength());
    },

    /**
     * @param {!Event} event
     */
    _onContextMenu: function(event)
    {
        var mediaQueryMarker = event.target.enclosingNodeOrSelfWithClass("media-inspector-marker");
        if (!mediaQueryMarker)
            return;

        var locations = mediaQueryMarker._locations;
        var uiLocations = new Map();
        for (var i = 0; i < locations.length; ++i) {
            var uiLocation = WebInspector.cssWorkspaceBinding.rawLocationToUILocation(locations[i]);
            if (!uiLocation)
                continue;
            var descriptor = String.sprintf("%s:%d:%d", uiLocation.uiSourceCode.uri(), uiLocation.lineNumber + 1, uiLocation.columnNumber + 1);
            uiLocations.set(descriptor, uiLocation);
        }

        var contextMenuItems = uiLocations.keysArray().sort();
        var contextMenu = new WebInspector.ContextMenu(event);
        var subMenuItem = contextMenu.appendSubMenuItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Reveal in source code" : "Reveal In Source Code"));
        for (var i = 0; i < contextMenuItems.length; ++i) {
            var title = contextMenuItems[i];
            subMenuItem.appendItem(title, this._revealSourceLocation.bind(this, /** @type {!WebInspector.UILocation} */(uiLocations.get(title))));
        }
        contextMenu.show();
    },

    /**
     * @param {!WebInspector.UILocation} location
     */
    _revealSourceLocation: function(location)
    {
        WebInspector.Revealer.reveal(location);
    },

    _scheduleMediaQueriesUpdate: function()
    {
        if (!this._enabled)
            return;
        this._mediaThrottler.schedule(this._refetchMediaQueries.bind(this));
    },

    /**
     * @param {!WebInspector.Throttler.FinishCallback} finishCallback
     */
    _refetchMediaQueries: function(finishCallback)
    {
        if (!this._enabled) {
            finishCallback();
            return;
        }

        /**
         * @param {!Array.<!WebInspector.CSSMedia>} cssMedias
         * @this {!WebInspector.MediaQueryInspector}
         */
        function callback(cssMedias)
        {
            this._rebuildMediaQueries(cssMedias);
            finishCallback();
        }
        this._target.cssModel.getMediaQueries(callback.bind(this));
    },

    /**
     * @param {!Array.<!WebInspector.MediaQueryInspector.MediaQueryUIModel>} models
     * @return {!Array.<!WebInspector.MediaQueryInspector.MediaQueryUIModel>}
     */
    _squashAdjacentEqual: function(models)
    {
        var filtered = [];
        for (var i = 0; i < models.length; ++i) {
            var last = filtered.peekLast();
            if (!last || !last.equals(models[i]))
                filtered.push(models[i]);
        }
        return filtered;
    },

    /**
     * @param {!Array.<!WebInspector.CSSMedia>} cssMedias
     */
    _rebuildMediaQueries: function(cssMedias)
    {
        var queryModels = [];
        for (var i = 0; i < cssMedias.length; ++i) {
            var cssMedia = cssMedias[i];
            if (!cssMedia.mediaList)
                continue;
            for (var j = 0; j < cssMedia.mediaList.length; ++j) {
                var mediaQuery = cssMedia.mediaList[j];
                var queryModel = WebInspector.MediaQueryInspector.MediaQueryUIModel.createFromMediaQuery(cssMedia, mediaQuery);
                if (queryModel && queryModel.rawLocation())
                    queryModels.push(queryModel);
            }
        }
        queryModels.sort(compareModels);
        queryModels = this._squashAdjacentEqual(queryModels);

        var allEqual = this._cachedQueryModels && this._cachedQueryModels.length == queryModels.length;
        for (var i = 0; allEqual && i < queryModels.length; ++i)
            allEqual = allEqual && this._cachedQueryModels[i].equals(queryModels[i]);
        if (allEqual)
            return;
        this._cachedQueryModels = queryModels;
        this._renderMediaQueries();

        /**
         * @param {!WebInspector.MediaQueryInspector.MediaQueryUIModel} model1
         * @param {!WebInspector.MediaQueryInspector.MediaQueryUIModel} model2
         * @return {number}
         */
        function compareModels(model1, model2)
        {
            return model1.compareTo(model2);
        }
    },

    _renderMediaQueries: function()
    {
        if (!this._cachedQueryModels)
            return;

        var markers = [];
        var lastMarker = null;
        for (var i = 0; i < this._cachedQueryModels.length; ++i) {
            var model = this._cachedQueryModels[i];
            if (lastMarker && lastMarker.model.dimensionsEqual(model)) {
                lastMarker.locations.push(model.rawLocation());
                lastMarker.active = lastMarker.active || model.active();
            } else {
                lastMarker = {
                    active: model.active(),
                    model: model,
                    locations: [ model.rawLocation() ]
                };
                markers.push(lastMarker);
            }
        }

        if (markers.length !== this._lastReportedCount) {
            this._lastReportedCount = markers.length;
            this.dispatchEventToListeners(WebInspector.MediaQueryInspector.Events.CountUpdated, markers.length);
        }

        if (!this.isShowing())
            return;

        var oldChildrenCount = this.element.children.length;
        var scrollTop = this.element.scrollTop;
        this.element.removeChildren();

        var container = null;
        for (var i = 0; i < markers.length; ++i) {
            if (!i || markers[i].model.section() !== markers[i - 1].model.section())
                container = this.element.createChild("div", "media-inspector-marker-container");
            var marker = markers[i];
            var bar = this._createElementFromMediaQueryModel(marker.model);
            bar._model = marker.model;
            bar._locations = marker.locations;
            bar.classList.toggle("media-inspector-marker-inactive", !marker.active);
            container.appendChild(bar);
        }
        this.element.scrollTop = scrollTop;
        this.element.classList.toggle("media-inspector-view-empty", !this.element.children.length);
        if (this.element.children.length !== oldChildrenCount)
            this.dispatchEventToListeners(WebInspector.MediaQueryInspector.Events.HeightUpdated);
    },

    /**
     * @return {number}
     */
    _zoomFactor: function()
    {
        return WebInspector.zoomManager.zoomFactor() / this._scale;
    },

    wasShown: function()
    {
        this._renderMediaQueries();
    },

    /**
     * @param {!WebInspector.MediaQueryInspector.MediaQueryUIModel} model
     * @return {!Element}
     */
    _createElementFromMediaQueryModel: function(model)
    {
        var zoomFactor = this._zoomFactor();
        var minWidthValue = model.minWidthExpression() ? model.minWidthExpression().computedLength() : 0;

        const styleClassPerSection = [
            "media-inspector-marker-max-width",
            "media-inspector-marker-min-max-width",
            "media-inspector-marker-min-width"
        ];
        var markerElement = createElementWithClass("div", "media-inspector-marker");
        var leftPixelValue = minWidthValue ? (minWidthValue - this._offset) / zoomFactor : 0;
        markerElement.style.left = leftPixelValue + "px";
        markerElement.classList.add(styleClassPerSection[model.section()]);
        var widthPixelValue = null;
        if (model.maxWidthExpression() && model.minWidthExpression())
            widthPixelValue = (model.maxWidthExpression().computedLength() - minWidthValue) / zoomFactor;
        else if (model.maxWidthExpression())
            widthPixelValue = (model.maxWidthExpression().computedLength() - this._offset) / zoomFactor;
        else
            markerElement.style.right = "0";
        if (typeof widthPixelValue === "number")
            markerElement.style.width = widthPixelValue + "px";

        if (model.minWidthExpression()) {
            var labelClass = model.section() === WebInspector.MediaQueryInspector.Section.MinMax ? "media-inspector-label-right" : "media-inspector-label-left";
            var labelContainer = markerElement.createChild("div", "media-inspector-marker-label-container media-inspector-marker-label-container-left");
            labelContainer.createChild("span", "media-inspector-marker-label " + labelClass).textContent = model.minWidthExpression().value() + model.minWidthExpression().unit();
        }

        if (model.maxWidthExpression()) {
            var labelClass = model.section() === WebInspector.MediaQueryInspector.Section.MinMax ? "media-inspector-label-left" : "media-inspector-label-right";
            var labelContainer = markerElement.createChild("div", "media-inspector-marker-label-container media-inspector-marker-label-container-right");
            labelContainer.createChild("span", "media-inspector-marker-label " + labelClass).textContent = model.maxWidthExpression().value() + model.maxWidthExpression().unit();
        }
        markerElement.title = model.mediaText();

        return markerElement;
    },

    __proto__: WebInspector.View.prototype
};

/**
 * @constructor
 * @param {!WebInspector.CSSMedia} cssMedia
 * @param {?WebInspector.CSSMediaQueryExpression} minWidthExpression
 * @param {?WebInspector.CSSMediaQueryExpression} maxWidthExpression
 * @param {boolean} active
 */
WebInspector.MediaQueryInspector.MediaQueryUIModel = function(cssMedia, minWidthExpression, maxWidthExpression, active)
{
    this._cssMedia = cssMedia;
    this._minWidthExpression = minWidthExpression;
    this._maxWidthExpression = maxWidthExpression;
    this._active = active;
    if (maxWidthExpression && !minWidthExpression)
        this._section = WebInspector.MediaQueryInspector.Section.Max;
    else if (minWidthExpression && maxWidthExpression)
        this._section = WebInspector.MediaQueryInspector.Section.MinMax;
    else
        this._section = WebInspector.MediaQueryInspector.Section.Min;
}

/**
 * @param {!WebInspector.CSSMedia} cssMedia
 * @param {!WebInspector.CSSMediaQuery} mediaQuery
 * @return {?WebInspector.MediaQueryInspector.MediaQueryUIModel}
 */
WebInspector.MediaQueryInspector.MediaQueryUIModel.createFromMediaQuery = function(cssMedia, mediaQuery)
{
    var maxWidthExpression = null;
    var maxWidthPixels = Number.MAX_VALUE;
    var minWidthExpression = null;
    var minWidthPixels = Number.MIN_VALUE;
    var expressions = mediaQuery.expressions();
    for (var i = 0; i < expressions.length; ++i) {
        var expression = expressions[i];
        var feature = expression.feature();
        if (feature.indexOf("width") === -1)
            continue;
        var pixels = expression.computedLength();
        if (feature.startsWith("max-") && pixels < maxWidthPixels) {
            maxWidthExpression = expression;
            maxWidthPixels = pixels;
        } else if (feature.startsWith("min-") && pixels > minWidthPixels) {
            minWidthExpression = expression;
            minWidthPixels = pixels;
        }
    }
    if (minWidthPixels > maxWidthPixels || (!maxWidthExpression && !minWidthExpression))
        return null;

    return new WebInspector.MediaQueryInspector.MediaQueryUIModel(cssMedia, minWidthExpression, maxWidthExpression, mediaQuery.active());
}

WebInspector.MediaQueryInspector.MediaQueryUIModel.prototype = {
    /**
     * @param {!WebInspector.MediaQueryInspector.MediaQueryUIModel} other
     * @return {boolean}
     */
    equals: function(other)
    {
        return this.compareTo(other) === 0;
    },

    /**
     * @param {!WebInspector.MediaQueryInspector.MediaQueryUIModel} other
     * @return {boolean}
     */
    dimensionsEqual: function(other)
    {
        return this.section() === other.section()
            && (!this.minWidthExpression() || (this.minWidthExpression().computedLength() === other.minWidthExpression().computedLength()))
            && (!this.maxWidthExpression() || (this.maxWidthExpression().computedLength() === other.maxWidthExpression().computedLength()));
    },

    /**
     * @param {!WebInspector.MediaQueryInspector.MediaQueryUIModel} other
     * @return {number}
     */
    compareTo: function(other)
    {
        if (this.section() !== other.section())
            return this.section() - other.section();
        if (this.dimensionsEqual(other)) {
            var myLocation = this.rawLocation();
            var otherLocation = other.rawLocation();
            if (!myLocation && !otherLocation)
                return this.mediaText().compareTo(other.mediaText());
            if (myLocation && !otherLocation)
                return 1;
            if (!myLocation && otherLocation)
                return -1;
            if (this.active() !== other.active())
                return this.active() ? -1 : 1;
            return myLocation.url.compareTo(otherLocation.url) || myLocation.lineNumber - otherLocation.lineNumber || myLocation.columnNumber - otherLocation.columnNumber;
        }
        if (this.section() === WebInspector.MediaQueryInspector.Section.Max)
            return other.maxWidthExpression().computedLength() - this.maxWidthExpression().computedLength();
        if (this.section() === WebInspector.MediaQueryInspector.Section.Min)
            return this.minWidthExpression().computedLength() - other.minWidthExpression().computedLength();
        return this.minWidthExpression().computedLength() - other.minWidthExpression().computedLength() || other.maxWidthExpression().computedLength() - this.maxWidthExpression().computedLength();
    },

    /**
     * @return {!WebInspector.MediaQueryInspector.Section}
     */
    section: function()
    {
        return this._section;
    },

    /**
     * @return {string}
     */
    mediaText: function()
    {
        return this._cssMedia.text;
    },

    /**
     * @return {?WebInspector.CSSLocation}
     */
    rawLocation: function()
    {
        if (!this._rawLocation)
            this._rawLocation = this._cssMedia.rawLocation();
        return this._rawLocation;
    },

    /**
     * @return {?WebInspector.CSSMediaQueryExpression}
     */
    minWidthExpression: function()
    {
        return this._minWidthExpression;
    },

    /**
     * @return {?WebInspector.CSSMediaQueryExpression}
     */
    maxWidthExpression: function()
    {
        return this._maxWidthExpression;
    },

    /**
     * @return {boolean}
     */
    active: function()
    {
        return this._active;
    }
}
