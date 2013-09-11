/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 * 1. Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY GOOGLE INC. AND ITS CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL GOOGLE INC.
 * OR ITS CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @extends {WebInspector.View}
 * @constructor
 */
WebInspector.NavigatorView = function()
{
    WebInspector.View.call(this);
    this.registerRequiredCSS("navigatorView.css");

    var scriptsTreeElement = document.createElement("ol");
    this._scriptsTree = new WebInspector.NavigatorTreeOutline(scriptsTreeElement);
    this._scriptsTree.childrenListElement.addEventListener("keypress", this._treeKeyPress.bind(this), true);

    var scriptsOutlineElement = document.createElement("div");
    scriptsOutlineElement.addStyleClass("outline-disclosure");
    scriptsOutlineElement.addStyleClass("navigator");
    scriptsOutlineElement.appendChild(scriptsTreeElement);

    this.element.addStyleClass("fill");
    this.element.addStyleClass("navigator-container");
    this.element.appendChild(scriptsOutlineElement);
    this.setDefaultFocusedElement(this._scriptsTree.element);

    /** @type {!Map.<WebInspector.UISourceCode, !WebInspector.NavigatorUISourceCodeTreeNode>} */
    this._uiSourceCodeNodes = new Map();
    /** @type {!Map.<WebInspector.NavigatorTreeNode, !StringMap.<!WebInspector.NavigatorFolderTreeNode>>} */
    this._subfolderNodes = new Map();

    this._rootNode = new WebInspector.NavigatorRootTreeNode(this);
    this._rootNode.populate();

    WebInspector.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.InspectedURLChanged, this._inspectedURLChanged, this);
    this.element.addEventListener("contextmenu", this.handleContextMenu.bind(this), false);
}

WebInspector.NavigatorView.Events = {
    ItemSelected: "ItemSelected",
    ItemSearchStarted: "ItemSearchStarted",
    ItemRenamingRequested: "ItemRenamingRequested",
    ItemCreationRequested: "ItemCreationRequested"
}

WebInspector.NavigatorView.iconClassForType = function(type)
{
    if (type === WebInspector.NavigatorTreeOutline.Types.Domain)
        return "navigator-domain-tree-item";
    if (type === WebInspector.NavigatorTreeOutline.Types.FileSystem)
        return "navigator-folder-tree-item";
    return "navigator-folder-tree-item";
}

