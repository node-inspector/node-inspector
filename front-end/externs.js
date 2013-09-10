/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// WebKit Web Facing API
var console = {}
/** @param {...*} vararg */
console.warn = function(vararg) {}
/** @param {...*} vararg */
console.assert = function(vararg) {}
/** @param {...*} vararg */
console.error = function(vararg) {}
console.trace = function() {}

/** @type {boolean} */
Event.prototype.isMetaOrCtrlForTest = false;
/** @param {...*} vararg */
Event.prototype.initWebKitWheelEvent = function(vararg) {}
Event.prototype.stopImmediatePropagation = function() {}

/**
 * @constructor
 * @extends {KeyboardEvent}
 * @param {string} eventType
 * @param {Object=} properties
 */
window.KeyboardEvent = function(eventType, properties) {}

/** @param {Element} element */
window.getComputedStyle = function(element) {}
/** @param {*} message */
function postMessage(message) {}

/** @type {*} */
window.testRunner = null;

/**
 * @constructor
 */
function WebKitMutation(callback)
{
    this.type = "";
    /** @type {Node} */ this.target = null;
    /** @type {Array.<Node>} */ this.addedNodes = [];
    /** @type {Array.<Node>} */ this.removedNodes = [];
}

/**
 * @constructor
 * @param {function(Array.<WebKitMutation>)} callback
 */
function WebKitMutationObserver(callback) {}
/** 
 * @param {Node} container
 * @param {Object} options
 */
WebKitMutationObserver.prototype.observe = function(container, options) {}
WebKitMutationObserver.prototype.disconnect = function() {}

/**
 * @param {string} eventName
 * @param {Function} listener
 * @param {boolean=} capturing
 */
function addEventListener(eventName, listener, capturing) {}

/**
 * @param {T} value
 * @param {boolean=} onlyFirst
 * @this {Array.<T>}
 * @template T
 */
Array.prototype.remove = function(value, onlyFirst) {}
/**
 * @return {!Object.<string, boolean>}
 * @this {Array.<*>}
 */
Array.prototype.keySet = function() {}
/**
 * @param {number} index
 * @return {!Array.<T>}
 * @this {Array.<T>}
 * @template T
 */
Array.prototype.rotate = function(index) {}
/**
 * @param {T} object
 * @param {function(T,S):number=} comparator
 * @return {number}
 * @this {Array.<S>}
 * @template T,S
 */
Array.prototype.lowerBound = function(object, comparator) {}
/**
 * @param {T} object
 * @param {function(T,S):number=} comparator
 * @return {number}
 * @this {Array.<S>}
 * @template T,S
 */
Array.prototype.upperBound = function(object, comparator) {}
/**
 * @param {T} value
 * @param {function(T,S):number} comparator
 * @return {number}
 * @this {Array.<S>}
 * @template T,S
 */
Array.prototype.binaryIndexOf = function(value, comparator) {}
/**
 * @param {function(number, number): number} comparator
 * @param {number} leftBound
 * @param {number} rightBound
 * @param {number} k
 * @return {!Array.<number>}
 * @this {Array.<number>}
 */
Array.prototype.sortRange = function(comparator, leftBound, rightBound, k) {}

/**
 * @this {Array.<number>}
 * @param {function(number,number):boolean} comparator
 * @param {number} left
 * @param {number} right
 * @param {number} pivotIndex
 * @return {number}
 */
Array.prototype.partition = function(comparator, left, right, pivotIndex) {}

/**
 * @this {Array.<number>}
 * @param {number} k
 * @param {function(number,number):boolean=} comparator
 * @return {number}
 */
Array.prototype.qselect = function(k, comparator) {}

/**
 * @param {string} field
 * @return {!Array.<T>}
 * @this {Array.<Object.<string,T>>}
 * @template T
 */
Array.prototype.select = function(field) {}

/**
 * @return {T|undefined}
 * @this {Array.<T>}
 * @template T
 */
Array.prototype.peekLast = function() {}

DOMApplicationCache.prototype.UNCACHED = 0;
DOMApplicationCache.prototype.IDLE = 1;
DOMApplicationCache.prototype.CHECKING = 2;
DOMApplicationCache.prototype.DOWNLOADING = 3;
DOMApplicationCache.prototype.UPDATEREADY = 4;
DOMApplicationCache.prototype.OBSOLETE = 5;

