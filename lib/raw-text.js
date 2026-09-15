var documents = require("./documents");
var mathToText = require("./math-to-text").convertToText;

function convertElementToRawText(element) {
    if (element.type === "text") {
        return element.value;
    } else if (element.type === documents.types.tab) {
        return "\t";
    } else if (element.type === documents.types.math) {
        return mathToText(element);
    } else {
        var tail = element.type === "paragraph" ? "\n\n" : "";
        return (element.children || []).map(convertElementToRawText).join("") + tail;
    }
}

exports.convertElementToRawText = convertElementToRawText;
