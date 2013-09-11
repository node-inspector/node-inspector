/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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

WebInspector.CodeMirrorUtils = {
    /**
     * @param {string} mimeType
     * @return {function(string, function(string, string, number, number))}
     */
    createTokenizer: function(mimeType)
    {
        var mode = CodeMirror.getMode({indentUnit: 2}, mimeType);
        var state = CodeMirror.startState(mode);
        function tokenize(line, callback)
        {
            var stream = new CodeMirror.StringStream(line);
            while (!stream.eol()) {
                var style = mode.token(stream, state);
                var value = stream.current();
                callback(value, style, stream.start, stream.start + value.length);
                stream.start = stream.pos;
            }
        }
        return tokenize;
    },

    /**
     * @param {string} tokenType
     */
    convertTokenType: function(tokenType)
    {
        if (tokenType.startsWith("js-variable") || tokenType.startsWith("js-property") || tokenType === "js-def")
            return "javascript-ident";
        if (tokenType === "js-string-2")
            return "javascript-regexp";
        if (tokenType === "js-number" || tokenType === "js-comment" || tokenType === "js-string" || tokenType === "js-keyword")
            return "javascript-" + tokenType.substring("js-".length);
        return null;
    },

    /**
     * @param {string} modeName
     * @param {string} tokenPrefix
     */
    overrideModeWithPrefixedTokens: function(modeName, tokenPrefix)
    {
        var oldModeName = modeName + "-old";
        if (CodeMirror.modes[oldModeName])
            return;

        CodeMirror.defineMode(oldModeName, CodeMirror.modes[modeName]);
        CodeMirror.defineMode(modeName, modeConstructor);

        function modeConstructor(config, parserConfig)
        {
            var innerConfig = {};
            for (var i in parserConfig)
                innerConfig[i] = parserConfig[i];
            innerConfig.name = oldModeName;
            var codeMirrorMode = CodeMirror.getMode(config, innerConfig);
            codeMirrorMode.name = modeName;
            codeMirrorMode.token = tokenOverride.bind(this, codeMirrorMode.token);
            return codeMirrorMode;
        }

        function tokenOverride(superToken, stream, state)
        {
            var token = superToken(stream, state);
            return token ? tokenPrefix + token : token;
        }
    }
}

WebInspector.CodeMirrorUtils.overrideModeWithPrefixedTokens("css-base", "css-");
WebInspector.CodeMirrorUtils.overrideModeWithPrefixedTokens("javascript", "js-");
WebInspector.CodeMirrorUtils.overrideModeWithPrefixedTokens("xml", "xml-");