// File System API
/**
 * @constructor
 */
function DOMFileSystem() {}

/**
 * @type {DirectoryEntry}
 */
DOMFileSystem.prototype.root = null;

/** @type {Node} */
Range.prototype.startContainer;

// Inspector Backend
var InspectorBackend = {}
InspectorBackend.runAfterPendingDispatches = function(message) {}

/** @interface */
function InspectorFrontendHostAPI() {}
InspectorFrontendHostAPI.prototype.platform = function() {}
InspectorFrontendHostAPI.prototype.port = function() {}
InspectorFrontendHostAPI.prototype.bringToFront = function() {}
InspectorFrontendHostAPI.prototype.closeWindow = function() {}
InspectorFrontendHostAPI.prototype.requestSetDockSide = function(dockSide) {}
InspectorFrontendHostAPI.prototype.setAttachedWindowHeight = function(height) {}
InspectorFrontendHostAPI.prototype.moveWindowBy = function(x, y) {}
InspectorFrontendHostAPI.prototype.setInjectedScriptForOrigin = function(origin, script) {}
InspectorFrontendHostAPI.prototype.loaded = function() {}
InspectorFrontendHostAPI.prototype.localizedStringsURL = function() {}
InspectorFrontendHostAPI.prototype.inspectedURLChanged = function(url) {}
InspectorFrontendHostAPI.prototype.documentCopy = function(event) {}
InspectorFrontendHostAPI.prototype.copyText = function(text) {}
InspectorFrontendHostAPI.prototype.openInNewTab = function(url) {}
InspectorFrontendHostAPI.prototype.canSave = function() {}
InspectorFrontendHostAPI.prototype.save = function(url, content, forceSaveAs) {}
InspectorFrontendHostAPI.prototype.close = function(url) {}
InspectorFrontendHostAPI.prototype.append = function(url, content) {}
InspectorFrontendHostAPI.prototype.sendMessageToBackend = function(message) {}
InspectorFrontendHostAPI.prototype.sendMessageToEmbedder = function(message) {}
InspectorFrontendHostAPI.prototype.recordActionTaken = function(actionCode) {}
InspectorFrontendHostAPI.prototype.recordPanelShown = function(panelCode) {}
InspectorFrontendHostAPI.prototype.recordSettingChanged = function(settingCode) {}
InspectorFrontendHostAPI.prototype.loadResourceSynchronously = function(url) {}
InspectorFrontendHostAPI.prototype.supportsFileSystems = function() {}
InspectorFrontendHostAPI.prototype.requestFileSystems = function() {}
InspectorFrontendHostAPI.prototype.addFileSystem = function() {}
InspectorFrontendHostAPI.prototype.removeFileSystem = function(fileSystemPath) {}
InspectorFrontendHostAPI.prototype.isolatedFileSystem = function(fileSystemId, registeredName) {}
InspectorFrontendHostAPI.prototype.indexPath = function(requestId, fileSystemPath) {}
InspectorFrontendHostAPI.prototype.stopIndexing = function(requestId) {}
InspectorFrontendHostAPI.prototype.searchInPath = function(requestId, fileSystemPath, query) {}
InspectorFrontendHostAPI.prototype.setZoomFactor = function(zoom) {}
/** @type {InspectorFrontendHostAPI} */
var InspectorFrontendHost;

/** @constructor */
function SourceMapV3()
{
    /** @type {number} */ this.version;
    /** @type {string} */ this.file;
    /** @type {Array.<string>} */ this.sources;
    /** @type {Array.<SourceMapV3.Section>} */ this.sections;
    /** @type {string} */ this.mappings;
    /** @type {string} */ this.sourceRoot;
}

/** @constructor */
SourceMapV3.Section = function()
{
    /** @type {SourceMapV3} */ this.map;
    /** @type {SourceMapV3.Offset} */ this.offset;
}

/** @constructor */
SourceMapV3.Offset = function()
{
    /** @type {number} */ this.line;
    /** @type {number} */ this.column;
}

// FIXME: remove everything below.
var WebInspector = {}

WebInspector.queryParamsObject = {}
WebInspector.toggleSearchingForNode = function() {}
WebInspector.panels = {};

/**
 * @param {Element} element
 * @param {function()=} onclose
 */