WebInspector.NavigatorView.prototype = {
    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    addUISourceCode: function(uiSourceCode)
    {
        var projectNode = this._projectNode(uiSourceCode.project());
        var folderNode = this._folderNode(projectNode, uiSourceCode.parentPath());
        var uiSourceCodeNode = new WebInspector.NavigatorUISourceCodeTreeNode(this, uiSourceCode);
        this._uiSourceCodeNodes.put(uiSourceCode, uiSourceCodeNode);
        folderNode.appendChild(uiSourceCodeNode);
        if (uiSourceCode.url === WebInspector.inspectedPageURL)
            this.revealUISourceCode(uiSourceCode);
    },

    /**
     * @param {WebInspector.Event} event
     */
    _inspectedURLChanged: function(event)
    {
        var nodes = this._uiSourceCodeNodes.values();
        for (var i = 0; i < nodes.length; ++i) {
            var uiSourceCode = nodes[i].uiSourceCode();
            if (uiSourceCode.url === WebInspector.inspectedPageURL)
                this.revealUISourceCode(uiSourceCode);
        }
    },

    /**
     * @param {WebInspector.Project} project
     * @return {WebInspector.NavigatorTreeNode}
     */
    _projectNode: function(project)
    {
        if (!project.displayName())
            return this._rootNode;

        var projectNode = this._rootNode.child(project.id());
        if (!projectNode) {
            var type = project.type() === WebInspector.projectTypes.FileSystem ? WebInspector.NavigatorTreeOutline.Types.FileSystem : WebInspector.NavigatorTreeOutline.Types.Domain;
            projectNode = new WebInspector.NavigatorFolderTreeNode(this, project, project.id(), type, "", project.displayName());
            this._rootNode.appendChild(projectNode);
        }
        return projectNode;
    },

    /**
     * @param {WebInspector.NavigatorTreeNode} projectNode
     * @param {string} folderPath
     * @return {WebInspector.NavigatorTreeNode}
     */
    _folderNode: function(projectNode, folderPath)
    {
        if (!folderPath)
            return projectNode;

        var subfolderNodes = this._subfolderNodes.get(projectNode);
        if (!subfolderNodes) {
            subfolderNodes = /** @type {!StringMap.<!WebInspector.NavigatorFolderTreeNode>} */ (new StringMap());
            this._subfolderNodes.put(projectNode, subfolderNodes);
        }

        var folderNode = subfolderNodes.get(folderPath);
        if (folderNode)
            return folderNode;

        var parentNode = projectNode;
        var index = folderPath.lastIndexOf("/");
        if (index !== -1)
            parentNode = this._folderNode(projectNode, folderPath.substring(0, index));

        var name = folderPath.substring(index + 1);
        folderNode = new WebInspector.NavigatorFolderTreeNode(this, null, name, WebInspector.NavigatorTreeOutline.Types.Folder, folderPath, name);
        subfolderNodes.put(folderPath, folderNode);
        parentNode.appendChild(folderNode);
        return folderNode;
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {boolean=} select
     */
    revealUISourceCode: function(uiSourceCode, select)
    {
        var node = this._uiSourceCodeNodes.get(uiSourceCode);
        if (!node)
            return null;
        if (this._scriptsTree.selectedTreeElement)
            this._scriptsTree.selectedTreeElement.deselect();
        this._lastSelectedUISourceCode = uiSourceCode;
        node.reveal(select);
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {boolean} focusSource
     */
    _scriptSelected: function(uiSourceCode, focusSource)
    {
        this._lastSelectedUISourceCode = uiSourceCode;
        var data = { uiSourceCode: uiSourceCode, focusSource: focusSource};
        this.dispatchEventToListeners(WebInspector.NavigatorView.Events.ItemSelected, data);
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    removeUISourceCode: function(uiSourceCode)
    {
        var node = this._uiSourceCodeNodes.get(uiSourceCode);
        if (!node)
            return;

        var projectNode = this._projectNode(uiSourceCode.project());
        var subfolderNodes = this._subfolderNodes.get(projectNode);
        var parentNode = node.parent;
        this._uiSourceCodeNodes.remove(uiSourceCode);
        parentNode.removeChild(node);
        node = parentNode;

        while (node) {
            parentNode = node.parent;
            if (!parentNode || !node.isEmpty())
                break;
            if (subfolderNodes)
                subfolderNodes.remove(node._folderPath);
            parentNode.removeChild(node);
            node = parentNode;
        }
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    requestRename: function(uiSourceCode)
    {
        this.dispatchEventToListeners(WebInspector.ScriptsNavigator.Events.ItemRenamingRequested, uiSourceCode);
    },

    /**
     * @param {WebInspector.UISourceCode} uiSourceCode
     * @param {function(boolean)=} callback
     */
    rename: function(uiSourceCode, callback)
    {
        var node = this._uiSourceCodeNodes.get(uiSourceCode);
        if (!node)
            return null;
        node.rename(callback);
    },

    reset: function()
    {
        var nodes = this._uiSourceCodeNodes.values();
        for (var i = 0; i < nodes.length; ++i)
            nodes[i].dispose();

        this._scriptsTree.removeChildren();
        this._uiSourceCodeNodes.clear();
        this._subfolderNodes.clear();
        this._rootNode.reset();
    },

    /**
     * @param {Event} event
     */
    handleContextMenu: function(event)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        this._appendAddFolderItem(contextMenu);
        contextMenu.show();
    },

    /**
     * @param {WebInspector.ContextMenu} contextMenu
     */
    _appendAddFolderItem: function(contextMenu)
    {
        function addFolder()
        {
            WebInspector.isolatedFileSystemManager.addFileSystem();
        }

        var addFolderLabel = WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Add folder to workspace" : "Add Folder to Workspace");
        contextMenu.appendItem(addFolderLabel, addFolder);
    },

    /**
     * @param {Event} event
     * @param {WebInspector.UISourceCode} uiSourceCode
     */
    handleFileContextMenu: function(event, uiSourceCode)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        contextMenu.appendApplicableItems(uiSourceCode);
        contextMenu.appendSeparator();
        this._appendAddFolderItem(contextMenu);
        contextMenu.show();
    },

    /**
     * @param {Event} event
     * @param {WebInspector.NavigatorFolderTreeNode} node
     */
    handleFolderContextMenu: function(event, node)
    {
        var contextMenu = new WebInspector.ContextMenu(event);
        var path = "/";
        var projectNode = node;
        while (projectNode.parent !== this._rootNode) {
            path = "/" + projectNode.id + path;
            projectNode = projectNode.parent;
        }

        var project = projectNode._project;

        if (project.type() === WebInspector.projectTypes.FileSystem) {
            function refresh()
            {
                project.refresh(path);
            }

            contextMenu.appendItem(WebInspector.UIString("Refresh"), refresh.bind(this));

            function create()
            {
                var data = {};
                data.project = project;
                data.path = path;
                this.dispatchEventToListeners(WebInspector.NavigatorView.Events.ItemCreationRequested, data);
            }

            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "New file" : "New File"), create.bind(this));

            function exclude()
            {
                var shouldExclude = window.confirm(WebInspector.UIString("Are you sure you want to exclude this folder?"));
                if (shouldExclude) {
                    WebInspector.startBatchUpdate();
                    project.excludeFolder(path);
                    WebInspector.endBatchUpdate();
                }
            }

            contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Exclude folder" : "Exclude Folder"), exclude.bind(this));
        }
        contextMenu.appendSeparator();
        this._appendAddFolderItem(contextMenu);
        if (project.type() === WebInspector.projectTypes.FileSystem && node === projectNode) {
            function removeFolder()
            {
                var shouldRemove = window.confirm(WebInspector.UIString("Are you sure you want to remove this folder?"));
                if (shouldRemove)
                    project.remove();
            }

            var removeFolderLabel = WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Remove folder from workspace" : "Remove Folder from Workspace");
            contextMenu.appendItem(removeFolderLabel, removeFolder);
        }

        contextMenu.show();
    },

    /**
     * @param {Event} event
     */
   _treeKeyPress: function(event)
   {
        if (WebInspector.isBeingEdited(this._scriptsTree.childrenListElement))
            return;

        var searchText = String.fromCharCode(event.charCode);
        if (searchText.trim() !== searchText)
            return;
        this.dispatchEventToListeners(WebInspector.NavigatorView.Events.ItemSearchStarted, searchText);
        event.consume(true);
   },

    __proto__: WebInspector.View.prototype
}

