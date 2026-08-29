var _ = require("underscore");

var promises = require("./promises");
var documents = require("./documents");
var htmlPaths = require("./styles/html-paths");
var results = require("./results");
var images = require("./images");
var Html = require("./html");
var writers = require("./writers");

exports.DocumentConverter = DocumentConverter;


function DocumentConverter(options) {
    return {
        convertToHtml: function(element) {
            var comments = _.indexBy(
                element.type === documents.types.document ? element.comments : [],
                "commentId"
            );
            var conversion = new DocumentConversion(options, comments);
            return conversion.convertToHtml(element);
        }
    };
}

function DocumentConversion(options, comments) {
    var noteNumber = 1;

    var noteReferences = [];

    var referencedComments = [];

    var listCounters = Object.create(null);
    var lastParagraphNumberingKey = null;
    var listStartForCurrentParagraph = null;

    options = _.extend({ignoreEmptyParagraphs: true}, options);
    var idPrefix = options.idPrefix === undefined ? "" : options.idPrefix;
    var ignoreEmptyParagraphs = options.ignoreEmptyParagraphs;
    var includeHeadersAndFooters = options.includeHeadersAndFooters;

    var defaultParagraphStyle = htmlPaths.topLevelElement("p");

    var styleMap = options.styleMap || [];

    function convertToHtml(document) {
        var messages = [];

        var html = elementToHtml(document, messages, Object.create(null));

        var deferredNodes = [];
        walkHtml(html, function(node) {
            if (node.type === "deferred") {
                deferredNodes.push(node);
            }
        });
        var deferredValues = Object.create(null);
        return promises.mapSeries(deferredNodes, function(deferred) {
            return deferred.value().then(function(value) {
                deferredValues[deferred.id] = value;
            });
        }).then(function() {
            function replaceDeferred(nodes) {
                return flatMap(nodes, function(node) {
                    if (node.type === "deferred") {
                        return deferredValues[node.id];
                    } else if (node.children) {
                        return [
                            _.extend({}, node, {
                                children: replaceDeferred(node.children)
                            })
                        ];
                    } else {
                        return [node];
                    }
                });
            }
            var writer = writers.writer({
                prettyPrint: options.prettyPrint,
                outputFormat: options.outputFormat
            });
            var simplifiedHtml = Html.simplify(replaceDeferred(html));
            Html.write(writer, suppressMarkersForLabelledListItems(addStartToSplitOrderedLists(simplifiedHtml)));
            return new results.Result(writer.asString(), messages);
        });
    }

    function convertElements(elements, messages, options) {
        return flatMap(elements, function(element) {
            return elementToHtml(element, messages, options);
        });
    }

    function elementToHtml(element, messages, options) {
        if (!options) {
            throw new Error("options not set");
        }
        var handler = elementConverters[element.type];
        if (handler) {
            return handler(element, messages, options);
        } else {
            return [];
        }
    }

    function convertParagraph(element, messages, options) {
        var listLabel = listLabelForParagraph(element);
        var nodes = htmlPathForParagraph(element, messages).wrap(function() {
            var content = convertElements(element.children, messages, options);
            if (ignoreEmptyParagraphs) {
                return content;
            } else {
                return [Html.forceWrite].concat(content);
            }
        });
        if (element.listBreak) {
            nodes = [Html.forceWrite].concat(nodes);
        }
        if (listStartForCurrentParagraph !== null) {
            nodes = addStartMarkerToFirstListItem(nodes, listStartForCurrentParagraph);
        }
        if (listLabel !== null) {
            nodes = addLabelToCurrentListItem(nodes, listLabel);
        }
        lastParagraphNumberingKey = element.numbering ? numberingKey(element) : null;
        return nodes;
    }

    function listLabelForParagraph(element) {
        listStartForCurrentParagraph = null;

        if (options.outputFormat === "markdown") {
            return null;
        }

        var numbering = element.numbering;
        if (!numbering || !numbering.isOrdered) {
            return null;
        }

        var level = parseInt(numbering.level, 10);
        if (isNaN(level)) {
            return null;
        }

        var key = numberingKey(element);
        var counters = listCounters[key] || [];
        listCounters[key] = counters;
        var continuesPreviousList = lastParagraphNumberingKey === key;

        if (counters[level] == null) {
            counters[level] = numberingStart(numbering) - 1;
        }
        counters[level]++;
        counters.length = level + 1;

        var numberingStartsList = !continuesPreviousList && level === 0;
        if (numberingStartsList && counters[level] !== 1) {
            listStartForCurrentParagraph = counters[level];
        }

        var levelText = numbering.levelText;
        if (levelText == null) {
            return null;
        }

        if (!needsExplicitLevelText(numbering, levelText, level)) {
            return null;
        }

        return levelText.replace(/%([0-9]+)/g, function(match, levelNumber) {
            var referencedLevel = parseInt(levelNumber, 10) - 1;
            var counter = counters[referencedLevel] == null ? 0 : counters[referencedLevel];
            return formatNumber(counter, numFmtForLevel(numbering, referencedLevel));
        });
    }

    function needsExplicitLevelText(numbering, levelText, level) {
        return isCompoundLevelText(levelText) ||
            !isDefaultLevelText(levelText, level) ||
            !isDefaultNumberFormat(numFmtForLevel(numbering, level));
    }

    function isDefaultLevelText(levelText, level) {
        var levelReference = "%" + (level + 1);
        return levelText === levelReference || levelText === levelReference + ".";
    }

    function isDefaultNumberFormat(numFmt) {
        return numFmt == null || numFmt === "decimal";
    }

    function numFmtForLevel(numbering, level) {
        var levelDefinition = numbering.levelDefinitions && numbering.levelDefinitions[level.toString()];
        return levelDefinition ? levelDefinition.numFmt : numbering.numFmt;
    }

    function formatNumber(value, numFmt) {
        switch (numFmt) {
        case "upperLetter":
            return numberToLetter(value).toUpperCase();
        case "lowerLetter":
            return numberToLetter(value).toLowerCase();
        case "upperRoman":
            return numberToRoman(value).toUpperCase();
        case "lowerRoman":
            return numberToRoman(value).toLowerCase();
        case "decimalZero":
            return value > 0 && value < 10 ? "0" + value : value.toString();
        default:
            return value.toString();
        }
    }

    function numberToLetter(value) {
        var result = "";
        while (value > 0) {
            value--;
            result = String.fromCharCode(65 + value % 26) + result;
            value = Math.floor(value / 26);
        }
        return result || "0";
    }

    function numberToRoman(value) {
        var romanNumerals = [
            {value: 1000, symbol: "M"},
            {value: 900, symbol: "CM"},
            {value: 500, symbol: "D"},
            {value: 400, symbol: "CD"},
            {value: 100, symbol: "C"},
            {value: 90, symbol: "XC"},
            {value: 50, symbol: "L"},
            {value: 40, symbol: "XL"},
            {value: 10, symbol: "X"},
            {value: 9, symbol: "IX"},
            {value: 5, symbol: "V"},
            {value: 4, symbol: "IV"},
            {value: 1, symbol: "I"}
        ];
        var result = "";
        romanNumerals.forEach(function(romanNumeral) {
            while (value >= romanNumeral.value) {
                result += romanNumeral.symbol;
                value -= romanNumeral.value;
            }
        });
        return result || "0";
    }

    function numberingKey(element) {
        if (element.numbering.numId != null) {
            return "num:" + element.numbering.numId;
        } else if (element.styleId != null) {
            return "style:" + element.styleId;
        } else {
            return "default";
        }
    }

    function numberingStart(numbering) {
        var start = parseInt(numbering.start, 10);
        return isNaN(start) ? 1 : start;
    }

    function isCompoundLevelText(levelText) {
        if (levelText == null) {
            return false;
        }

        var referencedLevels = {};
        var match;
        var pattern = /%([0-9]+)/g;
        while ((match = pattern.exec(levelText)) !== null) {
            referencedLevels[match[1]] = true;
        }
        return _.keys(referencedLevels).length > 1;
    }

    function addStartToSplitOrderedLists(nodes) {
        return transform(nodes);

        function transform(nodes) {
            return nodes.map(function(node) {
                if (node.type !== "element") {
                    return node;
                }

                var children = transform(node.children);
                node = Html.elementWithTag(node.tag, children);

                if (node.tag.tagName === "ol") {
                    var start = hasListStartMarker(children[0])
                        ? children[0].children[0].tag.attributes["data-mammoth-list-start"]
                        : null;
                    children = children.map(removeListStartMarker);
                    node = Html.elementWithTag(node.tag, children);
                    return start == null ? node : copyTagWithAttributes(node, {start: start});
                } else {
                    return node;
                }
            });
        }
    }

    function removeListStartMarker(node) {
        if (hasListStartMarker(node)) {
            return Html.elementWithTag(node.tag, node.children.slice(1));
        } else {
            return node;
        }
    }

    function addStartMarkerToFirstListItem(nodes, start) {
        var hasAddedStart = false;
        return nodes.map(addStartMarker);

        function addStartMarker(node) {
            if (hasAddedStart || node.type !== "element") {
                return node;
            }

            if (node.tag.tagName === "li") {
                hasAddedStart = true;
                return Html.elementWithTag(node.tag, [
                    Html.nonFreshElement("span", {
                        "data-mammoth-list-start": start.toString()
                    }, [Html.text(" ")])
                ].concat(node.children));
            } else {
                var children = node.children.map(addStartMarker);
                return hasAddedStart ? Html.elementWithTag(node.tag, children) : node;
            }
        }
    }

    function hasListStartMarker(node) {
        return node &&
            node.type === "element" &&
            node.tag.tagName === "li" &&
            node.children.length > 0 &&
            node.children[0].type === "element" &&
            node.children[0].tag.attributes["data-mammoth-list-start"] != null;
    }

    function addLabelToCurrentListItem(nodes, label) {
        return nodes.map(function(node) {
            if (node.type !== "element") {
                return node;
            }

            var children = addLabelToCurrentListItem(node.children, label);
            var tag = node.tag;
            if (tag.tagName === "li" && !containsElementWithTag(children, "li")) {
                children = [
                    Html.nonFreshElement("span", {
                        "class": "mammoth-list-number",
                        "data-mammoth-list-number": "true"
                    }, [Html.text(label + " ")])
                ].concat(children);
            }
            return Html.elementWithTag(tag, children);
        });
    }

    function suppressMarkersForLabelledListItems(nodes) {
        return nodes.map(function(node) {
            if (node.type !== "element") {
                return node;
            }

            var children = suppressMarkersForLabelledListItems(node.children);
            var tag = node.tag;
            if (tag.tagName === "li" && hasListNumberChild(children)) {
                tag = copyTagWithStyle(tag, "list-style-type: none");
            }
            return Html.elementWithTag(tag, children);
        });
    }

    function hasListNumberChild(nodes) {
        return _.any(nodes, function(node) {
            return node.type === "element" &&
                node.tag.tagName === "span" &&
                node.tag.attributes["data-mammoth-list-number"] === "true";
        });
    }

    function containsElementWithTag(nodes, tagName) {
        return _.any(nodes, function(node) {
            return node.type === "element" &&
                (node.tag.tagName === tagName || containsElementWithTag(node.children, tagName));
        });
    }

    function copyTagWithStyle(tag, style) {
        var attributes = _.extend({}, tag.attributes);
        attributes.style = attributes.style ? attributes.style + "; " + style : style;
        return htmlPaths.element(tag.tagName, attributes, {
            fresh: tag.fresh,
            separator: tag.separator
        });
    }

    function copyTagWithAttributes(node, extraAttributes) {
        var attributes = _.extend({}, node.tag.attributes);
        _.each(extraAttributes, function(value, key) {
            if (value == null) {
                delete attributes[key];
            } else {
                attributes[key] = value;
            }
        });
        return Html.elementWithTag(htmlPaths.element(node.tag.tagName, attributes, {
            fresh: node.tag.fresh,
            separator: node.tag.separator
        }), node.children);
    }

    function htmlPathForParagraph(element, messages) {
        var style = findStyle(element);

        if (style) {
            return style.to;
        } else {
            if (element.styleId) {
                messages.push(unrecognisedStyleWarning("paragraph", element));
            }
            return defaultParagraphStyle;
        }
    }

    function convertRun(run, messages, options) {
        var nodes = function() {
            return convertElements(run.children, messages, options);
        };
        var paths = [];
        if (run.highlight !== null) {
            var path = findHtmlPath({type: "highlight", color: run.highlight});
            if (path) {
                paths.push(path);
            }
        }
        if (run.isSmallCaps) {
            paths.push(findHtmlPathForRunProperty("smallCaps"));
        }
        if (run.isAllCaps) {
            paths.push(findHtmlPathForRunProperty("allCaps"));
        }
        if (run.isStrikethrough) {
            paths.push(findHtmlPathForRunProperty("strikethrough", "s"));
        }
        if (run.isUnderline) {
            paths.push(findHtmlPathForRunProperty("underline"));
        }
        if (run.verticalAlignment === documents.verticalAlignment.subscript) {
            paths.push(htmlPaths.element("sub", {}, {fresh: false}));
        }
        if (run.verticalAlignment === documents.verticalAlignment.superscript) {
            paths.push(htmlPaths.element("sup", {}, {fresh: false}));
        }
        if (run.isItalic) {
            paths.push(findHtmlPathForRunProperty("italic", "em"));
        }
        if (run.isBold) {
            paths.push(findHtmlPathForRunProperty("bold", "strong"));
        }
        var stylePath = htmlPaths.empty;
        var style = findStyle(run);
        if (style) {
            stylePath = style.to;
        } else if (run.styleId) {
            messages.push(unrecognisedStyleWarning("run", run));
        }
        paths.push(stylePath);

        paths.forEach(function(path) {
            nodes = path.wrap.bind(path, nodes);
        });

        return nodes();
    }

    function findHtmlPathForRunProperty(elementType, defaultTagName) {
        var path = findHtmlPath({type: elementType});
        if (path) {
            return path;
        } else if (defaultTagName) {
            return htmlPaths.element(defaultTagName, {}, {fresh: false});
        } else {
            return htmlPaths.empty;
        }
    }

    function findHtmlPath(element, defaultPath) {
        var style = findStyle(element);
        return style ? style.to : defaultPath;
    }

    function findStyle(element) {
        for (var i = 0; i < styleMap.length; i++) {
            if (styleMap[i].from.matches(element)) {
                return styleMap[i];
            }
        }
    }

    function recoveringConvertImage(convertImage) {
        return function(image, messages) {
            return promises.attempt(function() {
                return convertImage(image, messages);
            }).caught(function(error) {
                messages.push(results.error(error));
                return [];
            });
        };
    }

    function noteHtmlId(note) {
        return referentHtmlId(note.noteType, note.noteId);
    }

    function noteRefHtmlId(note) {
        return referenceHtmlId(note.noteType, note.noteId);
    }

    function referentHtmlId(referenceType, referenceId) {
        return htmlId(referenceType + "-" + referenceId);
    }

    function referenceHtmlId(referenceType, referenceId) {
        return htmlId(referenceType + "-ref-" + referenceId);
    }

    function htmlId(suffix) {
        return idPrefix + suffix;
    }

    var defaultTablePath = htmlPaths.elements([
        htmlPaths.element("table", {}, {fresh: true})
    ]);

    function convertTable(element, messages, options) {
        return findHtmlPath(element, defaultTablePath).wrap(function() {
            return convertTableChildren(element, messages, options);
        });
    }

    function convertTableChildren(element, messages, options) {
        var bodyIndex = _.findIndex(element.children, function(child) {
            return !child.type === documents.types.tableRow || !child.isHeader;
        });
        if (bodyIndex === -1) {
            bodyIndex = element.children.length;
        }
        var children;
        if (bodyIndex === 0) {
            children = convertElements(
                element.children,
                messages,
                _.extend({}, options, {isTableHeader: false})
            );
        } else {
            var headRows = convertElements(
                element.children.slice(0, bodyIndex),
                messages,
                _.extend({}, options, {isTableHeader: true})
            );
            var bodyRows = convertElements(
                element.children.slice(bodyIndex),
                messages,
                _.extend({}, options, {isTableHeader: false})
            );
            children = [
                Html.freshElement("thead", {}, headRows),
                Html.freshElement("tbody", {}, bodyRows)
            ];
        }
        return [Html.forceWrite].concat(children);
    }

    function convertTableRow(element, messages, options) {
        var children = convertElements(element.children, messages, options);
        return [
            Html.freshElement("tr", {}, [Html.forceWrite].concat(children))
        ];
    }

    function convertTableCell(element, messages, options) {
        var tagName = options.isTableHeader ? "th" : "td";
        var children = convertElements(element.children, messages, options);
        var attributes = {};
        if (element.colSpan !== 1) {
            attributes.colspan = element.colSpan.toString();
        }
        if (element.rowSpan !== 1) {
            attributes.rowspan = element.rowSpan.toString();
        }

        return [
            Html.freshElement(tagName, attributes, [Html.forceWrite].concat(children))
        ];
    }

    function convertCommentReference(reference, messages, options) {
        return findHtmlPath(reference, htmlPaths.ignore).wrap(function() {
            var comment = comments[reference.commentId];
            var count = referencedComments.length + 1;
            var label = "[" + commentAuthorLabel(comment) + count + "]";
            referencedComments.push({label: label, comment: comment});
            // TODO: remove duplication with note references
            return [
                Html.freshElement("a", {
                    href: "#" + referentHtmlId("comment", reference.commentId),
                    id: referenceHtmlId("comment", reference.commentId)
                }, [Html.text(label)])
            ];
        });
    }

    function convertComment(referencedComment, messages, options) {
        // TODO: remove duplication with note references

        var label = referencedComment.label;
        var comment = referencedComment.comment;
        var body = convertElements(comment.body, messages, options).concat([
            Html.nonFreshElement("p", {}, [
                Html.text(" "),
                Html.freshElement("a", {"href": "#" + referenceHtmlId("comment", comment.commentId)}, [
                    Html.text("↑")
                ])
            ])
        ]);

        return [
            Html.freshElement(
                "dt",
                {"id": referentHtmlId("comment", comment.commentId)},
                [Html.text("Comment " + label)]
            ),
            Html.freshElement("dd", {}, body)
        ];
    }

    function convertBreak(element, messages, options) {
        return htmlPathForBreak(element).wrap(function() {
            return [];
        });
    }

    function htmlPathForBreak(element) {
        var style = findStyle(element);
        if (style) {
            return style.to;
        } else if (element.breakType === "line") {
            return htmlPaths.topLevelElement("br");
        } else {
            return htmlPaths.empty;
        }
    }

    function convertHeader(header, messages, options) {
        if (!includeHeadersAndFooters) {
            return [];
        }

        var children = convertElements(header.children, messages, options);
        return Html.freshElement("header", {}, children);
    }

    function convertFooter(footer, messages, options) {
        if (!includeHeadersAndFooters) {
            return [];
        }

        var children = convertElements(footer.children, messages, options);
        return Html.freshElement("footer", {}, children);
    }

    var elementConverters = {
        "document": function(document, messages, options) {
            var children = convertElements(document.children, messages, options);
            var notes = noteReferences.map(function(noteReference) {
                return document.notes.resolve(noteReference);
            });
            var notesNodes = convertElements(notes, messages, options);
            var headers = convertElements(document.headers || [], messages, options);
            var footers = convertElements(document.footers || [], messages, options);
            return headers.concat(children).concat([
                Html.freshElement("ol", {}, notesNodes),
                Html.freshElement("dl", {}, flatMap(referencedComments, function(referencedComment) {
                    return convertComment(referencedComment, messages, options);
                }))
            ]).concat(footers);
        },
        "paragraph": convertParagraph,
        "run": convertRun,
        "text": function(element, messages, options) {
            return [Html.text(element.value)];
        },
        "tab": function(element, messages, options) {
            return [Html.text("\t")];
        },
        "hyperlink": function(element, messages, options) {
            var href = element.anchor ? "#" + htmlId(element.anchor) : element.href;
            var attributes = {href: href};
            if (element.targetFrame != null) {
                attributes.target = element.targetFrame;
            }

            var children = convertElements(element.children, messages, options);
            return [Html.nonFreshElement("a", attributes, children)];
        },
        "checkbox": function(element) {
            var attributes = {type: "checkbox"};
            if (element.checked) {
                attributes["checked"] = "checked";
            }
            return [Html.freshElement("input", attributes)];
        },
        "bookmarkStart": function(element, messages, options) {
            var anchor = Html.freshElement("a", {
                id: htmlId(element.name)
            }, [Html.forceWrite]);
            return [anchor];
        },
        "noteReference": function(element, messages, options) {
            noteReferences.push(element);
            var anchor = Html.freshElement("a", {
                href: "#" + noteHtmlId(element),
                id: noteRefHtmlId(element)
            }, [Html.text("[" + (noteNumber++) + "]")]);

            return [Html.freshElement("sup", {}, [anchor])];
        },
        "note": function(element, messages, options) {
            var children = convertElements(element.body, messages, options);
            var backLink = Html.elementWithTag(htmlPaths.element("p", {}, {fresh: false}), [
                Html.text(" "),
                Html.freshElement("a", {href: "#" + noteRefHtmlId(element)}, [Html.text("↑")])
            ]);
            var body = children.concat([backLink]);

            return Html.freshElement("li", {id: noteHtmlId(element)}, body);
        },
        "commentReference": convertCommentReference,
        "comment": convertComment,
        "image": deferredConversion(recoveringConvertImage(options.convertImage || images.dataUri)),
        "table": convertTable,
        "tableRow": convertTableRow,
        "tableCell": convertTableCell,
        "break": convertBreak,
        "header": convertHeader,
        "footer": convertFooter
    };
    return {
        convertToHtml: convertToHtml
    };
}

var deferredId = 1;

function deferredConversion(func) {
    return function(element, messages, options) {
        return [
            {
                type: "deferred",
                id: deferredId++,
                value: function() {
                    return func(element, messages, options);
                }
            }
        ];
    };
}

function unrecognisedStyleWarning(type, element) {
    return results.warning(
        "Unrecognised " + type + " style: '" + element.styleName + "'" +
        " (Style ID: " + element.styleId + ")"
    );
}

function flatMap(values, func) {
    return _.flatten(values.map(func), true);
}

function walkHtml(nodes, callback) {
    nodes.forEach(function(node) {
        callback(node);
        if (node.children) {
            walkHtml(node.children, callback);
        }
    });
}

var commentAuthorLabel = exports.commentAuthorLabel = function commentAuthorLabel(comment) {
    return comment.authorInitials || "";
};
