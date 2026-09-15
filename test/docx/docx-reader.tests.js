var assert = require("assert");

var docxReader = require("../../lib/docx/docx-reader");
var documents = require("../../lib/documents");
var xml = require("../../lib/xml");

var testing = require("../testing");
var test = require("../test")(module);
var testData = testing.testData;
var createFakeDocxFile = testing.createFakeDocxFile;


test("can read document with single paragraph with single run of text", function() {
    var expectedDocument = documents.Document([
        documents.Paragraph([
            documents.Run([
                documents.Text("Hello.")
            ])
        ])
    ]);
    var docxFile = createFakeDocxFile({
        "word/document.xml": testData("simple/word/document.xml")
    });
    return docxReader.read(docxFile).then(function(result) {
        assert.deepEqual(expectedDocument, result.value);
    });
});

test("hyperlink hrefs are read from relationships file", function() {
    var docxFile = createFakeDocxFile({
        "word/document.xml": testData("hyperlinks/word/document.xml"),
        "word/_rels/document.xml.rels": testData("hyperlinks/word/_rels/document.xml.rels")
    });
    return docxReader.read(docxFile).then(function(result) {
        var paragraph = result.value.children[0];
        assert.equal(1, paragraph.children.length);
        var hyperlink = paragraph.children[0];
        assert.equal(hyperlink.href, "http://www.example.com");
        assert.equal(hyperlink.children.length, 1);
    });
});

var relationshipNamespaces = {
    "r": "http://schemas.openxmlformats.org/package/2006/relationships"
};

var documentNamespaces = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
};

test("main document is found using _rels/.rels", function() {
    var relationships = xml.element("r:Relationships", {}, [
        xml.element("r:Relationship", {
            "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
            "Target": "/word/document2.xml"
        })
    ]);
    
    var docxFile = createFakeDocxFile({
        "word/document2.xml": testData("simple/word/document.xml"),
        "_rels/.rels": xml.writeString(relationships, relationshipNamespaces)
    });
    var expectedDocument = documents.Document([
        documents.Paragraph([
            documents.Run([
                documents.Text("Hello.")
            ])
        ])
    ]);
    return docxReader.read(docxFile).then(function(result) {
        assert.deepEqual(expectedDocument, result.value);
    });
});


test("error is thrown when main document part does not exist", function() {
    var relationships = xml.element("r:Relationships", {}, [
        xml.element("r:Relationship", {
            "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
            "Target": "/word/document2.xml"
        })
    ]);
    
    var docxFile = createFakeDocxFile({
        "_rels/.rels": xml.writeString(relationships, relationshipNamespaces)
    });
    return docxReader.read(docxFile).then(function(result) {
        assert.ok(false, "Expected error");
    }, function(error) {
        assert.equal(error.message, "Could not find main document part. Are you sure this is a valid .docx file?");
    });
});


test("part paths", {
    "main document part is found using package relationships": function() {
        var relationships = xml.element("r:Relationships", {}, [
            xml.element("r:Relationship", {
                "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
                "Target": "/word/document2.xml"
            })
        ]);
        
        var docxFile = createFakeDocxFile({
            "word/document2.xml": " ",
            "_rels/.rels": xml.writeString(relationships, relationshipNamespaces)
        });
        return docxReader._findPartPaths(docxFile).then(function(partPaths) {
            assert.equal(partPaths.mainDocument, "word/document2.xml");
        });
    },
    
    "word/document.xml is used as fallback location for main document part": function() {
        var docxFile = createFakeDocxFile({
            "word/document.xml": " "
        });
        return docxReader._findPartPaths(docxFile).then(function(partPaths) {
            assert.equal(partPaths.mainDocument, "word/document.xml");
        });
    }
});

[
    {
        name: "comments",
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments"
    },
    {
        name: "endnotes",
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes"
    },
    {
        name: "footnotes",
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes"
    },
    {
        name: "numbering",
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering"
    },
    {
        name: "styles",
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"
    }
].forEach(function(options) {
    test(options.name + " part is found using main document relationships", function() {
        var docxFile = createFakeDocxFile({
            "_rels/.rels": createPackageRelationships("word/document.xml"),
            "word/document.xml": " ",
            "word/_rels/document.xml.rels": xml.writeString(xml.element("r:Relationships", {}, [
                xml.element("r:Relationship", {
                    "Type": options.type,
                    "Target": "target-path.xml"
                })
            ]), relationshipNamespaces),
            "word/target-path.xml": " "
        });
        return docxReader._findPartPaths(docxFile).then(function(partPaths) {
            assert.equal(partPaths[options.name], "word/target-path.xml");
        });
    });

    test("word/" + options.name + ".xml is used as fallback location for " + options.name + " part", function() {
        var zipContents = {
            "_rels/.rels": createPackageRelationships("word/document.xml"),
            "word/document.xml": " "
        };
        zipContents["word/" + options.name + ".xml"] = " ";
        var docxFile = createFakeDocxFile(zipContents);
        return docxReader._findPartPaths(docxFile).then(function(partPaths) {
            assert.equal(partPaths[options.name], "word/" + options.name + ".xml");
        });
    });
});