/**
 * @constructor
 * @extends {TreeOutline}
 * @param {Element} element
 */
WebInspector.NavigatorTreeOutline = function(element)
{
    TreeOutline.call(this, element);
    this.element = element;

    this.comparator = WebInspector.NavigatorTreeOutline._treeElementsCompare;
}

WebInspector.NavigatorTreeOutline.Types = {
    Root: "Root",
    Domain: "Domain",
    Folder: "Folder",
    UISourceCode: "UISourceCode",
    FileSystem: "FileSystem"
}

WebInspector.NavigatorTreeOutline._treeElementsCompare = function compare(treeElement1, treeElement2)
{
    // Insert in the alphabetical order, first domains, then folders, then scripts.
    function typeWeight(treeElement)
    {
        var type = treeElement.type();
        if (type === WebInspector.NavigatorTreeOutline.Types.Domain) {
            if (treeElement.titleText === WebInspector.inspectedPageDomain)
                return 1;
            return 2;
        }
        if (type === WebInspector.NavigatorTreeOutline.Types.FileSystem)
            return 3;
        if (type === WebInspector.NavigatorTreeOutline.Types.Folder)
            return 4;
        return 5;
    }

    var typeWeight1 = typeWeight(treeElement1);
    var typeWeight2 = typeWeight(treeElement2);

    var result;
    if (typeWeight1 > typeWeight2)
        result = 1;
    else if (typeWeight1 < typeWeight2)
        result = -1;
    else {
        var title1 = treeElement1.titleText;
        var title2 = treeElement2.titleText;
        result = title1.compareTo(title2);
    }
    return result;
}

