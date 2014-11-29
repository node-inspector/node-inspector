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

/**
 * @param {!Object} object
 * @param {!Function} callback
 */
Object.observe = function(object, callback) {}

/** @type {boolean} */
Event.prototype.isMetaOrCtrlForTest;

/**
 * @type {number}
 */
KeyboardEvent.DOM_KEY_LOCATION_NUMPAD;

/**
 * @param {!T} value
 * @param {boolean=} onlyFirst
 * @this {Array.<T>}
 * @template T
 */
Array.prototype.remove = function(value, onlyFirst) {}
/**
 * @param {!Array.<!T>} array
 * @this {Array.<!T>}
 * @template T
 */
Array.prototype.pushAll = function(array) {}
/**
 * @return {!Object.<string, boolean>}
 * @this {Array.<T>}
 * @template T
 */
Array.prototype.keySet = function() {}
/**
 * @param {number} index
 * @return {!Array.<!T>}
 * @this {Array.<T>}
 * @template T
 */
Array.prototype.rotate = function(index) {}
/**
 * @this {Array.<number>}
 */
Array.prototype.sortNumbers = function() {}
/**
 * @param {!T} object
 * @param {function(!T,!S):number=} comparator
 * @return {number}
 * @this {Array.<S>}
 * @template T,S
 */
Array.prototype.lowerBound = function(object, comparator) {}
/**
 * @param {!T} object
 * @param {function(!T,!S):number=} comparator
 * @return {number}
 * @this {Array.<S>}
 * @template T,S
 */
Array.prototype.upperBound = function(object, comparator) {}
/**
 * @param {!T} value
 * @param {function(!T,!S):number} comparator
 * @return {number}
 * @this {Array.<S>}
 * @template T,S
 */
Array.prototype.binaryIndexOf = function(value, comparator) {}
/**
 * @param {function(number, number): number} comparator
 * @param {number} leftBound
 * @param {number} rightBound
 * @param {number} sortWindowLeft
 * @param {number} sortWindowRight
 * @return {!Array.<number>}
 * @this {Array.<number>}
 */
Array.prototype.sortRange = function(comparator, leftBound, rightBound, sortWindowLeft, sortWindowRight) {}

/**
 * @param {function(!T,!T): number=} comparator
 * @return {!Array.<T>}
 * @this {Array.<T>}
 * @template T
 */
Array.prototype.stableSort = function(comparator) {}

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
 * @return {!Array.<!T>}
 * @this {Array.<!Object.<string,T>>}
 * @template T
 */
Array.prototype.select = function(field) {}

/**
 * @return {!T|undefined}
 * @this {Array.<T>}
 * @template T
 */
Array.prototype.peekLast = function() {}

/**
 * @param {!Array.<T>} array
 * @param {function(T,T):number} comparator
 * @return {!Array.<T>}
 * @this {!Array.<T>}
 * @template T
 */
Array.prototype.intersectOrdered = function(array, comparator) {}

/**
 * @param {!Array.<T>} array
 * @param {function(T,T):number} comparator
 * @return {!Array.<T>}
 * @this {!Array.<T>}
 * @template T
 */
Array.prototype.mergeOrdered = function(array, comparator) {}

// File System API
/**
 * @constructor
 */
function DOMFileSystem() {}

/**
 * @type {DirectoryEntry}
 */
DOMFileSystem.prototype.root = null;

var DevToolsHost = {};

/** @typedef {{type:string, id:(number|undefined),
              label:(string|undefined), enabled:(boolean|undefined), checked:(boolean|undefined),
              subItems:(!Array.<!DevToolsHost.ContextMenuDescriptor>|undefined)}} */
DevToolsHost.ContextMenuDescriptor;

/**
 * @return {number}
 */
DevToolsHost.zoomFactor = function() { }

/**
 * @param {string} origin
 * @param {string} script
 */
DevToolsHost.setInjectedScriptForOrigin = function(origin, script) { }

/**
 * @param {string} text
 */
DevToolsHost.copyText = function(text) { }

/**
 * @return {string}
 */