WebInspector.showViewInDrawer = function(element, view, onclose) {}

WebInspector.closeViewInDrawer = function() {}

/**
 * @param {string=} messageLevel
 * @param {boolean=} showConsole
 */
WebInspector.log = function(message, messageLevel, showConsole) {}

WebInspector.showErrorMessage = function(error) {}

WebInspector.addMainEventListeners = function(doc) {}

WebInspector.openResource = function(url, external) {}

WebInspector.showConsole = function() {}

/**
 * @param {string} expression
 * @param {boolean=} showResultOnly
 */
WebInspector.evaluateInConsole = function(expression, showResultOnly) {}

WebInspector.queryParamsObject = {}

/**
 * @param {Element} element
 */
WebInspector.showAnchorLocation = function(element) {}

WebInspector.Events = {
    InspectorLoaded: "InspectorLoaded",
    InspectorClosing: "InspectorClosing"
}

/** @type {WebInspector.SettingsController} */
WebInspector.settingsController;

/** Extensions API */

/** @constructor */
function AuditCategory() {}
/** @constructor */
function AuditResult() {}
/** @constructor */
function EventSink() {}
/** @constructor */
function ExtensionSidebarPane() {}
/** @constructor */
function Panel() {}
/** @constructor */
function PanelWithSidebar() {}
/** @constructor */
function Request() {}
/** @constructor */
function Resource() {}
/** @constructor */
function Timeline() {}

var extensionServer;

/** @type {string} */
Location.prototype.origin = "";

/**
 * @constructor
 */
function ExtensionDescriptor() {
    this.startPage = "";
    this.name = "";
}

/**
 * @constructor
 */
function ExtensionReloadOptions() {
    this.ignoreCache = false;
    this.injectedScript = "";
    this.preprocessingScript = "";
    this.userAgent = "";
}

WebInspector.showPanel = function(panel)
{
}

/**
 * @param {ExtensionDescriptor} extensionInfo
 * @return {string}
 */
function buildPlatformExtensionAPI(extensionInfo) {}

/**
 * @type {string} 
 */
WebInspector.inspectedPageDomain;

WebInspector.SourceJavaScriptTokenizer = {}
WebInspector.SourceJavaScriptTokenizer.Keywords = {}

var InspectorTest = {}

/* jsdifflib API */
var difflib = {};
difflib.stringAsLines = function(text) { return []; }
/** @constructor */
difflib.SequenceMatcher = function(baseText, newText) { }
difflib.SequenceMatcher.prototype.get_opcodes = function() { return []; }