WebInspector.NavigatorTreeOutline.prototype = {
   /**
    * @return {Array.<WebInspector.UISourceCode>}
    */
   scriptTreeElements: function()
   {
       var result = [];
       if (this.children.length) {
           for (var treeElement = this.children[0]; treeElement; treeElement = treeElement.traverseNextTreeElement(false, this, true)) {
               if (treeElement instanceof WebInspector.NavigatorSourceTreeElement)
                   result.push(treeElement.uiSourceCode);
           }
       }
       return result;
   },

    __proto__: TreeOutline.prototype
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {string} type
 * @param {string} title
 * @param {Array.<string>} iconClasses
 * @param {boolean} hasChildren
 * @param {boolean=} noIcon
 */
WebInspector.BaseNavigatorTreeElement = function(type, title, iconClasses, hasChildren, noIcon)
{
    this._type = type;
    TreeElement.call(this, "", null, hasChildren);
    this._titleText = title;
    this._iconClasses = iconClasses;
    this._noIcon = noIcon;
}

WebInspector.BaseNavigatorTreeElement.prototype = {
    onattach: function()
    {
        this.listItemElement.removeChildren();
        if (this._iconClasses) {
            for (var i = 0; i < this._iconClasses.length; ++i)
                this.listItemElement.addStyleClass(this._iconClasses[i]);
        }

        var selectionElement = document.createElement("div");
        selectionElement.className = "selection";
        this.listItemElement.appendChild(selectionElement);

        if (!this._noIcon) {
            this.imageElement = document.createElement("img");
            this.imageElement.className = "icon";
            this.listItemElement.appendChild(this.imageElement);
        }
        
        this.titleElement = document.createElement("div");
        this.titleElement.className = "base-navigator-tree-element-title";
        this._titleTextNode = document.createTextNode("");
        this._titleTextNode.textContent = this._titleText;
        this.titleElement.appendChild(this._titleTextNode);
        this.listItemElement.appendChild(this.titleElement);
    },

    onreveal: function()
    {
        if (this.listItemElement)
            this.listItemElement.scrollIntoViewIfNeeded(true);
    },

    /**
     * @return {string}
     */
    get titleText()
    {
        return this._titleText;
    },

    set titleText(titleText)
    {
        if (this._titleText === titleText)
            return;
        this._titleText = titleText || "";
        if (this.titleElement)
            this.titleElement.textContent = this._titleText;
    },
    
    /**
     * @return {string}
     */
    type: function()
    {
        return this._type;
    },

    __proto__: TreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseNavigatorTreeElement}
 * @param {WebInspector.NavigatorView} navigatorView
 * @param {string} type
 * @param {string} title
 */
WebInspector.NavigatorFolderTreeElement = function(navigatorView, type, title)
{
    var iconClass = WebInspector.NavigatorView.iconClassForType(type);
    WebInspector.BaseNavigatorTreeElement.call(this, type, title, [iconClass], true);
    this._navigatorView = navigatorView;
}

WebInspector.NavigatorFolderTreeElement.prototype = {
    onpopulate: function()
    {
        this._node.populate();
    },

    onattach: function()
    {
        WebInspector.BaseNavigatorTreeElement.prototype.onattach.call(this);
        this.collapse();
        this.listItemElement.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), false);
    },

    /**
     * @param {WebInspector.NavigatorFolderTreeNode} node
     */
    setNode: function(node)
    {
        this._node = node;
        var paths = [];
        while (node && !node.isRoot()) {
            paths.push(node._title);
            node = node.parent;
        }
        paths.reverse();
        this.tooltip = paths.join("/");
    },

    /**
     * @param {Event} event
     */
    _handleContextMenuEvent: function(event)
    {
        if (!this._node)
            return;
        this.select();
        this._navigatorView.handleFolderContextMenu(event, this._node);
    },

    __proto__: WebInspector.BaseNavigatorTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.BaseNavigatorTreeElement}
 * @param {WebInspector.NavigatorView} navigatorView
 * @param {WebInspector.UISourceCode} uiSourceCode
 * @param {string} title
 */