DevToolsHost.platform = function() { }

/**
 * @param {number} x
 * @param {number} y
 * @param {!Array.<!DevToolsHost.ContextMenuDescriptor>} items
 * @param {!Document} document
 */
DevToolsHost.showContextMenuAtPoint = function(x, y, items, document) { }

/**
 * @param {string} message
 */
DevToolsHost.sendMessageToBackend = function(message) { }

/**
 * @param {string} message
 */
DevToolsHost.sendMessageToEmbedder = function(message) { }

/**
 * @return {string}
 */
DevToolsHost.getSelectionBackgroundColor = function() { }

/**
 * @return {string}
 */
DevToolsHost.getSelectionForegroundColor = function() { }

/**
 * @return {boolean}
 */
DevToolsHost.isUnderTest = function() { }

/**
 * @return {boolean}
 */
DevToolsHost.isHostedMode = function() { }

// FIXME: remove everything below.
var FormatterWorker = {}
var WebInspector = {}

WebInspector.panels = {};

WebInspector.reload = function() { }

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

var Adb = {};
/** @typedef {{id: string, adbBrowserChromeVersion: string, compatibleVersion: boolean, adbBrowserName: string, source: string, adbBrowserVersion: string}} */
Adb.Browser;
/** @typedef {{id: string, adbModel: string, adbSerial: string, browsers: !Array.<!Adb.Browser>, adbPortStatus: !Array.<number>, adbConnected: boolean}} */
Adb.Device;

/* jsdifflib API */
var difflib = {};
difflib.stringAsLines = function(text) { return []; }
/** @constructor */
difflib.SequenceMatcher = function(baseText, newText) { }
difflib.SequenceMatcher.prototype.get_opcodes = function() { return []; }

/** @constructor */
var Doc = function() { }
Doc.prototype = {
    /** @type {number} */
    scrollLeft: 0,
    /** @type {number} */
    scrollTop: 0
}

/** @constructor */
var CodeMirror = function(element, config) { }
CodeMirror.on = function(obj, type, handler) { }
CodeMirror.prototype = {
    /** @type {!Doc} */
    doc: null,
    addKeyMap: function(map) { },
    addLineClass: function(handle, where, cls) { },
    /** @param {?Object=} options */
    addLineWidget: function(handle, node, options) { },
    /**
     * @param {string|!Object} spec
     * @param {!Object=} options
     */
    addOverlay: function(spec, options) { },
    addWidget: function(pos, node, scroll, vert, horiz) { },
    charCoords: function(pos, mode) { },
    clearGutter: function(gutterID) { },
    clearHistory: function() { },
    clipPos: function(pos) { },
    /** @param {string=} mode */
    coordsChar: function(coords, mode) { },
    /** @param {string=} mode */
    cursorCoords: function(start, mode) { },
    defaultCharWidth: function() { },
    defaultTextHeight: function() { },
    deleteH: function(dir, unit) { },
    /**
     * @param {*=} to
     * @param {*=} op
     */
    eachLine: function(from, to, op) { },
    execCommand: function(cmd) { },
    extendSelection: function(from, to) { },
    findMarksAt: function(pos) { },
    /**
     * @param {!CodeMirror.Pos} from
     * @param {boolean=} strict
     * @param {Object=} config
     */
    findMatchingBracket: function(from, strict, config) { },
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
     * @return {!{wrapClass: string}}
     */
    getLineHandle: function(line) { },
    getLineNumber: function(line) { },
    getMode: function() { },
    getOption: function(option) { },
    /** @param {*=} lineSep */
    getRange: function(from, to, lineSep) { },
    /**
     * @return {!{left: number, top: number, width: number, height: number, clientWidth: number, clientHeight: number}}
     */
    getScrollInfo: function() { },
    getScrollerElement: function() { },
    getSelection: function() { },
    getSelections: function() { },
    getStateAfter: function(line) { },
    getTokenAt: function(pos) { },
    /** @param {*=} lineSep */
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
    listSelections: function() { },
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
    /** @param {*=} origin */
    replaceRange: function(code, from, to, origin) { },
    /**
     * @param {string} replacement
     * @param {string=} select
     */
    replaceSelection: function(replacement, select) { },
    /**
     * @param {!Array.<string>} textPerSelection
     */
    replaceSelections: function(textPerSelection) { },
    /** @param {*=} margin */
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
    /**
     * @param {number=} primaryIndex
     * @param {?Object=} config
     */
    setSelections: function(selections, primaryIndex, config) { },
    setSize: function(width, height) { },
    setValue: function(code) { },
    somethingSelected: function() { },
    swapDoc: function(doc) { },
    undo: function() { },
    unlinkDoc: function(other) { }
}
/** @type {!{cursorDiv: Element}} */
CodeMirror.prototype.display;
/** @type {!Object} */
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
/** @type {number} */
CodeMirror.Pos.prototype.line;
/** @type {number} */
CodeMirror.Pos.prototype.ch;

