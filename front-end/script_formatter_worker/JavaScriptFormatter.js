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
 * @param {!FormatterWorker.JavaScriptTokenizer} tokenizer
 * @param {!FormatterWorker.JavaScriptFormattedContentBuilder} builder
 */
FormatterWorker.JavaScriptFormatter = function(tokenizer, builder)
{
    this._tokenizer = tokenizer;
    this._builder = builder;
    this._token = null;
    this._nextToken = this._tokenizer.next();
}

FormatterWorker.JavaScriptFormatter._identifierRegex = /^[$A-Z_][0-9A-Z_$]*$/i;

FormatterWorker.JavaScriptFormatter.prototype = {
    format: function()
    {
        this._parseSourceElements(FormatterWorker.JavaScriptTokens.EOS);
        this._consume(FormatterWorker.JavaScriptTokens.EOS);
    },

    /**
     * @return {number}
     */
    _peek: function()
    {
        return this._nextToken.token;
    },

    /**
     * @return {number}
     */
    _next: function()
    {
        if (this._token && this._token.token === FormatterWorker.JavaScriptTokens.EOS)
            throw "Unexpected EOS token";

        this._builder.addToken(this._nextToken);
        this._token = this._nextToken;
        this._nextToken = this._tokenizer.next(this._forceRegexp);
        this._forceRegexp = false;
        return this._token.token;
    },

    /**
     * @param {number} token
     */
    _consume: function(token)
    {
        var next = this._next();
        if (next !== token)
            throw "Unexpected token in consume: expected " + token + ", actual " + next;
    },

    /**
     * @param {number} token
     */
    _expect: function(token)
    {
        var next = this._next();
        if (next !== token)
            throw "Unexpected token: expected " + token + ", actual " + next;
    },

    _expectGeneralIdentifier: function()
    {
        var next = this._next();
        if (next !== FormatterWorker.JavaScriptTokens.IDENTIFIER && !FormatterWorker.JavaScriptFormatter._identifierRegex.test(this._token.value))
            throw "Unexpected token: expected javascript identifier, actual " + this._token.value;
    },

    _expectSemicolon: function()
    {
        if (this._peek() === FormatterWorker.JavaScriptTokens.SEMICOLON)
            this._consume(FormatterWorker.JavaScriptTokens.SEMICOLON);
    },

    /**
     * @return {boolean}
     */
    _hasLineTerminatorBeforeNext: function()
    {
        return this._nextToken.nlb;
    },

    /**
     * @param {number} endToken
     */
    _parseSourceElements: function(endToken)
    {
        while (this._peek() !== endToken) {
            this._parseStatement();
            this._builder.addNewLine();
        }
    },

    _parseStatementOrBlock: function()
    {
        if (this._peek() === FormatterWorker.JavaScriptTokens.LBRACE) {
            this._builder.addSpace();
            this._parseBlock();
            return true;
        }

        this._builder.addNewLine();
        this._builder.increaseNestingLevel();
        this._parseStatement();
        this._builder.decreaseNestingLevel();
    },

    _parseStatement: function()
    {
        switch (this._peek()) {
        case FormatterWorker.JavaScriptTokens.LBRACE:
            return this._parseBlock();
        case FormatterWorker.JavaScriptTokens.CONST:
        case FormatterWorker.JavaScriptTokens.VAR:
            return this._parseVariableStatement();
        case FormatterWorker.JavaScriptTokens.SEMICOLON:
            return this._next();
        case FormatterWorker.JavaScriptTokens.IF:
            return this._parseIfStatement();
        case FormatterWorker.JavaScriptTokens.DO:
            return this._parseDoWhileStatement();
        case FormatterWorker.JavaScriptTokens.WHILE:
            return this._parseWhileStatement();
        case FormatterWorker.JavaScriptTokens.FOR:
            return this._parseForStatement();
        case FormatterWorker.JavaScriptTokens.CONTINUE:
            return this._parseContinueStatement();
        case FormatterWorker.JavaScriptTokens.BREAK:
            return this._parseBreakStatement();
        case FormatterWorker.JavaScriptTokens.RETURN:
            return this._parseReturnStatement();
        case FormatterWorker.JavaScriptTokens.WITH:
            return this._parseWithStatement();
        case FormatterWorker.JavaScriptTokens.SWITCH:
            return this._parseSwitchStatement();
        case FormatterWorker.JavaScriptTokens.THROW:
            return this._parseThrowStatement();
        case FormatterWorker.JavaScriptTokens.TRY:
            return this._parseTryStatement();
        case FormatterWorker.JavaScriptTokens.FUNCTION:
            return this._parseFunctionDeclaration();
        case FormatterWorker.JavaScriptTokens.DEBUGGER:
            return this._parseDebuggerStatement();
        default:
            return this._parseExpressionOrLabelledStatement();
        }
    },

    _parseFunctionDeclaration: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.FUNCTION);
        this._builder.addSpace();
        this._expect(FormatterWorker.JavaScriptTokens.IDENTIFIER);
        this._parseFunctionLiteral()
    },

    _parseBlock: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.LBRACE);
        this._builder.addNewLine();
        this._builder.increaseNestingLevel();
        while (this._peek() !== FormatterWorker.JavaScriptTokens.RBRACE) {
            this._parseStatement();
            this._builder.addNewLine();
        }
        this._builder.decreaseNestingLevel();
        this._expect(FormatterWorker.JavaScriptTokens.RBRACE);
    },

    _parseVariableStatement: function()
    {
        this._parseVariableDeclarations();
        this._expectSemicolon();
    },

    _parseVariableDeclarations: function()
    {
        if (this._peek() === FormatterWorker.JavaScriptTokens.VAR)
            this._consume(FormatterWorker.JavaScriptTokens.VAR);
        else
            this._consume(FormatterWorker.JavaScriptTokens.CONST)
        this._builder.addSpace();

        var isFirstVariable = true;
        do {
            if (!isFirstVariable) {
                this._consume(FormatterWorker.JavaScriptTokens.COMMA);
                this._builder.addSpace();
            }
            isFirstVariable = false;
            this._expect(FormatterWorker.JavaScriptTokens.IDENTIFIER);
            if (this._peek() === FormatterWorker.JavaScriptTokens.ASSIGN) {
                this._builder.addSpace();
                this._consume(FormatterWorker.JavaScriptTokens.ASSIGN);
                this._builder.addSpace();
                this._parseAssignmentExpression();
            }
        } while (this._peek() === FormatterWorker.JavaScriptTokens.COMMA);
    },

    _parseExpressionOrLabelledStatement: function()
    {
        this._parseExpression();
        if (this._peek() === FormatterWorker.JavaScriptTokens.COLON) {
            this._expect(FormatterWorker.JavaScriptTokens.COLON);
            this._builder.addSpace();
            this._parseStatement();
        }
        this._expectSemicolon();
    },

    _parseIfStatement: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.IF);
        this._builder.addSpace();
        this._expect(FormatterWorker.JavaScriptTokens.LPAREN);
        this._parseExpression();
        this._expect(FormatterWorker.JavaScriptTokens.RPAREN);

        var isBlock = this._parseStatementOrBlock();
        if (this._peek() === FormatterWorker.JavaScriptTokens.ELSE) {
            if (isBlock)
                this._builder.addSpace();
            else
                this._builder.addNewLine();
            this._next();

            if (this._peek() === FormatterWorker.JavaScriptTokens.IF) {
                this._builder.addSpace();
                this._parseStatement();
            } else
                this._parseStatementOrBlock();
        }
    },

    _parseContinueStatement: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.CONTINUE);
        var token = this._peek();
        if (!this._hasLineTerminatorBeforeNext() && token !== FormatterWorker.JavaScriptTokens.SEMICOLON && token !== FormatterWorker.JavaScriptTokens.RBRACE && token !== FormatterWorker.JavaScriptTokens.EOS) {
            this._builder.addSpace();
            this._expect(FormatterWorker.JavaScriptTokens.IDENTIFIER);
        }
        this._expectSemicolon();
    },

    _parseBreakStatement: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.BREAK);
        var token = this._peek();
        if (!this._hasLineTerminatorBeforeNext() && token !== FormatterWorker.JavaScriptTokens.SEMICOLON && token !== FormatterWorker.JavaScriptTokens.RBRACE && token !== FormatterWorker.JavaScriptTokens.EOS) {
            this._builder.addSpace();
            this._expect(FormatterWorker.JavaScriptTokens.IDENTIFIER);
        }
        this._expectSemicolon();
    },

    _parseReturnStatement: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.RETURN);
        var token = this._peek();
        if (!this._hasLineTerminatorBeforeNext() && token !== FormatterWorker.JavaScriptTokens.SEMICOLON && token !== FormatterWorker.JavaScriptTokens.RBRACE && token !== FormatterWorker.JavaScriptTokens.EOS) {
            this._builder.addSpace();
            this._parseExpression();
        }
        this._expectSemicolon();
    },

    _parseWithStatement: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.WITH);
        this._builder.addSpace();
        this._expect(FormatterWorker.JavaScriptTokens.LPAREN);
        this._parseExpression();
        this._expect(FormatterWorker.JavaScriptTokens.RPAREN);
        this._parseStatementOrBlock();
    },

    _parseCaseClause: function()
    {
        if (this._peek() === FormatterWorker.JavaScriptTokens.CASE) {
            this._expect(FormatterWorker.JavaScriptTokens.CASE);
            this._builder.addSpace();
            this._parseExpression();
        } else
            this._expect(FormatterWorker.JavaScriptTokens.DEFAULT);
        this._expect(FormatterWorker.JavaScriptTokens.COLON);
        this._builder.addNewLine();

        this._builder.increaseNestingLevel();
        while (this._peek() !== FormatterWorker.JavaScriptTokens.CASE && this._peek() !== FormatterWorker.JavaScriptTokens.DEFAULT && this._peek() !== FormatterWorker.JavaScriptTokens.RBRACE) {
            this._parseStatement();
            this._builder.addNewLine();
        }
        this._builder.decreaseNestingLevel();
    },

    _parseSwitchStatement: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.SWITCH);
        this._builder.addSpace();
        this._expect(FormatterWorker.JavaScriptTokens.LPAREN);
        this._parseExpression();
        this._expect(FormatterWorker.JavaScriptTokens.RPAREN);
        this._builder.addSpace();

        this._expect(FormatterWorker.JavaScriptTokens.LBRACE);
        this._builder.addNewLine();
        this._builder.increaseNestingLevel();
        while (this._peek() !== FormatterWorker.JavaScriptTokens.RBRACE)
            this._parseCaseClause();
        this._builder.decreaseNestingLevel();
        this._expect(FormatterWorker.JavaScriptTokens.RBRACE);
    },

    _parseThrowStatement: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.THROW);
        this._builder.addSpace();
        this._parseExpression();
        this._expectSemicolon();
    },

    _parseTryStatement: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.TRY);
        this._builder.addSpace();
        this._parseBlock();

        var token = this._peek();
        if (token === FormatterWorker.JavaScriptTokens.CATCH) {
            this._builder.addSpace();
            this._consume(FormatterWorker.JavaScriptTokens.CATCH);
            this._builder.addSpace();
            this._expect(FormatterWorker.JavaScriptTokens.LPAREN);
            this._expect(FormatterWorker.JavaScriptTokens.IDENTIFIER);
            this._expect(FormatterWorker.JavaScriptTokens.RPAREN);
            this._builder.addSpace();
            this._parseBlock();
            token = this._peek();
        }

        if (token === FormatterWorker.JavaScriptTokens.FINALLY) {
            this._consume(FormatterWorker.JavaScriptTokens.FINALLY);
            this._builder.addSpace();
            this._parseBlock();
        }
    },

    _parseDoWhileStatement: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.DO);
        var isBlock = this._parseStatementOrBlock();
        if (isBlock)
            this._builder.addSpace();
        else
            this._builder.addNewLine();
        this._expect(FormatterWorker.JavaScriptTokens.WHILE);
        this._builder.addSpace();
        this._expect(FormatterWorker.JavaScriptTokens.LPAREN);
        this._parseExpression();
        this._expect(FormatterWorker.JavaScriptTokens.RPAREN);
        this._expectSemicolon();
    },

    _parseWhileStatement: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.WHILE);
        this._builder.addSpace();
        this._expect(FormatterWorker.JavaScriptTokens.LPAREN);
        this._parseExpression();
        this._expect(FormatterWorker.JavaScriptTokens.RPAREN);
        this._parseStatementOrBlock();
    },

    _parseForStatement: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.FOR);
        this._builder.addSpace();
        this._expect(FormatterWorker.JavaScriptTokens.LPAREN);
        if (this._peek() !== FormatterWorker.JavaScriptTokens.SEMICOLON) {
            if (this._peek() === FormatterWorker.JavaScriptTokens.VAR || this._peek() === FormatterWorker.JavaScriptTokens.CONST) {
                this._parseVariableDeclarations();
                if (this._peek() === FormatterWorker.JavaScriptTokens.IN) {
                    this._builder.addSpace();
                    this._consume(FormatterWorker.JavaScriptTokens.IN);
                    this._builder.addSpace();
                    this._parseExpression();
                }
            } else
                this._parseExpression();
        }

        if (this._peek() !== FormatterWorker.JavaScriptTokens.RPAREN) {
            this._expect(FormatterWorker.JavaScriptTokens.SEMICOLON);
            this._builder.addSpace();
            if (this._peek() !== FormatterWorker.JavaScriptTokens.SEMICOLON)
                this._parseExpression();
            this._expect(FormatterWorker.JavaScriptTokens.SEMICOLON);
            this._builder.addSpace();
            if (this._peek() !== FormatterWorker.JavaScriptTokens.RPAREN)
                this._parseExpression();
        }
        this._expect(FormatterWorker.JavaScriptTokens.RPAREN);

        this._parseStatementOrBlock();
    },

    _parseExpression: function()
    {
        this._parseAssignmentExpression();
        while (this._peek() === FormatterWorker.JavaScriptTokens.COMMA) {
            this._expect(FormatterWorker.JavaScriptTokens.COMMA);
            this._builder.addSpace();
            this._parseAssignmentExpression();
        }
    },

    _parseAssignmentExpression: function()
    {
        this._parseConditionalExpression();
        var token = this._peek();
        if (FormatterWorker.JavaScriptTokens.ASSIGN <= token && token <= FormatterWorker.JavaScriptTokens.ASSIGN_MOD) {
            this._builder.addSpace();
            this._next();
            this._builder.addSpace();
            this._parseAssignmentExpression();
        }
    },

    _parseConditionalExpression: function()
    {
        this._parseBinaryExpression();
        if (this._peek() === FormatterWorker.JavaScriptTokens.CONDITIONAL) {
            this._builder.addSpace();
            this._consume(FormatterWorker.JavaScriptTokens.CONDITIONAL);
            this._builder.addSpace();
            this._parseAssignmentExpression();
            this._builder.addSpace();
            this._expect(FormatterWorker.JavaScriptTokens.COLON);
            this._builder.addSpace();
            this._parseAssignmentExpression();
        }
    },

    _parseBinaryExpression: function()
    {
        this._parseUnaryExpression();
        var token = this._peek();
        while (FormatterWorker.JavaScriptTokens.OR <= token && token <= FormatterWorker.JavaScriptTokens.IN) {
            this._builder.addSpace();
            this._next();
            this._builder.addSpace();
            this._parseBinaryExpression();
            token = this._peek();
        }
    },

    _parseUnaryExpression: function()
    {
        var token = this._peek();
        if ((FormatterWorker.JavaScriptTokens.NOT <= token && token <= FormatterWorker.JavaScriptTokens.VOID) || token === FormatterWorker.JavaScriptTokens.ADD || token === FormatterWorker.JavaScriptTokens.SUB || token ===  FormatterWorker.JavaScriptTokens.INC || token === FormatterWorker.JavaScriptTokens.DEC) {
            this._next();
            if (token === FormatterWorker.JavaScriptTokens.DELETE || token === FormatterWorker.JavaScriptTokens.TYPEOF || token === FormatterWorker.JavaScriptTokens.VOID)
                this._builder.addSpace();
            this._parseUnaryExpression();
        } else
            return this._parsePostfixExpression();
    },

    _parsePostfixExpression: function()
    {
        this._parseLeftHandSideExpression();
        var token = this._peek();
        if (!this._hasLineTerminatorBeforeNext() && (token === FormatterWorker.JavaScriptTokens.INC || token === FormatterWorker.JavaScriptTokens.DEC))
            this._next();
    },

    _parseLeftHandSideExpression: function()
    {
        if (this._peek() === FormatterWorker.JavaScriptTokens.NEW)
            this._parseNewExpression();
        else
            this._parseMemberExpression();

        while (true) {
            switch (this._peek()) {
            case FormatterWorker.JavaScriptTokens.LBRACK:
                this._consume(FormatterWorker.JavaScriptTokens.LBRACK);
                this._parseExpression();
                this._expect(FormatterWorker.JavaScriptTokens.RBRACK);
                break;

            case FormatterWorker.JavaScriptTokens.LPAREN:
                this._parseArguments();
                break;

            case FormatterWorker.JavaScriptTokens.PERIOD:
                this._consume(FormatterWorker.JavaScriptTokens.PERIOD);
                this._expectGeneralIdentifier();
                break;

            default:
                return;
            }
        }
    },

    _parseNewExpression: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.NEW);
        this._builder.addSpace();
        if (this._peek() === FormatterWorker.JavaScriptTokens.NEW)
            this._parseNewExpression();
        else
            this._parseMemberExpression();
    },

    _parseMemberExpression: function()
    {
        if (this._peek() === FormatterWorker.JavaScriptTokens.FUNCTION) {
            this._expect(FormatterWorker.JavaScriptTokens.FUNCTION);
            if (this._peek() === FormatterWorker.JavaScriptTokens.IDENTIFIER) {
                this._builder.addSpace();
                this._expect(FormatterWorker.JavaScriptTokens.IDENTIFIER);
            }
            this._parseFunctionLiteral();
        } else
            this._parsePrimaryExpression();

        while (true) {
            switch (this._peek()) {
            case FormatterWorker.JavaScriptTokens.LBRACK:
                this._consume(FormatterWorker.JavaScriptTokens.LBRACK);
                this._parseExpression();
                this._expect(FormatterWorker.JavaScriptTokens.RBRACK);
                break;

            case FormatterWorker.JavaScriptTokens.PERIOD:
                this._consume(FormatterWorker.JavaScriptTokens.PERIOD);
                this._expectGeneralIdentifier();
                break;

            case FormatterWorker.JavaScriptTokens.LPAREN:
                this._parseArguments();
                break;

            default:
                return;
            }
        }
    },

    _parseDebuggerStatement: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.DEBUGGER);
        this._expectSemicolon();
    },

    _parsePrimaryExpression: function()
    {
        switch (this._peek()) {
        case FormatterWorker.JavaScriptTokens.THIS:
            return this._consume(FormatterWorker.JavaScriptTokens.THIS);
        case FormatterWorker.JavaScriptTokens.NULL_LITERAL:
            return this._consume(FormatterWorker.JavaScriptTokens.NULL_LITERAL);
        case FormatterWorker.JavaScriptTokens.TRUE_LITERAL:
            return this._consume(FormatterWorker.JavaScriptTokens.TRUE_LITERAL);
        case FormatterWorker.JavaScriptTokens.FALSE_LITERAL:
            return this._consume(FormatterWorker.JavaScriptTokens.FALSE_LITERAL);
        case FormatterWorker.JavaScriptTokens.IDENTIFIER:
            return this._consume(FormatterWorker.JavaScriptTokens.IDENTIFIER);
        case FormatterWorker.JavaScriptTokens.NUMBER:
            return this._consume(FormatterWorker.JavaScriptTokens.NUMBER);
        case FormatterWorker.JavaScriptTokens.STRING:
            return this._consume(FormatterWorker.JavaScriptTokens.STRING);
        case FormatterWorker.JavaScriptTokens.ASSIGN_DIV:
            return this._parseRegExpLiteral();
        case FormatterWorker.JavaScriptTokens.DIV:
            return this._parseRegExpLiteral();
        case FormatterWorker.JavaScriptTokens.LBRACK:
            return this._parseArrayLiteral();
        case FormatterWorker.JavaScriptTokens.LBRACE:
            return this._parseObjectLiteral();
        case FormatterWorker.JavaScriptTokens.LPAREN:
            this._consume(FormatterWorker.JavaScriptTokens.LPAREN);
            this._parseExpression();
            this._expect(FormatterWorker.JavaScriptTokens.RPAREN);
            return;
        default:
            return this._next();
        }
    },

    _parseArrayLiteral: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.LBRACK);
        this._builder.increaseNestingLevel();
        while (this._peek() !== FormatterWorker.JavaScriptTokens.RBRACK) {
            if (this._peek() !== FormatterWorker.JavaScriptTokens.COMMA)
                this._parseAssignmentExpression();
            if (this._peek() !== FormatterWorker.JavaScriptTokens.RBRACK) {
                this._expect(FormatterWorker.JavaScriptTokens.COMMA);
                this._builder.addSpace();
            }
        }
        this._builder.decreaseNestingLevel();
        this._expect(FormatterWorker.JavaScriptTokens.RBRACK);
    },

    _parseObjectLiteralGetSet: function()
    {
        var token = this._peek();
        if (token === FormatterWorker.JavaScriptTokens.IDENTIFIER || token === FormatterWorker.JavaScriptTokens.NUMBER || token === FormatterWorker.JavaScriptTokens.STRING ||
            FormatterWorker.JavaScriptTokens.DELETE <= token && token <= FormatterWorker.JavaScriptTokens.FALSE_LITERAL ||
            token === FormatterWorker.JavaScriptTokens.INSTANCEOF || token === FormatterWorker.JavaScriptTokens.IN || token === FormatterWorker.JavaScriptTokens.CONST) {
            this._next();
            this._parseFunctionLiteral();
        }
    },

    _parseObjectLiteral: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.LBRACE);
        this._builder.increaseNestingLevel();
        while (this._peek() !== FormatterWorker.JavaScriptTokens.RBRACE) {
            var token = this._peek();
            switch (token) {
            case FormatterWorker.JavaScriptTokens.IDENTIFIER:
                this._consume(FormatterWorker.JavaScriptTokens.IDENTIFIER);
                var name = this._token.value;
                if ((name === "get" || name === "set") && this._peek() !== FormatterWorker.JavaScriptTokens.COLON) {
                    this._builder.addSpace();
                    this._parseObjectLiteralGetSet();
                    if (this._peek() !== FormatterWorker.JavaScriptTokens.RBRACE) {
                        this._expect(FormatterWorker.JavaScriptTokens.COMMA);
                    }
                    continue;
                }
                break;

            case FormatterWorker.JavaScriptTokens.STRING:
                this._consume(FormatterWorker.JavaScriptTokens.STRING);
                break;

            case FormatterWorker.JavaScriptTokens.NUMBER:
                this._consume(FormatterWorker.JavaScriptTokens.NUMBER);
                break;

            default:
                this._next();
            }

            this._expect(FormatterWorker.JavaScriptTokens.COLON);
            this._builder.addSpace();
            this._parseAssignmentExpression();
            if (this._peek() !== FormatterWorker.JavaScriptTokens.RBRACE) {
                this._expect(FormatterWorker.JavaScriptTokens.COMMA);
            }
        }
        this._builder.decreaseNestingLevel();

        this._expect(FormatterWorker.JavaScriptTokens.RBRACE);
    },

    _parseRegExpLiteral: function()
    {
        if (this._nextToken.type === "regexp")
            this._next();
        else {
            this._forceRegexp = true;
            this._next();
        }
    },

    _parseArguments: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.LPAREN);
        var done = (this._peek() === FormatterWorker.JavaScriptTokens.RPAREN);
        while (!done) {
            this._parseAssignmentExpression();
            done = (this._peek() === FormatterWorker.JavaScriptTokens.RPAREN);
            if (!done) {
                this._expect(FormatterWorker.JavaScriptTokens.COMMA);
                this._builder.addSpace();
            }
        }
        this._expect(FormatterWorker.JavaScriptTokens.RPAREN);
    },

    _parseFunctionLiteral: function()
    {
        this._expect(FormatterWorker.JavaScriptTokens.LPAREN);
        var done = (this._peek() === FormatterWorker.JavaScriptTokens.RPAREN);
        while (!done) {
            this._expect(FormatterWorker.JavaScriptTokens.IDENTIFIER);
            done = (this._peek() === FormatterWorker.JavaScriptTokens.RPAREN);
            if (!done) {
                this._expect(FormatterWorker.JavaScriptTokens.COMMA);
                this._builder.addSpace();
            }
        }
        this._expect(FormatterWorker.JavaScriptTokens.RPAREN);
        this._builder.addSpace();

        this._expect(FormatterWorker.JavaScriptTokens.LBRACE);
        this._builder.addNewLine();
        this._builder.increaseNestingLevel();
        this._parseSourceElements(FormatterWorker.JavaScriptTokens.RBRACE);
        this._builder.decreaseNestingLevel();
        this._expect(FormatterWorker.JavaScriptTokens.RBRACE);
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
     * @param {!{comments_before: !Array.<string>, line: number, pos: number, endLine: number, nlb: boolean}} token
     */
    addToken: function(token)
    {
        for (var i = 0; i < token.comments_before.length; ++i)
            this._addComment(token.comments_before[i]);

        while (this._lineNumber < token.line) {
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

        this._addMappingIfNeeded(token.pos);
        this._addText(this._originalContent.substring(token.pos, token.endPos));
        this._lineNumber = token.endLine;
    },

    addSpace: function()
    {
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
        return this._formattedContent.join("");
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

    _addComment: function(comment)
    {
        if (this._lineNumber < comment.line) {
            for (var j = this._lineNumber; j < comment.line; ++j)
                this._addText("\n");
            this._lineNumber = comment.line;
            this._needNewLine = false;
            this._addIndent();
        } else
            this.addSpace();

        this._addMappingIfNeeded(comment.pos);
        if (comment.type === "comment1")
            this._addText("//");
        else
            this._addText("/*");

        this._addText(comment.value);

        if (comment.type !== "comment1") {
            this._addText("*/");
            var position;
            while ((position = comment.value.indexOf("\n", position + 1)) !== -1)
                this._lineNumber += 1;
        }
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

FormatterWorker.JavaScriptTokens = {};
FormatterWorker.JavaScriptTokensByValue = {};

FormatterWorker.JavaScriptTokens.EOS = 0;
FormatterWorker.JavaScriptTokens.LPAREN = FormatterWorker.JavaScriptTokensByValue["("] = 1;
FormatterWorker.JavaScriptTokens.RPAREN = FormatterWorker.JavaScriptTokensByValue[")"] = 2;
FormatterWorker.JavaScriptTokens.LBRACK = FormatterWorker.JavaScriptTokensByValue["["] = 3;
FormatterWorker.JavaScriptTokens.RBRACK = FormatterWorker.JavaScriptTokensByValue["]"] = 4;
FormatterWorker.JavaScriptTokens.LBRACE = FormatterWorker.JavaScriptTokensByValue["{"] = 5;
FormatterWorker.JavaScriptTokens.RBRACE = FormatterWorker.JavaScriptTokensByValue["}"] = 6;
FormatterWorker.JavaScriptTokens.COLON = FormatterWorker.JavaScriptTokensByValue[":"] = 7;
FormatterWorker.JavaScriptTokens.SEMICOLON = FormatterWorker.JavaScriptTokensByValue[";"] = 8;
FormatterWorker.JavaScriptTokens.PERIOD = FormatterWorker.JavaScriptTokensByValue["."] = 9;
FormatterWorker.JavaScriptTokens.CONDITIONAL = FormatterWorker.JavaScriptTokensByValue["?"] = 10;
FormatterWorker.JavaScriptTokens.INC = FormatterWorker.JavaScriptTokensByValue["++"] = 11;
FormatterWorker.JavaScriptTokens.DEC = FormatterWorker.JavaScriptTokensByValue["--"] = 12;
FormatterWorker.JavaScriptTokens.ASSIGN = FormatterWorker.JavaScriptTokensByValue["="] = 13;
FormatterWorker.JavaScriptTokens.ASSIGN_BIT_OR = FormatterWorker.JavaScriptTokensByValue["|="] = 14;
FormatterWorker.JavaScriptTokens.ASSIGN_BIT_XOR = FormatterWorker.JavaScriptTokensByValue["^="] = 15;
FormatterWorker.JavaScriptTokens.ASSIGN_BIT_AND = FormatterWorker.JavaScriptTokensByValue["&="] = 16;
FormatterWorker.JavaScriptTokens.ASSIGN_SHL = FormatterWorker.JavaScriptTokensByValue["<<="] = 17;
FormatterWorker.JavaScriptTokens.ASSIGN_SAR = FormatterWorker.JavaScriptTokensByValue[">>="] = 18;
FormatterWorker.JavaScriptTokens.ASSIGN_SHR = FormatterWorker.JavaScriptTokensByValue[">>>="] = 19;
FormatterWorker.JavaScriptTokens.ASSIGN_ADD = FormatterWorker.JavaScriptTokensByValue["+="] = 20;
FormatterWorker.JavaScriptTokens.ASSIGN_SUB = FormatterWorker.JavaScriptTokensByValue["-="] = 21;
FormatterWorker.JavaScriptTokens.ASSIGN_MUL = FormatterWorker.JavaScriptTokensByValue["*="] = 22;
FormatterWorker.JavaScriptTokens.ASSIGN_DIV = FormatterWorker.JavaScriptTokensByValue["/="] = 23;
FormatterWorker.JavaScriptTokens.ASSIGN_MOD = FormatterWorker.JavaScriptTokensByValue["%="] = 24;
FormatterWorker.JavaScriptTokens.COMMA = FormatterWorker.JavaScriptTokensByValue[","] = 25;
FormatterWorker.JavaScriptTokens.OR = FormatterWorker.JavaScriptTokensByValue["||"] = 26;
FormatterWorker.JavaScriptTokens.AND = FormatterWorker.JavaScriptTokensByValue["&&"] = 27;
FormatterWorker.JavaScriptTokens.BIT_OR = FormatterWorker.JavaScriptTokensByValue["|"] = 28;
FormatterWorker.JavaScriptTokens.BIT_XOR = FormatterWorker.JavaScriptTokensByValue["^"] = 29;
FormatterWorker.JavaScriptTokens.BIT_AND = FormatterWorker.JavaScriptTokensByValue["&"] = 30;
FormatterWorker.JavaScriptTokens.SHL = FormatterWorker.JavaScriptTokensByValue["<<"] = 31;
FormatterWorker.JavaScriptTokens.SAR = FormatterWorker.JavaScriptTokensByValue[">>"] = 32;
FormatterWorker.JavaScriptTokens.SHR = FormatterWorker.JavaScriptTokensByValue[">>>"] = 33;
FormatterWorker.JavaScriptTokens.ADD = FormatterWorker.JavaScriptTokensByValue["+"] = 34;
FormatterWorker.JavaScriptTokens.SUB = FormatterWorker.JavaScriptTokensByValue["-"] = 35;
FormatterWorker.JavaScriptTokens.MUL = FormatterWorker.JavaScriptTokensByValue["*"] = 36;
FormatterWorker.JavaScriptTokens.DIV = FormatterWorker.JavaScriptTokensByValue["/"] = 37;
FormatterWorker.JavaScriptTokens.MOD = FormatterWorker.JavaScriptTokensByValue["%"] = 38;
FormatterWorker.JavaScriptTokens.EQ = FormatterWorker.JavaScriptTokensByValue["=="] = 39;
FormatterWorker.JavaScriptTokens.NE = FormatterWorker.JavaScriptTokensByValue["!="] = 40;
FormatterWorker.JavaScriptTokens.EQ_STRICT = FormatterWorker.JavaScriptTokensByValue["==="] = 41;
FormatterWorker.JavaScriptTokens.NE_STRICT = FormatterWorker.JavaScriptTokensByValue["!=="] = 42;
FormatterWorker.JavaScriptTokens.LT = FormatterWorker.JavaScriptTokensByValue["<"] = 43;
FormatterWorker.JavaScriptTokens.GT = FormatterWorker.JavaScriptTokensByValue[">"] = 44;
FormatterWorker.JavaScriptTokens.LTE = FormatterWorker.JavaScriptTokensByValue["<="] = 45;
FormatterWorker.JavaScriptTokens.GTE = FormatterWorker.JavaScriptTokensByValue[">="] = 46;
FormatterWorker.JavaScriptTokens.INSTANCEOF = FormatterWorker.JavaScriptTokensByValue["instanceof"] = 47;
FormatterWorker.JavaScriptTokens.IN = FormatterWorker.JavaScriptTokensByValue["in"] = 48;
FormatterWorker.JavaScriptTokens.NOT = FormatterWorker.JavaScriptTokensByValue["!"] = 49;
FormatterWorker.JavaScriptTokens.BIT_NOT = FormatterWorker.JavaScriptTokensByValue["~"] = 50;
FormatterWorker.JavaScriptTokens.DELETE = FormatterWorker.JavaScriptTokensByValue["delete"] = 51;
FormatterWorker.JavaScriptTokens.TYPEOF = FormatterWorker.JavaScriptTokensByValue["typeof"] = 52;
FormatterWorker.JavaScriptTokens.VOID = FormatterWorker.JavaScriptTokensByValue["void"] = 53;
FormatterWorker.JavaScriptTokens.BREAK = FormatterWorker.JavaScriptTokensByValue["break"] = 54;
FormatterWorker.JavaScriptTokens.CASE = FormatterWorker.JavaScriptTokensByValue["case"] = 55;
FormatterWorker.JavaScriptTokens.CATCH = FormatterWorker.JavaScriptTokensByValue["catch"] = 56;
FormatterWorker.JavaScriptTokens.CONTINUE = FormatterWorker.JavaScriptTokensByValue["continue"] = 57;
FormatterWorker.JavaScriptTokens.DEBUGGER = FormatterWorker.JavaScriptTokensByValue["debugger"] = 58;
FormatterWorker.JavaScriptTokens.DEFAULT = FormatterWorker.JavaScriptTokensByValue["default"] = 59;
FormatterWorker.JavaScriptTokens.DO = FormatterWorker.JavaScriptTokensByValue["do"] = 60;
FormatterWorker.JavaScriptTokens.ELSE = FormatterWorker.JavaScriptTokensByValue["else"] = 61;
FormatterWorker.JavaScriptTokens.FINALLY = FormatterWorker.JavaScriptTokensByValue["finally"] = 62;
FormatterWorker.JavaScriptTokens.FOR = FormatterWorker.JavaScriptTokensByValue["for"] = 63;
FormatterWorker.JavaScriptTokens.FUNCTION = FormatterWorker.JavaScriptTokensByValue["function"] = 64;
FormatterWorker.JavaScriptTokens.IF = FormatterWorker.JavaScriptTokensByValue["if"] = 65;
FormatterWorker.JavaScriptTokens.NEW = FormatterWorker.JavaScriptTokensByValue["new"] = 66;
FormatterWorker.JavaScriptTokens.RETURN = FormatterWorker.JavaScriptTokensByValue["return"] = 67;
FormatterWorker.JavaScriptTokens.SWITCH = FormatterWorker.JavaScriptTokensByValue["switch"] = 68;
FormatterWorker.JavaScriptTokens.THIS = FormatterWorker.JavaScriptTokensByValue["this"] = 69;
FormatterWorker.JavaScriptTokens.THROW = FormatterWorker.JavaScriptTokensByValue["throw"] = 70;
FormatterWorker.JavaScriptTokens.TRY = FormatterWorker.JavaScriptTokensByValue["try"] = 71;
FormatterWorker.JavaScriptTokens.VAR = FormatterWorker.JavaScriptTokensByValue["var"] = 72;
FormatterWorker.JavaScriptTokens.WHILE = FormatterWorker.JavaScriptTokensByValue["while"] = 73;
FormatterWorker.JavaScriptTokens.WITH = FormatterWorker.JavaScriptTokensByValue["with"] = 74;
FormatterWorker.JavaScriptTokens.NULL_LITERAL = FormatterWorker.JavaScriptTokensByValue["null"] = 75;
FormatterWorker.JavaScriptTokens.TRUE_LITERAL = FormatterWorker.JavaScriptTokensByValue["true"] = 76;
FormatterWorker.JavaScriptTokens.FALSE_LITERAL = FormatterWorker.JavaScriptTokensByValue["false"] = 77;
FormatterWorker.JavaScriptTokens.NUMBER = 78;
FormatterWorker.JavaScriptTokens.STRING = 79;
FormatterWorker.JavaScriptTokens.IDENTIFIER = 80;
FormatterWorker.JavaScriptTokens.CONST = FormatterWorker.JavaScriptTokensByValue["const"] = 81;

FormatterWorker.JavaScriptTokensByType = {
    "eof": FormatterWorker.JavaScriptTokens.EOS,
    "name": FormatterWorker.JavaScriptTokens.IDENTIFIER,
    "num": FormatterWorker.JavaScriptTokens.NUMBER,
    "regexp": FormatterWorker.JavaScriptTokens.DIV,
    "string": FormatterWorker.JavaScriptTokens.STRING
};

/**
 * @constructor
 * @param {string} content
 */
FormatterWorker.JavaScriptTokenizer = function(content)
{
    this._readNextToken = tokenizerHolder.tokenizer(content);
    this._state = this._readNextToken.context();
}

FormatterWorker.JavaScriptTokenizer.prototype = {
    /**
     * @return {string}
     */
    content: function()
    {
        return this._state.text;
    },

    /**
     * @param {boolean=} forceRegexp
     * @return {!{comments_before: !Array.<string>, line: number, pos: number, endLine: number, nlb: boolean, token: number, type: string, value: *}}
     */
    next: function(forceRegexp)
    {
        var uglifyToken = this._readNextToken(forceRegexp);
        uglifyToken.endPos = this._state.pos;
        uglifyToken.endLine = this._state.line;
        uglifyToken.token = this._convertUglifyToken(uglifyToken);
        return uglifyToken;
    },

    /**
     * @return {number}
     */
    _convertUglifyToken: function(uglifyToken)
    {
        var token = FormatterWorker.JavaScriptTokensByType[uglifyToken.type];
        if (typeof token === "number")
            return token;
        token = FormatterWorker.JavaScriptTokensByValue[uglifyToken.value];
        if (typeof token === "number")
            return token;
        throw "Unknown token type " + uglifyToken.type;
    }
}