WebInspector.NavigatorSourceTreeElement = function(navigatorView, uiSourceCode, title)
{
    WebInspector.BaseNavigatorTreeElement.call(this, WebInspector.NavigatorTreeOutline.Types.UISourceCode, title, ["navigator-" + uiSourceCode.contentType().name() + "-tree-item"], false);
    this._navigatorView = navigatorView;
    this._uiSourceCode = uiSourceCode;
    this.tooltip = uiSourceCode.originURL();
}

WebInspector.NavigatorSourceTreeElement.prototype = {
    /**
     * @return {WebInspector.UISourceCode}
     */
    get uiSourceCode()
    {
        return this._uiSourceCode;
    },

    onattach: function()
    {
        WebInspector.BaseNavigatorTreeElement.prototype.onattach.call(this);
        this.listItemElement.draggable = true;
        this.listItemElement.addEventListener("click", this._onclick.bind(this), false);
        this.listItemElement.addEventListener("contextmenu", this._handleContextMenuEvent.bind(this), false);
        this.listItemElement.addEventListener("mousedown", this._onmousedown.bind(this), false);
        this.listItemElement.addEventListener("dragstart", this._ondragstart.bind(this), false);
    },

    _onmousedown: function(event)
    {
        if (event.which === 1) // Warm-up data for drag'n'drop
            this._uiSourceCode.requestContent(callback.bind(this));
        /**
         * @param {?string} content
         * @param {boolean} contentEncoded
         * @param {string} mimeType
         */
        function callback(content, contentEncoded, mimeType)
        {
            this._warmedUpContent = content;
        }
    },

    _shouldRenameOnMouseDown: function()
    {
        if (!this._uiSourceCode.canRename())
            return false;
        var isSelected = this === this.treeOutline.selectedTreeElement;
        var isFocused = this.treeOutline.childrenListElement.isSelfOrAncestor(document.activeElement);
        return isSelected && isFocused && !WebInspector.isBeingEdited(this.treeOutline.element);
    },

    selectOnMouseDown: function(event)
    {
        if (event.which !== 1 || !this._shouldRenameOnMouseDown()) {
            TreeElement.prototype.selectOnMouseDown.call(this, event);
            return;
        }
        setTimeout(rename.bind(this), 300);

        function rename()
        {
            if (this._shouldRenameOnMouseDown())
                this._navigatorView.requestRename(this._uiSourceCode);
        }
    },

    _ondragstart: function(event)
    {
        event.dataTransfer.setData("text/plain", this._warmedUpContent);
        event.dataTransfer.effectAllowed = "copy";
        return true;
    },

    onspace: function()
    {
        this._navigatorView._scriptSelected(this.uiSourceCode, true);
        return true;
    },

    /**
     * @param {Event} event
     */
    _onclick: function(event)
    {
        this._navigatorView._scriptSelected(this.uiSourceCode, false);
    },

    /**
     * @param {Event} event
     */
    ondblclick: function(event)
    {
        var middleClick = event.button === 1;
        this._navigatorView._scriptSelected(this.uiSourceCode, !middleClick);
    },

    onenter: function()
    {
        this._navigatorView._scriptSelected(this.uiSourceCode, true);
        return true;
    },

    /**
     * @param {Event} event
     */
    _handleContextMenuEvent: function(event)
    {
        this.select();
        this._navigatorView.handleFileContextMenu(event, this._uiSourceCode);
    },

    __proto__: WebInspector.BaseNavigatorTreeElement.prototype
}

