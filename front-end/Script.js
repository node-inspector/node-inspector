/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

WebInspector.Script = function(sourceID, sourceURL, source, startingLine, errorLine, errorMessage, worldType)
{
    this.sourceID = sourceID;
    this.sourceURL = sourceURL;
    this.source = source;
    this.startingLine = startingLine;
    this.errorLine = errorLine;
    this.errorMessage = errorMessage;
    this.worldType = worldType;

    // if no URL, look for "//@ sourceURL=" decorator
    // note that this sourceURL comment decorator is behavior that FireBug added
    // in it's 1.1 release as noted in the release notes:
    // http://fbug.googlecode.com/svn/branches/firebug1.1/docs/ReleaseNotes_1.1.txt
    if (!sourceURL) {
        // use of [ \t] rather than \s is to prevent \n from matching
        var pattern = /^\s*\/\/[ \t]*@[ \t]*sourceURL[ \t]*=[ \t]*(\S+).*$/m;
        var match = pattern.exec(source);

        if (match)
            this.sourceURL = match[1];
    }
}

WebInspector.Script.WorldType = {
    MAIN_WORLD: 0,
    EXTENSIONS_WORLD: 1
}

WebInspector.Script.WorldType = {
    MAIN_WORLD: 0,
    EXTENSIONS_WORLD: 1
}

WebInspector.Script.prototype = {
    get linesCount()
    {
        if (!this.source)
            return 0;
        this._linesCount = 0;
        var lastIndex = this.source.indexOf("\n");
        while (lastIndex !== -1) {
            lastIndex = this.source.indexOf("\n", lastIndex + 1)
            this._linesCount++;
        }
    }
}
