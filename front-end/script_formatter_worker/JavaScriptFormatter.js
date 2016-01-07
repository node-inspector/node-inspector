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

/**
 * @constructor
 * @param {string} content
 * @param {!FormatterWorker.JavaScriptFormattedContentBuilder} builder
 */
FormatterWorker.JavaScriptFormatter = function(content, builder)
{
    this._content = content;
    this._builder = builder;
    this._tokenizer = new FormatterWorker.AcornTokenizer(this._content);
}

FormatterWorker.JavaScriptFormatter.prototype = {
    format: function()
    {
        var ast = acorn.parse(this._content, { ranges: false, ecmaVersion: 6 });
        var walker = new FormatterWorker.ESTreeWalker(this._beforeVisit.bind(this), this._afterVisit.bind(this));
        walker.walk(ast);
    },

    /**
     * @param {?Acorn.TokenOrComment} token
     * @param {string} format
     */
    _push: function(token, format)
    {
        for (var i = 0; i < format.length; ++i) {
            if (format[i] === "s")
                this._builder.addSpace();
            else if (format[i] === "n")
                this._builder.addNewLine();
            else if (format[i] === ">")
                this._builder.increaseNestingLevel();
            else if (format[i] === "<")
                this._builder.decreaseNestingLevel();
            else if (format[i] === "t")
                this._builder.addToken(this._content.substring(token.start, token.end), token.start, this._tokenizer.tokenLineStart(), this._tokenizer.tokenLineEnd());
        }
    },

    /**
     * @param {!ESTree.Node} node
     */
    _beforeVisit: function(node)
    {
        if (!node.parent)
            return;
        while (this._tokenizer.peekToken() && this._tokenizer.peekToken().start < node.start) {
            var token = /** @type {!Acorn.TokenOrComment} */(this._tokenizer.nextToken());
            var format = this._formatToken(node.parent, token);
            this._push(token, format);
        }
    },

    /**
     * @param {!ESTree.Node} node
     */
    _afterVisit: function(node)
    {
        while (this._tokenizer.peekToken() && this._tokenizer.peekToken().start < node.end) {
            var token = /** @type {!Acorn.TokenOrComment} */(this._tokenizer.nextToken());
            var format = this._formatToken(node, token);
            this._push(token, format);
        }
        this._push(null, this._finishNode(node));
    },

    /**
     * @param {!ESTree.Node} node
     * @return {boolean}
     */
    _inForLoopHeader: function(node)
    {
        var parent = node.parent;
        if (!parent)
            return false;
        if (parent.type === "ForStatement")
            return node === parent.init || node === parent.test || node === parent.update;
        if (parent.type === "ForInStatement" || parent.type === "ForOfStatement")
            return node === parent.left || parent.right;
        return false;
    },

    /**
     * @param {!ESTree.Node} node
     * @param {!Acorn.TokenOrComment} token
     * @return {string}
     */
    _formatToken: function(node, token)
    {
        var AT = FormatterWorker.AcornTokenizer;
        if (AT.lineComment(token))
            return "tn";
        if (AT.blockComment(token))
            return "t";
        if (node.type === "ContinueStatement" || node.type === "BreakStatement") {
            return node.label && AT.keyword(token) ? "ts" : "t";
        } else if (node.type === "Identifier") {
            return "t";
        } else if (node.type === "ReturnStatement") {
            if (AT.punctuator(token, ";"))
                return "t";
            return node.argument ? "ts" : "t";
        } else if (node.type === "Property") {
            if (AT.punctuator(token, ":"))
                return "ts";
            return "t";
        } else if (node.type === "ArrayExpression") {
            if (AT.punctuator(token,  ","))
                return "ts";
            return "t";
        } else if (node.type === "LabeledStatement") {
            if (AT.punctuator(token,  ":"))
                return "ts";
        } else if (node.type === "LogicalExpression" || node.type === "AssignmentExpression" || node.type === "BinaryExpression") {
            if (AT.punctuator(token) && !AT.punctuator(token, "()"))
                return "sts";
        } else if (node.type === "ConditionalExpression") {
            if (AT.punctuator(token, "?:"))
                return "sts";
        } else if (node.type === "VariableDeclarator") {
            if (AT.punctuator(token,  "="))
                return "sts";
        } else if (node.type === "FunctionDeclaration") {
            if (AT.punctuator(token, ",)"))
                return "ts";
        } else if (node.type === "FunctionExpression") {
            if (AT.punctuator(token, ",)"))
                return "ts";
            if (AT.keyword(token, "function"))
                return node.id ? "ts" : "t";
        } else if (node.type === "WithStatement") {
            if (AT.punctuator(token, ")"))
                return node.body && node.body.type === "BlockStatement" ? "ts" : "tn>";
        } else if (node.type === "SwitchStatement") {
            if (AT.punctuator(token, "{"))
                return "tn>";
            if (AT.punctuator(token, "}"))
                return "n<tn";
            if (AT.punctuator(token, ")"))
                return "ts";
        } else if (node.type === "SwitchCase") {
            if (AT.keyword(token, "case"))
                return "n<ts";
            if (AT.keyword(token, "default"))
                return "n<t";
            if (AT.punctuator(token, ":"))
                return "tn>";
        } else if (node.type === "VariableDeclaration") {
            if (AT.punctuator(token, ",")) {
                var allVariablesInitialized = true;
                var declarations = /** @type {!Array.<!ESTree.Node>} */(node.declarations);
                for (var i = 0; i < declarations.length; ++i)
                    allVariablesInitialized = allVariablesInitialized && !!declarations[i].init;
                return !this._inForLoopHeader(node) && allVariablesInitialized ? "nssts" : "ts";
            }
        } else if (node.type === "BlockStatement") {
            if (AT.punctuator(token, "{"))
                return node.body.length ? "tn>" : "t";
            if (AT.punctuator(token, "}"))
                return node.body.length ? "n<t" : "t";
        } else if (node.type === "CatchClause") {
            if (AT.punctuator(token, ")"))
                return "ts";
        } else if (node.type === "ObjectExpression") {
            if (!node.properties.length)
                return "t";
            if (AT.punctuator(token, "{"))
                return "tn>";
            if (AT.punctuator(token, "}"))
                return "n<t";
            if (AT.punctuator(token, ","))
                return "tn";
        } else if (node.type === "IfStatement") {
            if (AT.punctuator(token, ")"))
                return node.consequent && node.consequent.type === "BlockStatement" ? "ts" : "tn>";

            if (AT.keyword(token, "else")) {
                var preFormat = node.consequent && node.consequent.type === "BlockStatement" ? "st" : "n<t";
                var postFormat = "n>";
                if (node.alternate && (node.alternate.type === "BlockStatement" || node.alternate.type === "IfStatement"))
                    postFormat = "s";
                return preFormat + postFormat;
            }
        } else if (node.type === "CallExpression") {
            if (AT.punctuator(token, ","))
                return "ts";
        } else if (node.type === "SequenceExpression" && AT.punctuator(token, ",")) {
            return node.parent && node.parent.type === "SwitchCase" ? "ts" : "tn";
        } else if (node.type === "ForStatement" || node.type === "ForOfStatement" || node.type === "ForInStatement") {
            if (AT.punctuator(token, ";"))
                return "ts";
            if (AT.keyword(token, "in") || AT.identifier(token, "of"))
                return "sts";

            if (AT.punctuator(token, ")"))
                return node.body && node.body.type === "BlockStatement" ? "ts" : "tn>";
        } else if (node.type === "WhileStatement") {
            if (AT.punctuator(token, ")"))
                return node.body && node.body.type === "BlockStatement" ? "ts" : "tn>";
        } else if (node.type === "DoWhileStatement") {
            var blockBody = node.body && node.body.type === "BlockStatement";
            if (AT.keyword(token, "do"))
                return blockBody ? "ts" : "tn>";
            if (AT.keyword(token, "while"))
                return blockBody ? "sts" : "n<ts";
        } else if (node.type === "ClassBody") {
            if (AT.punctuator(token, "{"))
                return "stn>";
            if (AT.punctuator(token, "}"))
                return "<ntn";
            return "t";
        } else if (node.type === "YieldExpression") {
            return "t";
        } else if (node.type === "Super") {
            return "t";
        }
        return AT.keyword(token) && !AT.keyword(token, "this") ? "ts" : "t";
    },

    /**
     * @param {!ESTree.Node} node
     * @return {string}
     */
    _finishNode: function(node)
    {
        if (node.type === "WithStatement") {
            if (node.body && node.body.type !== "BlockStatement")
                return "n<";
        } else if (node.type === "VariableDeclaration") {
            if (!this._inForLoopHeader(node))
                return "n";
        } else if (node.type === "ForStatement" || node.type === "ForOfStatement" || node.type === "ForInStatement") {
            if (node.body && node.body.type !== "BlockStatement")
                return "n<";
        } else if (node.type === "BlockStatement") {
            if (node.parent && node.parent.type === "IfStatement" && node.parent.alternate && node.parent.consequent === node)
                return "";
            if (node.parent && node.parent.type === "FunctionExpression" && node.parent.parent && node.parent.parent.type === "Property")
                return "";
            if (node.parent && node.parent.type === "FunctionExpression" && node.parent.parent && node.parent.parent.type === "CallExpression")
                return "";
            if (node.parent && node.parent.type === "DoWhileStatement")
                return "";
            if (node.parent && node.parent.type === "TryStatement" && node.parent.block == node)
                return "s";
            if (node.parent && node.parent.type === "CatchClause" && node.parent.parent.finalizer)
                return "s";
            return "n";
        } else if (node.type === "WhileStatement") {
            if (node.body && node.body.type !== "BlockStatement")
                return "n<";
        } else if (node.type === "IfStatement") {
            if (node.alternate) {
                if (node.alternate.type !== "BlockStatement" && node.alternate.type !== "IfStatement")
                    return "<";
            } else if (node.consequent) {
                if (node.consequent.type !== "BlockStatement")
                    return "<";
            }
        } else if (node.type === "BreakStatement" || node.type === "ThrowStatement" || node.type === "ReturnStatement" || node.type === "ExpressionStatement") {
            return "n";
        }
        return "";
    }
}