/**
 * @constructor
 * @param {string} id
 */
WebInspector.NavigatorTreeNode = function(id)
{
    this.id = id;
    /** @type {!StringMap.<!WebInspector.NavigatorTreeNode>} */
    this._children = new StringMap();
}

WebInspector.NavigatorTreeNode.prototype = {
    /**
     * @return {TreeElement}
     */
    treeElement: function() { },

    dispose: function() { },

    /**
     * @return {boolean}
     */
    isRoot: function()
    {
        return false;
    },

    /**
     * @return {boolean}
     */
    hasChildren: function()
    {
        return true;
    },

    populate: function()
    {
        if (this.isPopulated())
            return;
        if (this.parent)
            this.parent.populate();
        this._populated = true;
        this.wasPopulated();
    },

    wasPopulated: function()
    {
        var children = this.children();
        for (var i = 0; i < children.length; ++i)
            this.treeElement().appendChild(children[i].treeElement());
    },

    /**
     * @param {!WebInspector.NavigatorTreeNode} node
     */
    didAddChild: function(node)
    {
        if (this.isPopulated())
            this.treeElement().appendChild(node.treeElement());
    },

    /**
     * @param {!WebInspector.NavigatorTreeNode} node
     */
    willRemoveChild: function(node)
    {
        if (this.isPopulated())
            this.treeElement().removeChild(node.treeElement());
    },

    /**
     * @return {boolean}
     */
    isPopulated: function()
    {
        return this._populated;
    },

    /**
     * @return {boolean}
     */
    isEmpty: function()
    {
        return !this._children.size();
    },

    /**
     * @param {string} id
     * @return {WebInspector.NavigatorTreeNode}
     */
    child: function(id)
    {
        return this._children.get(id);
    },

    /**
     * @return {!Array.<!WebInspector.NavigatorTreeNode>}
     */
    children: function()
    {
        return this._children.values();
    },

    /**
     * @param {!WebInspector.NavigatorTreeNode} node
     */
    appendChild: function(node)
    {
        this._children.put(node.id, node);
        node.parent = this;
        this.didAddChild(node);
    },

    /**
     * @param {!WebInspector.NavigatorTreeNode} node
     */
    removeChild: function(node)
    {
        this.willRemoveChild(node);
        this._children.remove(node.id);
        delete node.parent;
        node.dispose();
    },

    reset: function()
    {
        this._children.clear();
    }
}

/**
 * @constructor
 * @extends {WebInspector.NavigatorTreeNode}
 * @param {WebInspector.NavigatorView} navigatorView
 */
WebInspector.NavigatorRootTreeNode = function(navigatorView)
{
    WebInspector.NavigatorTreeNode.call(this, "");
    this._navigatorView = navigatorView;
}

WebInspector.NavigatorRootTreeNode.prototype = {
    /**
     * @return {boolean}
     */
    isRoot: function()
    {
        return true;
    },

    /**
     * @return {TreeOutline}
     */
    treeElement: function()
    {
        return this._navigatorView._scriptsTree;
    },

    __proto__: WebInspector.NavigatorTreeNode.prototype
}

/**
 * @constructor
 * @extends {WebInspector.NavigatorTreeNode}
 * @param {WebInspector.NavigatorView} navigatorView
 * @param {WebInspector.UISourceCode} uiSourceCode
 */
WebInspector.NavigatorUISourceCodeTreeNode = function(navigatorView, uiSourceCode)
{
    WebInspector.NavigatorTreeNode.call(this, uiSourceCode.name());
    this._navigatorView = navigatorView;
    this._uiSourceCode = uiSourceCode;
    this._treeElement = null;
}

