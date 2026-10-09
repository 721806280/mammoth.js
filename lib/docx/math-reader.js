var _ = require("underscore");
var documents = require("../documents");
var Result = require("../results").Result;
var warning = require("../results").warning;

exports.read = read;

function read(root) {
    var messages = [];
    var alignment = root.firstOrEmpty("m:oMathParaPr").firstOrEmpty("m:jc").attributes["m:val"];
    var math = documents.Math(readChildren(root, messages), {
        attributes: {display: root.name === "m:oMathPara" ? "block" : "inline"},
        alignment: alignment === "centerGroup" ? "center" : alignment
    });
    return new Result(math, messages);
}

function node(name, attributes, children) {
    return documents.Math(children, {name: name, attributes: attributes});
}

function readChildren(element, messages) {
    return _.flatten(element.children.map(function(child) {
        return readElement(child, messages);
    }), true);
}

function readElement(element, messages) {
    if (element.type !== "element" || /Pr$/.test(element.name)) {
        return [];
    }
    var properties = element.firstOrEmpty(element.name + "Pr");

    function property(name, fallback) {
        var value = properties.firstOrEmpty("m:" + name).attributes["m:val"];
        return value === undefined ? fallback : value;
    }

    function booleanProperty(name, fallback) {
        var propertyElement = properties.first("m:" + name);
        return propertyElement ? readBooleanElement(propertyElement) : fallback;
    }

    function row(name) {
        return node("mrow", {}, readChildren(element.firstOrEmpty("m:" + name), messages));
    }

    function operator(value, attributes) {
        return node("mo", attributes || {}, [documents.Text(value)]);
    }

    switch (element.name) {
    case "m:r":
        return readRun(element);
    case "m:t":
    case "w:t":
        return readTokens(element.text(), {});
    case "m:f":
        if (property("type") === "lin" || property("type") === "skw") {
            return [node("mrow", {}, [row("num"), operator("/"), row("den")])];
        }
        return [node("mfrac", property("type") === "noBar" ? {linethickness: "0"} : {}, [row("num"), row("den")])];
    case "m:sSub":
        return [node("msub", {}, [row("e"), row("sub")])];
    case "m:sSup":
        return [node("msup", {}, [row("e"), row("sup")])];
    case "m:sSubSup":
        return [node("msubsup", {}, [row("e"), row("sub"), row("sup")])];
    case "m:sPre":
        return [node("mmultiscripts", {}, [row("e"), node("mprescripts", {}, []), row("sub"), row("sup")])];
    case "m:rad":
        if (booleanProperty("degHide", false) || !element.firstOrEmpty("m:deg").children.length) {
            return [node("msqrt", {}, [row("e")])];
        }
        return [node("mroot", {}, [row("e"), row("deg")])];
    case "m:d":
        var delimiters = [];
        var begin = property("begChr", "(");
        var end = property("endChr", ")");
        var separator = property("sepChr", "|");
        var fenceAttributes = {fence: "true", stretchy: booleanProperty("grow", true) ? "true" : "false"};
        if (begin) {
            delimiters.push(operator(begin, fenceAttributes));
        }
        element.getElementsByTagName("m:e").forEach(function(argument, index) {
            if (index && separator) {
                delimiters.push(operator(separator, {separator: "true", stretchy: "true"}));
            }
            delimiters.push(node("mrow", {}, readChildren(argument, messages)));
        });
        if (end) {
            delimiters.push(operator(end, fenceAttributes));
        }
        return [node("mrow", {}, delimiters)];
    case "m:nary":
        var nary = operator(property("chr", "∫"), {largeop: "true"});
        var sub = !booleanProperty("subHide", false) && element.firstOrEmpty("m:sub").children.length;
        var sup = !booleanProperty("supHide", false) && element.firstOrEmpty("m:sup").children.length;
        var underOver = property("limLoc") === "undOvr";
        if (sub && sup) {
            nary = node(underOver ? "munderover" : "msubsup", {}, [nary, row("sub"), row("sup")]);
        } else if (sub) {
            nary = node(underOver ? "munder" : "msub", {}, [nary, row("sub")]);
        } else if (sup) {
            nary = node(underOver ? "mover" : "msup", {}, [nary, row("sup")]);
        }
        return [node("mrow", {}, [nary, row("e")])];
    case "m:limLow":
    case "m:limUpp":
        return [node(element.name === "m:limLow" ? "munder" : "mover", {}, [row("e"), row("lim")])];
    case "m:func":
        return [node("mrow", {}, [row("fName"), operator("\u2061"), row("e")])];
    case "m:acc":
        return [node("mover", {accent: "true"}, [row("e"), operator(property("chr", "\u0302"), {stretchy: "true"})])];
    case "m:bar":
    case "m:groupChr":
        var above = property("pos", "bot") === "top";
        var defaultChar = element.name === "m:bar" ? (above ? "‾" : "_") : "⏟";
        return [node(above ? "mover" : "munder", above ? {accent: "true"} : {accentunder: "true"}, [
            row("e"), operator(property("chr", defaultChar), {stretchy: "true"})
        ])];
    case "m:m":
        return [node("mtable", {}, element.getElementsByTagName("m:mr").map(function(matrixRow) {
            return node("mtr", {}, matrixRow.getElementsByTagName("m:e").map(function(cell) {
                return node("mtd", {}, readChildren(cell, messages));
            }));
        }))];
    case "m:eqArr":
        return [node("mtable", {columnalign: "left"}, element.getElementsByTagName("m:e").map(function(equation) {
            return node("mtr", {}, [node("mtd", {}, readChildren(equation, messages))]);
        }))];
    case "m:phant":
        return [node("mphantom", {}, [row("e")])];
    case "m:box":
        return [row("e")];
    case "m:oMath":
    case "m:oMathPara":
    case "m:e":
    case "w:r":
    case "w:ins":
        return readChildren(element, messages);
    default:
        if (element.name.indexOf("m:") === 0) {
            messages.push(warning("An unrecognised equation element was read using its contents: " + element.name));
            return readChildren(element, messages);
        }
        return [];
    }
}