/**
 * @constructor
 * @param {string} content
 * @param {!{original: !Array.<number>, formatted: !Array.<number>}} mapping
 * @param {number} originalOffset
 * @param {number} formattedOffset
 * @param {string} indentString
 */
FormatterWorker.JavaScriptFormattedContentBuilder = function(content, mapping, originalOffset, formattedOffset, indentString)
{
    this._originalContent = content;
    this._originalOffset = originalOffset;
    this._lastOriginalPosition = 0;

    this._formattedContent = [];
    this._formattedContentLength = 0;
    this._formattedOffset = formattedOffset;
    this._lastFormattedPosition = 0;

    this._mapping = mapping;

    this._lineNumber = 0;
    this._nestingLevel = 0;
    this._indentString = indentString;
    this._cachedIndents = {};
}

FormatterWorker.JavaScriptFormattedContentBuilder.prototype = {
    /**
     * @param {string} token
     * @param {number} startPosition
     * @param {number} startLine
     * @param {number} endLine
     */
    addToken: function(token, startPosition, startLine, endLine)
    {
        while (this._lineNumber < startLine) {
            this._addText("\n");
            this._addIndent();
            this._needNewLine = false;
            this._lineNumber += 1;
        }

        if (this._needNewLine) {
            this._addText("\n");
            this._addIndent();
            this._needNewLine = false;
        }

        var last = this._formattedContent.peekLast();
        if (last && /\w/.test(last[last.length - 1]) && /\w/.test(token))
            this.addSpace();

        this._addMappingIfNeeded(startPosition);
        this._addText(token);
        this._lineNumber = endLine;
    },

    addSpace: function()
    {
        if (this._needNewLine) {
            this._addText("\n");
            this._addIndent();
            this._needNewLine = false;
        }
        this._addText(" ");
    },

    addNewLine: function()
    {
        this._needNewLine = true;
    },

    increaseNestingLevel: function()
    {
        this._nestingLevel += 1;
    },

    decreaseNestingLevel: function()
    {
        this._nestingLevel -= 1;
    },

    /**
     * @return {string}
     */
    content: function()
    {
        return this._formattedContent.join("") + (this._needNewLine ? "\n" : "");
    },

    _addIndent: function()
    {
        if (this._cachedIndents[this._nestingLevel]) {
            this._addText(this._cachedIndents[this._nestingLevel]);
            return;
        }

        var fullIndent = "";
        for (var i = 0; i < this._nestingLevel; ++i)
            fullIndent += this._indentString;
        this._addText(fullIndent);

        // Cache a maximum of 20 nesting level indents.
        if (this._nestingLevel <= 20)
            this._cachedIndents[this._nestingLevel] = fullIndent;
    },

    /**
     * @param {string} text
     */
    _addText: function(text)
    {
        this._formattedContent.push(text);
        this._formattedContentLength += text.length;
    },

    /**
     * @param {number} originalPosition
     */
    _addMappingIfNeeded: function(originalPosition)
    {
        if (originalPosition - this._lastOriginalPosition === this._formattedContentLength - this._lastFormattedPosition)
            return;
        this._mapping.original.push(this._originalOffset + originalPosition);
        this._lastOriginalPosition = originalPosition;
        this._mapping.formatted.push(this._formattedOffset + this._formattedContentLength);
        this._lastFormattedPosition = this._formattedContentLength;
    }
}