/** @constructor */
var CodeMirror = function() { }
CodeMirror.on = function(obj, type, handler) { }
CodeMirror.prototype = {
    addKeyMap: function(map) { },
    addLineClass: function(handle, where, cls) { },
    addLineWidget: function(handle, node, options) { },
    /**
     * @param {string|Object} spec
     * @param {Object=} options
     */
    addOverlay: function(spec, options) { },
    addWidget: function(pos, node, scroll, vert, horiz) { },
    charCoords: function(pos, mode) { },
    clearGutter: function(gutterID) { },
    clearHistory: function() { },
    clipPos: function(pos) { },
    coordsChar: function(coords, mode) { },
    cursorCoords: function(start, mode) { },
    defaultCharWidth: function() { },
    defaultTextHeight: function() { },
    deleteH: function(dir, unit) { },
    eachLine: function(from, to, op) { },
    execCommand: function(cmd) { },
    extendSelection: function(from, to) { },
    findMarksAt: function(pos) { },
    findMatchingBracket: function() { },
    findPosH: function(from, amount, unit, visually) { },
    findPosV: function(from, amount, unit, goalColumn) { },
    firstLine: function() { },
    focus: function() { },
    getAllMarks: function() { },
    /** @param {string=} start */
    getCursor: function(start) { },
    getDoc: function() { },
    getGutterElement: function() { },
    getHistory: function() { },
    getInputField: function(){ },
    getLine: function(line) { },
    /**
     * @return {{wrapClass: string}}
     */
    getLineHandle: function(line) { },
    getLineNumber: function(line) { },
    getMode: function() { },
    getOption: function(option) { },
    getRange: function(from, to, lineSep) { },
    /**
     * @return {{left: number, top: number, width: number, height: number, clientWidth: number, clientHeight: number}}
     */
    getScrollInfo: function() { },
    getScrollerElement: function() { },
    getSelection: function() { },
    getStateAfter: function(line) { },
    getTokenAt: function(pos) { },
    getValue: function(lineSep) { },
    getViewport: function() { },
    getWrapperElement: function() { },
    hasFocus: function() { },
    historySize: function() { },
    indentLine: function(n, dir, aggressive) { },
    indentSelection: function(how) { },
    indexFromPos: function(coords) { },
    isClean: function() { },
    iterLinkedDocs: function(f) { },
    lastLine: function() { },
    lineCount: function() { },
    lineInfo: function(line) { },
    /**
     * @param {number} height
     * @param {string=} mode
     */
    lineAtHeight: function(height, mode) { },
    linkedDoc: function(options) { },
    markClean: function() { },
    markText: function(from, to, options) { },
    moveH: function(dir, unit) { },
    moveV: function(dir, unit) { },
    off: function(type, f) { },
    on: function(type, f) { },
    operation: function(f) { },
    posFromIndex: function(off) { },
    redo: function() { },
    refresh: function() { },
    removeKeyMap: function(map) { },
    removeLine: function(line) { },
    removeLineClass: function(handle, where, cls) { },
    removeLineWidget: function(widget) { },
    removeOverlay: function(spec) { },
    replaceRange: function(code, from, to, origin) { },
    replaceSelection: function(code, collapse, origin) { },
    scrollIntoView: function(pos, margin) { },
    scrollTo: function(x, y) { },
    setBookmark: function(pos, options) { },
    setCursor: function(line, ch, extend) { },
    setExtending: function(val) { },
    setGutterMarker: function(line, gutterID, value) { },
    setHistory: function(histData) { },
    setLine: function(line, text) { },
    setOption: function(option, value) { },
    setSelection: function(anchor, head) { },
    setSize: function(width, height) { },
    setValue: function(code) { },
    somethingSelected: function() { },
    swapDoc: function(doc) { },
    undo: function() { },
    unlinkDoc: function(other) { }
}
/** @type {number} */
CodeMirror.prototype.lineCount;
CodeMirror.Pass;
CodeMirror.showHint = function(codeMirror, hintintFunction) { };
CodeMirror.commands = {};
CodeMirror.modes = {};
CodeMirror.mimeModes = {};
CodeMirror.getMode = function(options, spec) { };
CodeMirror.overlayMode = function(mode1, mode2, squashSpans) { };
CodeMirror.defineMode = function(modeName, modeConstructor) { };
CodeMirror.startState = function(mode) { };

/** @constructor */
CodeMirror.Pos = function(line, ch) { }
/** type {number} */
CodeMirror.Pos.prototype.line;
/** type {number} */
CodeMirror.Pos.prototype.ch;

/** @constructor */
CodeMirror.StringStream = function(line)
{
    this.pos = 0;
    this.start = 0;
}
CodeMirror.StringStream.prototype = {
    backUp: function (n) { },
    column: function () { },
    current: function () { },
    eat: function (match) { },
    eatSpace: function () { },
    eatWhile: function (match) { },
    eol: function () { },
    indentation: function () { },
    /**
     * @param {RegExp|string} pattern
     * @param {boolean=} consume
     * @param {boolean=} caseInsensitive
     */
    match: function (pattern, consume, caseInsensitive) { },
    next: function () { },
    peek: function () { },
    skipTo: function (ch) { },
    skipToEnd: function () { },
    sol: function () { }
}

/** @type {Object.<string, Object.<string, string>>} */
CodeMirror.keyMap;

WebInspector.suggestReload = function() { }
WebInspector.reload = function() { }

WebInspector.settings.continuousPainting = /** type {WebInspector.Setting} */ { }
WebInspector.settings.showDebugBorders = /** type {WebInspector.Setting} */ { }
WebInspector.settings.showScrollBottleneckRects = /** type {WebInspector.Setting} */ { }
WebInspector.settings.forceCompositingMode = /** type {WebInspector.Setting} */ { }
WebInspector.settings.showFPSCounter = /** type {WebInspector.Setting} */ { }
WebInspector.settings.showPaintRects = /** type {WebInspector.Setting} */ { }

/** @type {boolean} */
window.dispatchStandaloneTestRunnerMessages;