WebInspector.NavigatorUISourceCodeTreeNode.prototype = {
    /**
     * @return {WebInspector.UISourceCode}
     */
    uiSourceCode: function()
    {
        return this._uiSourceCode;
    },

    /**
     * @return {TreeElement}
     */
    treeElement: function()
    {
        if (this._treeElement)
            return this._treeElement;

        this._treeElement = new WebInspector.NavigatorSourceTreeElement(this._navigatorView, this._uiSourceCode, "");
        this.updateTitle();

        this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.TitleChanged, this._titleChanged, this);
        this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.WorkingCopyChanged, this._workingCopyChanged, this);
        this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.WorkingCopyCommitted, this._workingCopyCommitted, this);
        this._uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.FormattedChanged, this._formattedChanged, this);

        return this._treeElement;
    },

    /**
     * @param {boolean=} ignoreIsDirty
     */
    updateTitle: function(ignoreIsDirty)
    {
        if (!this._treeElement)
            return;

        var titleText = this._uiSourceCode.displayName();
        if (!ignoreIsDirty && (this._uiSourceCode.isDirty() || this._uiSourceCode.hasUnsavedCommittedChanges()))
            titleText = "*" + titleText;
        this._treeElement.titleText = titleText;
    },

    /**
     * @return {boolean}
     */
    hasChildren: function()
    {
        return false;
    },

    dispose: function()
    {
        if (!this._treeElement)
            return;
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.TitleChanged, this._titleChanged, this);
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.WorkingCopyChanged, this._workingCopyChanged, this);
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.WorkingCopyCommitted, this._workingCopyCommitted, this);
        this._uiSourceCode.removeEventListener(WebInspector.UISourceCode.Events.FormattedChanged, this._formattedChanged, this);
    },

    _titleChanged: function(event)
    {
        this.updateTitle();
    },

    _workingCopyChanged: function(event)
    {
        this.updateTitle();
    },

    _workingCopyCommitted: function(event)
    {
        this.updateTitle();
    },

    _formattedChanged: function(event)
    {
        this.updateTitle();
    },

    /**
     * @param {boolean=} select
     */
    reveal: function(select)
    {
        this.parent.populate();
        this.parent.treeElement().expand();
        this._treeElement.reveal();
        if (select)
            this._treeElement.select();
    },

    /**
     * @param {function(boolean)=} callback
     */
    rename: function(callback)
    {
        if (!this._treeElement)
            return;

        // Tree outline should be marked as edited as well as the tree element to prevent search from starting.
        var treeOutlineElement = this._treeElement.treeOutline.element;
        WebInspector.markBeingEdited(treeOutlineElement, true);

        function commitHandler(element, newTitle, oldTitle)
        {
            if (newTitle !== oldTitle) {
                this._treeElement.titleText = newTitle;
                this._uiSourceCode.rename(newTitle, renameCallback.bind(this));
                return;
            }
            afterEditing.call(this, true);
        }

        function renameCallback(success)
        {
            if (!success) {
                WebInspector.markBeingEdited(treeOutlineElement, false);
                this.updateTitle();
                this.rename(callback);
                return;
            }
            afterEditing.call(this, true);
        }

        function cancelHandler()
        {
            afterEditing.call(this, false);
        }

        /**
         * @param {boolean} committed
         */
        function afterEditing(committed)
        {
            WebInspector.markBeingEdited(treeOutlineElement, false);
            this.updateTitle();
            this._treeElement.treeOutline.childrenListElement.focus();
            if (callback)
                callback(committed);
        }

        var editingConfig = new WebInspector.EditingConfig(commitHandler.bind(this), cancelHandler.bind(this));
        this.updateTitle(true);
        WebInspector.startEditing(this._treeElement.titleElement, editingConfig);
        window.getSelection().setBaseAndExtent(this._treeElement.titleElement, 0, this._treeElement.titleElement, 1);
    },

    __proto__: WebInspector.NavigatorTreeNode.prototype
}

/**
 * @constructor
 * @extends {WebInspector.NavigatorTreeNode}
 * @param {WebInspector.NavigatorView} navigatorView
 * @param {WebInspector.Project} project
 * @param {string} id
 * @param {string} type
 * @param {string} folderPath
 * @param {string} title
 */
