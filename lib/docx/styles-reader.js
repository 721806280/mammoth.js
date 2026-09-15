exports.readStylesXml = readStylesXml;
exports.Styles = Styles;
exports.defaultStyles = new Styles({}, {});

function Styles(paragraphStyles, characterStyles, tableStyles, numberingStyles, paragraphDefaults) {
    paragraphStyles = paragraphStyles || Object.create(null);
    characterStyles = characterStyles || Object.create(null);
    tableStyles = tableStyles || Object.create(null);
    numberingStyles = numberingStyles || Object.create(null);
    paragraphDefaults = paragraphDefaults || {};

    return {
        findParagraphStyleById: function(styleId) {
            return paragraphStyles[styleId];
        },
        findParagraphAlignmentById: function(styleId) {
            var visited = Object.create(null);
            styleId = styleId || paragraphDefaults.styleId;
            while (styleId && !visited[styleId]) {
                visited[styleId] = true;
                var style = paragraphStyles[styleId];
                if (!style) {
                    break;
                }
                if (style.alignment !== undefined) {
                    return style.alignment;
                }
                styleId = style.basedOn;
            }
            return paragraphDefaults.alignment;
        },
        findCharacterStyleById: function(styleId) {
            return characterStyles[styleId];
        },
        findTableStyleById: function(styleId) {
            return tableStyles[styleId];
        },
        findNumberingStyleById: function(styleId) {
            return numberingStyles[styleId];
        }
    };
}

Styles.EMPTY = new Styles({}, {}, {}, {});

function readStylesXml(root) {
    var paragraphStyles = Object.create(null);
    var characterStyles = Object.create(null);
    var tableStyles = Object.create(null);
    var numberingStyles = Object.create(null);
    var paragraphDefaults = {
        alignment: root.firstOrEmpty("w:docDefaults")
            .firstOrEmpty("w:pPrDefault").firstOrEmpty("w:pPr")
            .firstOrEmpty("w:jc").attributes["w:val"]
    };

    root.getElementsByTagName("w:style").forEach(function(styleElement) {
        var style = readStyleElement(styleElement);
        var styleSet;

        switch (style.type) {
        case "paragraph":
            styleSet = paragraphStyles;
            if (/^(1|true|on)$/.test(styleElement.attributes["w:default"])) {
                paragraphDefaults.styleId = style.styleId;
            }
            break;

        case "character":
            styleSet = characterStyles;
            break;

        case "table":
            styleSet = tableStyles;
            break;

        case "numbering":
            styleSet = numberingStyles;
            break;
        }

        // Per 17.7.4.17 style (Style Definition) of ECMA-376 4th edition Part 1:
        //
        // > If multiple style definitions each declare the same value for their
        // > styleId, then the first such instance shall keep its current
        // > identifier with all other instances being reassigned in any manner
        // > desired.
        //
        // For the purpose of conversion, there's no point holding onto styles
        // with reassigned style IDs, so we ignore such style definitions.

        if (styleSet && styleSet[style.styleId] === undefined) {
            styleSet[style.styleId] = style;
        }
    });

    return new Styles(paragraphStyles, characterStyles, tableStyles, numberingStyles, paragraphDefaults);
}

function readStyleElement(styleElement) {
    var type = styleElement.attributes["w:type"];

    if (type === "numbering") {
        return readNumberingStyleElement(type, styleElement);
    } else {
        var styleId = readStyleId(styleElement);
        var name = styleName(styleElement);
        var style = {type: type, styleId: styleId, name: name};
        if (type === "paragraph") {
            style.alignment = styleElement.firstOrEmpty("w:pPr").firstOrEmpty("w:jc").attributes["w:val"];
            style.basedOn = styleElement.firstOrEmpty("w:basedOn").attributes["w:val"];
        }
        return style;
    }
}

function styleName(styleElement) {
    var nameElement = styleElement.first("w:name");
    return nameElement ? nameElement.attributes["w:val"] : null;
}

function readNumberingStyleElement(type, styleElement) {
    var styleId = readStyleId(styleElement);

    var numId = styleElement
        .firstOrEmpty("w:pPr")
        .firstOrEmpty("w:numPr")
        .firstOrEmpty("w:numId")
        .attributes["w:val"];

    return {type: type, numId: numId, styleId: styleId};
}

function readStyleId(styleElement) {
    return styleElement.attributes["w:styleId"];
}
