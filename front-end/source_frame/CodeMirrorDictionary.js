// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!CodeMirror} codeMirror
 * @param {string=} additionalWordChars
 */
WebInspector.CodeMirrorDictionary = function(codeMirror, additionalWordChars)
{
    this._codeMirror = codeMirror;
    this._additionalWordChars = new Set(/** @type {!Iterable} */ (additionalWordChars));
    this._dictionary = new WebInspector.TextDictionary();
    this._addText(this._codeMirror.getValue());

    this._changes = this._changes.bind(this);
    this._beforeChange = this._beforeChange.bind(this);
    this._codeMirror.on("beforeChange", this._beforeChange);
    this._codeMirror.on("changes", this._changes);
}

WebInspector.CodeMirrorDictionary.prototype = {
    /**
     * @param {!CodeMirror} codeMirror
     * @param {!CodeMirror.BeforeChangeObject} changeObject
     */
    _beforeChange: function(codeMirror, changeObject)
    {
        this._updatedLines = this._updatedLines || {};
        for (var i = changeObject.from.line; i <= changeObject.to.line; ++i)
            this._updatedLines[i] = this._codeMirror.getLine(i);
    },

    /**
     * @param {!CodeMirror} codeMirror
     * @param {!Array.<!CodeMirror.ChangeObject>} changes
     */
    _changes: function(codeMirror, changes)
    {
        if (!changes.length || !this._updatedLines)
            return;

        for (var lineNumber in this._updatedLines)
            this._removeText(this._updatedLines[lineNumber]);
        delete this._updatedLines;

        var linesToUpdate = {};
        for (var changeIndex = 0; changeIndex < changes.length; ++changeIndex) {
            var changeObject = changes[changeIndex];
            var editInfo = WebInspector.CodeMirrorUtils.changeObjectToEditOperation(changeObject);
            for (var i = editInfo.newRange.startLine; i <= editInfo.newRange.endLine; ++i)
                linesToUpdate[i] = this._codeMirror.getLine(i);
        }
        for (var lineNumber in linesToUpdate)
            this._addText(linesToUpdate[lineNumber]);
    },

    /**
     * @param {string} word
     * @return {boolean}
     */
    _validWord: function(word)
    {
        return !!word.length && (word[0] < '0' || word[0] > '9');
    },

    /**
     * @param {string} text
     */
    _addText: function(text)
    {
        WebInspector.TextUtils.textToWords(text, this.isWordChar.bind(this), addWord.bind(this));

        /**
         * @param {string} word
         * @this {WebInspector.CodeMirrorDictionary}
         */
        function addWord(word)
        {
            if (this._validWord(word))
                this._dictionary.addWord(word);
        }
    },

    /**
     * @param {string} text
     */
    _removeText: function(text)
    {
        WebInspector.TextUtils.textToWords(text, this.isWordChar.bind(this), removeWord.bind(this));

        /**
         * @param {string} word
         * @this {WebInspector.CodeMirrorDictionary}
         */
        function removeWord(word)
        {
            if (this._validWord(word))
                this._dictionary.removeWord(word);
        }
    },

    /**
     * @param {string} char
     * @return {boolean}
     */
    isWordChar: function(char)
    {
        return WebInspector.TextUtils.isWordChar(char) || this._additionalWordChars.has(char);
    },

    /**
     * @param {string} prefix
     * @return {!Array.<string>}
     */
    wordsWithPrefix: function(prefix)
    {
        return this._dictionary.wordsWithPrefix(prefix);
    },

    /**
     * @param {string} word
     * @return {boolean}
     */
    hasWord: function(word)
    {
        return this._dictionary.hasWord(word);
    },

    /**
     * @param {string} word
     * @return {number}
     */
    wordCount: function(word)
    {
        return this._dictionary.wordCount(word);
    },

    dispose: function()
    {
        this._codeMirror.off("beforeChange", this._beforeChange);
        this._codeMirror.off("changes", this._changes);
        this._dictionary.reset();
    },
}