test("referenced header and footer parts are found using main document relationships", function() {
    var docxFile = createFakeDocxFile({
        "_rels/.rels": createPackageRelationships("word/document.xml"),
        "word/document.xml": createDocumentWithHeaderFooterReferences([
            {name: "header", relationshipId: "rIdHeader1"},
            {name: "header", relationshipId: "rIdHeader2"},
            {name: "footer", relationshipId: "rIdFooter"}
        ]),
        "word/_rels/document.xml.rels": xml.writeString(xml.element("r:Relationships", {}, [
            xml.element("r:Relationship", {
                "Id": "rIdHeader1",
                "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",
                "Target": "header1.xml"
            }),
            xml.element("r:Relationship", {
                "Id": "rIdHeader2",
                "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",
                "Target": "header2.xml"
            }),
            xml.element("r:Relationship", {
                "Id": "rIdFooter",
                "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",
                "Target": "footer1.xml"
            }),
            xml.element("r:Relationship", {
                "Id": "rIdUnusedHeader",
                "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",
                "Target": "header3.xml"
            })
        ]), relationshipNamespaces),
        "word/header1.xml": " ",
        "word/header2.xml": " ",
        "word/header3.xml": " ",
        "word/footer1.xml": " "
    });
    return docxReader._findPartPaths(docxFile, {includeHeadersAndFooters: true}).then(function(partPaths) {
        assert.deepEqual(partPaths.headers, [
            "word/header1.xml",
            "word/header2.xml"
        ]);
        assert.deepEqual(partPaths.footers, ["word/footer1.xml"]);
    });
});

test("headers and footers are not read unless explicitly included", function() {
    var docxFile = createFakeDocxFile({
        "_rels/.rels": createPackageRelationships("word/document.xml"),
        "word/document.xml": createDocumentWithHeaderFooterReferences([
            {name: "header", relationshipId: "rIdHeader"}
        ]),
        "word/_rels/document.xml.rels": xml.writeString(xml.element("r:Relationships", {}, [
            xml.element("r:Relationship", {
                "Id": "rIdHeader",
                "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",
                "Target": "header1.xml"
            })
        ]), relationshipNamespaces),
        "word/header1.xml": xml.writeString(xml.element("w:hdr", {}, [
            xml.element("w:unsupportedHeaderElement", {}, [])
        ]), documentNamespaces)
    });
    return docxReader.read(docxFile).then(function(result) {
        assert.deepEqual(result.messages, []);
    });
});

test("headers and footers are read when explicitly included", function() {
    var docxFile = createFakeDocxFile({
        "_rels/.rels": createPackageRelationships("word/document.xml"),
        "word/document.xml": createDocumentWithHeaderFooterReferences([
            {name: "header", relationshipId: "rIdHeader"},
            {name: "footer", relationshipId: "rIdFooter"}
        ]),
        "word/_rels/document.xml.rels": xml.writeString(xml.element("r:Relationships", {}, [
            xml.element("r:Relationship", {
                "Id": "rIdHeader",
                "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",
                "Target": "header1.xml"
            }),
            xml.element("r:Relationship", {
                "Id": "rIdFooter",
                "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",
                "Target": "footer1.xml"
            })
        ]), relationshipNamespaces),
        "word/header1.xml": createHeaderFooterXml("hdr", "Header text"),
        "word/footer1.xml": createHeaderFooterXml("ftr", "Footer text")
    });
    return docxReader.read(docxFile, {}, {includeHeadersAndFooters: true}).then(function(result) {
        assert.deepEqual(result.value.headers, [
            documents.Header([
                documents.Paragraph([
                    documents.Run([
                        documents.Text("Header text")
                    ])
                ])
            ])
        ]);
        assert.deepEqual(result.value.footers, [
            documents.Footer([
                documents.Paragraph([
                    documents.Run([
                        documents.Text("Footer text")
                    ])
                ])
            ])
        ]);
        assert.deepEqual(result.messages, []);
    });
});


function createPackageRelationships(mainDocumentPath) {
    return xml.writeString(xml.element("r:Relationships", {}, [
        xml.element("r:Relationship", {
            "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
            "Target": mainDocumentPath
        })
    ]), relationshipNamespaces);
}

function createDocumentWithHeaderFooterReferences(references) {
    return xml.writeString(xml.element("w:document", {}, [
        xml.element("w:body", {}, [
            xml.element("w:sectPr", {}, references.map(function(reference) {
                return xml.element("w:" + reference.name + "Reference", {
                    "r:id": reference.relationshipId
                }, []);
            }))
        ])
    ]), documentNamespaces);
}

function createHeaderFooterXml(elementName, text) {
    return xml.writeString(xml.element("w:" + elementName, {}, [
        xml.element("w:p", {}, [
            xml.element("w:r", {}, [
                xml.element("w:t", {}, [
                    xml.text(text)
                ])
            ])
        ])
    ]), documentNamespaces);
}
