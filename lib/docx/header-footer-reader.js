var documents = require("../documents");
var Result = require("../results").Result;

exports.createHeaderReader = createReader.bind(this, documents.header);
exports.createFooterReader = createReader.bind(this, documents.footer);

function createReader(createElement, bodyReader) {
    function readHeaderFooterXml(element) {
        return Result.combine([readElement(element)]);
    }

    function readElement(element) {
        return bodyReader.readXmlElements(element.children)
            .map(function(children) {
                return createElement(children);
            });
    }

    return readHeaderFooterXml;
}