WebInspector.NavigatorFolderTreeNode = function(navigatorView, project, id, type, folderPath, title)
{
    WebInspector.NavigatorTreeNode.call(this, id);
    this._navigatorView = navigatorView;
    this._project = project;
    this._type = type;
    this._folderPath = folderPath;
    this._title = title;
}

WebInspector.NavigatorFolderTreeNode.prototype = {
    /**
     * @return {TreeElement}
     */
    treeElement: function()
    {
        if (this._treeElement)
            return this._treeElement;
        this._treeElement = this._createTreeElement(this._title, this);
        return this._treeElement;
    },

    /**
     * @return {TreeElement}
     */
    _createTreeElement: function(title, node)
    {
        var treeElement = new WebInspector.NavigatorFolderTreeElement(this._navigatorView, this._type, title);
        treeElement.setNode(node);
        return treeElement;
    },

    wasPopulated: function()
    {
        if (!this._treeElement || this._treeElement._node !== this)
            return;
        this._addChildrenRecursive();
    },

    _addChildrenRecursive: function()
    {
        var children = this.children();
        for (var i = 0; i < children.length; ++i) {
            var child = children[i];
            this.didAddChild(child);
            if (child instanceof WebInspector.NavigatorFolderTreeNode)
                child._addChildrenRecursive();
        }
    },

    _shouldMerge: function(node)
    {
        return this._type !== WebInspector.NavigatorTreeOutline.Types.Domain && node instanceof WebInspector.NavigatorFolderTreeNode;
    },

    didAddChild: function(node)
    {
        function titleForNode(node)
        {
            return node._title;
        }

        if (!this._treeElement)
            return;

        var children = this.children();

        if (children.length === 1 && this._shouldMerge(node)) {
            node._isMerged = true;
            this._treeElement.titleText = this._treeElement.titleText + "/" + node._title;
            node._treeElement = this._treeElement;
            this._treeElement.setNode(node);
            return;
        }

        var oldNode;
        if (children.length === 2)
            oldNode = children[0] !== node ? children[0] : children[1];
        if (oldNode && oldNode._isMerged) {
            delete oldNode._isMerged;
            var mergedToNodes = [];
            mergedToNodes.push(this);
            var treeNode = this;
            while (treeNode._isMerged) {
                treeNode = treeNode.parent;
                mergedToNodes.push(treeNode);
            }
            mergedToNodes.reverse();
            var titleText = mergedToNodes.map(titleForNode).join("/");

            var nodes = [];
            treeNode = oldNode;
            do {
                nodes.push(treeNode);
                children = treeNode.children();
                treeNode = children.length === 1 ? children[0] : null;
            } while (treeNode && treeNode._isMerged);

            if (!this.isPopulated()) {
                this._treeElement.titleText = titleText;
                this._treeElement.setNode(this);
                for (var i = 0; i < nodes.length; ++i) {
                    delete nodes[i]._treeElement;
                    delete nodes[i]._isMerged;
                }
                return;
            }
            var oldTreeElement = this._treeElement;
            var treeElement = this._createTreeElement(titleText, this);
            for (var i = 0; i < mergedToNodes.length; ++i)
                mergedToNodes[i]._treeElement = treeElement;
            oldTreeElement.parent.appendChild(treeElement);

            oldTreeElement.setNode(nodes[nodes.length - 1]);
            oldTreeElement.titleText = nodes.map(titleForNode).join("/");
            oldTreeElement.parent.removeChild(oldTreeElement);
            this._treeElement.appendChild(oldTreeElement);
            if (oldTreeElement.expanded)
                treeElement.expand();
        }
        if (this.isPopulated())
            this._treeElement.appendChild(node.treeElement());
    },

    willRemoveChild: function(node)
    {
        if (node._isMerged || !this.isPopulated())
            return;
        this._treeElement.removeChild(node._treeElement);
    },

    __proto__: WebInspector.NavigatorTreeNode.prototype
}