function readBooleanElement(element) {
    if (element) {
        var value = element.attributes["m:val"];
        return value !== "false" && value !== "0" && value !== "off";
    } else {
        return false;
    }
}

function readRun(element) {
    var properties = element.firstOrEmpty("m:rPr");
    var normal = properties.first("m:nor");
    var text = element.children.filter(function(child) {
        return child.name === "m:t" || child.name === "w:t";
    }).map(function(child) {
        return child.text();
    }).join("");
    if (readBooleanElement(normal)) {
        return [node("mtext", {}, [documents.Text(text)])];
    }
    var style = properties.firstOrEmpty("m:sty").attributes["m:val"];
    var variants = {p: "normal", b: "bold", i: "italic", bi: "bold-italic"};
    var attributes = Object.prototype.hasOwnProperty.call(variants, style) ? {mathvariant: variants[style]} : {};
    return readTokens(text, attributes);
}

function readTokens(text, attributes) {
    var tokens = text.match(/[0-9]+(?:\.[0-9]+)?|\s+|[\u2e80-\u9fff\uf900-\ufaff]+|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S]/g) || [];
    return tokens.map(function(token) {
        var tag;
        if (/^[0-9]/.test(token)) {
            tag = "mn";
        } else if (/^[\s\u2e80-\u9fff\uf900-\ufaff]/.test(token)) {
            tag = "mtext";
        } else if (/^[+\-*/=<>()[\]{}|,;:!%\u00b1\u00b7\u00d7\u00f7\u2010-\u2027\u2190-\u22ff]$/.test(token)) {
            tag = "mo";
        } else {
            tag = "mi";
        }
        return node(tag, attributes, [documents.Text(token.replace(/ /g, "\u00a0"))]);
    });
}