/**
 * @param {!CodeMirror.Pos} pos1
 * @param {!CodeMirror.Pos} pos2
 * @return {number}
 */
CodeMirror.cmpPos = function(pos1, pos2) { };

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
     * @param {!RegExp|string} pattern
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

/** @type {Object.<string, !Object.<string, string>>} */
CodeMirror.keyMap;

/** @type {{scrollLeft: number, scrollTop: number}} */
CodeMirror.doc;

/** @type {boolean} */
window.dispatchStandaloneTestRunnerMessages;

// FIXME: Remove once ES6 is supported natively by JS compiler.

/** @typedef {string} */
var symbol;

/**
 * @param {string} description
 * @return {symbol}
 */
function Symbol(description) {}

/**
 * @interface
 * @extends $jscomp.Iterable.<T>
 * @template T
 */
var Iterator = function() { }

Iterator.prototype = {
    /**
     * @return {{done: boolean, value: (T|undefined)}}
     */
    next: function() { },

    // FIXME: This should be removed once transpilation is not required for closure compiler ES6
    $$iterator: function() { }
}

// FIXME: $jscomp.Iterable hack below should be removed once transpilation is not required for closure compiler ES6
/**
 * @constructor
 * @implements $jscomp.Iterable.<!Array.<K|V>>
 * @param {!Array.<!Array.<K|V>>|!Iterator.<!Array.<K|V>>=} iterable
 * @template K, V
 */
var Map = function(iterable) { }

Map.prototype = {
    /**
     * @param {K} key
     * @param {V} value
     */
    set: function(key, value) { },

    /**
     * @param {K} key
     * @return {boolean}
     */
    delete: function(key) { },

    /**
     * @return {!Iterator.<K>}
     */
    keys: function() { },

    /**
     * @return {!Iterator.<V>}
     */
    values: function() { },

    /**
     * @return {!Array.<!Array.<K|V>>}
     */
    entries: function() { },

    /**
     * @param {K} key
     * @return {V}
     */
    get: function(key) { },

    /**
     * @param {K} key
     * @return {boolean}
     */
    has: function(key) { },

    clear: function() { },

    /**
     * @return {number}
     */
    get size() { },

    // FIXME: This should be removed once transpilation is not required for closure compiler ES6
    $$iterator: function() { }
}

// FIXME: $jscomp.Iterable hack below should be removed once transpilation is not required for closure compiler ES6
/**
 * @constructor
 * @implements $jscomp.Iterable.<V>
 * @param {!Array.<V>|!Iterator.<V>=} iterable
 * @template V
 */
var Set = function(iterable) { }

Set.prototype = {
    /**
     * @param {V} value
     */
    add: function(value) { },

    /**
     * @param {V} value
     * @return {boolean}
     */
    delete: function(value) { },

    /**
     * @return {!Iterator.<V>}
     */
    values: function() { },

    /**
     * @param {V} value
     * @return {boolean}
     */
    has: function(value) { },

    clear: function() { },

    /**
     * @return {number}
     */
    get size() { },

    // FIXME: This should be removed once transpilation is not required for closure compiler ES6
    $$iterator: function() { }
}
