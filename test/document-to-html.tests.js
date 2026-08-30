var assert = require("assert");
var zlib = require("zlib");
var promises = require("../lib/promises");

var documents = require("../lib/documents");
var documentToHtml = require("../lib/document-to-html");
var DocumentConverter = documentToHtml.DocumentConverter;
var commentAuthorLabel = documentToHtml.commentAuthorLabel;
var test = require("./test")(module);
var htmlPaths = require("../lib/styles/html-paths");
var xml = require("../lib/xml");
var results = require("../lib/results");
var documentMatchers = require("../lib/styles/document-matchers");
var Html = require("../lib/html");


test('should empty document to empty string', function() {
    var document = new documents.Document([]);
    var converter = new DocumentConverter();
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, "");
    });
});

test('should convert document containing one paragraph to single p element', function() {
    var document = new documents.Document([
        paragraphOfText("Hello.")
    ]);
    var converter = new DocumentConverter();
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, "<p>Hello.</p>");
    });
});

test('ignores empty paragraphs', function() {
    var document = new documents.Document([
        paragraphOfText("")
    ]);
    var converter = new DocumentConverter();
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, "");
    });
});

test('paragraph bottom borders are written as HTML borders', function() {
    var document = new documents.Document([
        new documents.Paragraph([runOfText("Testing")], {
            borders: {
                bottom: {
                    style: "single",
                    size: "6",
                    space: "1",
                    color: "auto"
                }
            }
        })
    ]);
    var converter = new DocumentConverter();
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(
            result.value,
            '<p style="border-bottom: 1px solid currentColor; padding-bottom: 1pt">Testing</p>'
        );
    });
});

test('bordered empty paragraphs are preserved', function() {
    var document = new documents.Document([
        new documents.Paragraph([], {
            borders: {bottom: {style: "single"}}
        })
    ]);
    var converter = new DocumentConverter();
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, '<p style="border-bottom: 1px solid currentColor"></p>');
    });
});

test('text is HTML-escaped', function() {
    var document = new documents.Document([
        paragraphOfText("1 < 2")
    ]);
    var converter = new DocumentConverter();
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, "<p>1 &lt; 2</p>");
    });
});

test('should convert document containing multiple paragraphs to multiple p elements', function() {
    var document = new documents.Document([
        paragraphOfText("Hello."),
        paragraphOfText("Goodbye.")
    ]);
    var converter = new DocumentConverter();
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, "<p>Hello.</p><p>Goodbye.</p>");
    });
});

test('uses style mappings to pick HTML element for docx paragraph', function() {
    var document = new documents.Document([
        paragraphOfText("Hello.", "Heading1", "Heading 1")
    ]);
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.paragraph({styleName: documentMatchers.equalTo("Heading 1")}),
                to: htmlPaths.topLevelElement("h1")
            }
        ]
    });
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, "<h1>Hello.</h1>");
    });
});

test('mappings for style names are case insensitive', function() {
    var document = new documents.Document([
        paragraphOfText("Hello.", "Heading1", "heading 1")
    ]);
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.paragraph({styleName: documentMatchers.equalTo("Heading 1")}),
                to: htmlPaths.topLevelElement("h1")
            }
        ]
    });
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, "<h1>Hello.</h1>");
    });
});

test('can use non-default HTML element for unstyled paragraphs', function() {
    var document = new documents.Document([
        paragraphOfText("Hello.")
    ]);
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.paragraph(),
                to: htmlPaths.topLevelElement("h1")
            }
        ]
    });
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, "<h1>Hello.</h1>");
    });
});

test('warning is emitted if paragraph style is unrecognised', function() {
    var document = new documents.Document([
        paragraphOfText("Hello.", "Heading1", "Heading 1")
    ]);
    var converter = new DocumentConverter();
    return converter.convertToHtml(document).then(function(result) {
        assert.deepEqual(result.messages, [results.warning("Unrecognised paragraph style: 'Heading 1' (Style ID: Heading1)")]);
    });
});

test('can use stacked styles to generate nested HTML elements', function() {
    var document = new documents.Document([
        paragraphOfText("Hello.")
    ]);
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.paragraph(),
                to: htmlPaths.elements(["h1", "span"])
            }
        ]
    });
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, "<h1><span>Hello.</span></h1>");
    });
});

test('bold runs are wrapped in <strong> tags by default', function() {
    var run = runOfText("Hello.", {isBold: true});
    var converter = new DocumentConverter();
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<strong>Hello.</strong>");
    });
});

test('bold runs can be configured with style mapping', function() {
    var run = runOfText("Hello.", {isBold: true});
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.bold,
                to: htmlPaths.elements([htmlPaths.element("em")])
            }
        ]
    });
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<em>Hello.</em>");
    });
});

test('bold runs can exist inside other tags', function() {
    var run = new documents.Paragraph([
        runOfText("Hello.", {isBold: true})
    ]);
    var converter = new DocumentConverter();
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<p><strong>Hello.</strong></p>");
    });
});

test('consecutive bold runs are wrapped in a single <strong> element', function() {
    var paragraph = new documents.Paragraph([
        runOfText("Hello", {isBold: true}),
        runOfText(".", {isBold: true})
    ]);
    var converter = new DocumentConverter();
    return converter.convertToHtml(paragraph).then(function(result) {
        assert.equal(result.value, "<p><strong>Hello.</strong></p>");
    });
});

test('underline runs are ignored by default', function() {
    var run = runOfText("Hello.", {isUnderline: true});
    var converter = new DocumentConverter();
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "Hello.");
    });
});

test('underline runs can be mapped using style mapping', function() {
    var run = runOfText("Hello.", {isUnderline: true});
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.underline,
                to: htmlPaths.elements([htmlPaths.element("u")])
            }
        ]
    });
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<u>Hello.</u>");
    });
});

test('style mapping for underline runs does not close parent elements', function() {
    var run = runOfText("Hello.", {isUnderline: true, isBold: true});
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.underline,
                to: htmlPaths.elements([htmlPaths.element("u")])
            }
        ]
    });
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<strong><u>Hello.</u></strong>");
    });
});

test('strikethrough runs are wrapped in <s> tags by default', function() {
    var run = runOfText("Hello.", {isStrikethrough: true});
    var converter = new DocumentConverter();
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<s>Hello.</s>");
    });
});

test('strikethrough runs can be configured with style mapping', function() {
    var run = runOfText("Hello.", {isStrikethrough: true});
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.strikethrough,
                to: htmlPaths.elements([htmlPaths.element("del")])
            }
        ]
    });
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<del>Hello.</del>");
    });
});

test('italic runs are wrapped in <em> tags', function() {
    var run = runOfText("Hello.", {isItalic: true});
    var converter = new DocumentConverter();
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<em>Hello.</em>");
    });
});

test('italic runs can be configured with style mapping', function() {
    var run = runOfText("Hello.", {isItalic: true});
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.italic,
                to: htmlPaths.elements([htmlPaths.element("strong")])
            }
        ]
    });
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<strong>Hello.</strong>");
    });
});

test('run can be both bold and italic', function() {
    var run = runOfText("Hello.", {isBold: true, isItalic: true});
    var converter = new DocumentConverter();
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<strong><em>Hello.</em></strong>");
    });
});

test('superscript runs are wrapped in <sup> tags', function() {
    var run = runOfText("Hello.", {
        verticalAlignment: documents.verticalAlignment.superscript
    });
    var converter = new DocumentConverter();
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<sup>Hello.</sup>");
    });
});

test('subscript runs are wrapped in <sub> tags', function() {
    var run = runOfText("Hello.", {
        verticalAlignment: documents.verticalAlignment.subscript
    });
    var converter = new DocumentConverter();
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<sub>Hello.</sub>");
    });
});

test('all caps runs are ignored by default', function() {
    var run = runOfText("Hello.", {isAllCaps: true});
    var converter = new DocumentConverter();
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "Hello.");
    });
});

test('all caps runs can be configured with style mapping', function() {
    var run = runOfText("Hello.", {isAllCaps: true});
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.allCaps,
                to: htmlPaths.elements([htmlPaths.element("span")])
            }
        ]
    });
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<span>Hello.</span>");
    });
});


test('small caps runs are ignored by default', function() {
    var run = runOfText("Hello.", {isSmallCaps: true});
    var converter = new DocumentConverter();
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "Hello.");
    });
});

test('small caps runs can be configured with style mapping', function() {
    var run = runOfText("Hello.", {isSmallCaps: true});
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.smallCaps,
                to: htmlPaths.elements([htmlPaths.element("span")])
            }
        ]
    });
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<span>Hello.</span>");
    });
});


test('highlighted runs are ignored by default', function() {
    var run = runOfText("Hello.", {highlight: "yellow"});
    var converter = new DocumentConverter();
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "Hello.");
    });
});

test('highlighted runs can be configured with style mapping for all highlights', function() {
    var run = runOfText("Hello.", {highlight: "yellow"});
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.highlight(null),
                to: htmlPaths.elements([htmlPaths.element("mark")])
            }
        ]
    });
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<mark>Hello.</mark>");
    });
});

test('highlighted runs can be configured with style mapping for specific highlight color', function() {
    var paragraph = new documents.Paragraph([
        runOfText("Yellow", {highlight: "yellow"}),
        runOfText("Red", {highlight: "red"})
    ]);
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.highlight({color: "yellow"}),
                to: htmlPaths.elements([htmlPaths.element("mark", {"class": "yellow"})])
            },
            {
                from: documentMatchers.highlight({color: undefined}),
                to: htmlPaths.elements([htmlPaths.element("mark")])
            }
        ]
    });
    return converter.convertToHtml(paragraph).then(function(result) {
        assert.equal(result.value, '<p><mark class="yellow">Yellow</mark><mark>Red</mark></p>');
    });
});


test('run styles are converted to HTML if mapping exists', function() {
    var run = runOfText("Hello.", {styleId: "Heading1Char", styleName: "Heading 1 Char"});
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.run({styleName: documentMatchers.equalTo("Heading 1 Char")}),
                to: htmlPaths.elements(["strong"])
            }
        ]
    });
    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, "<strong>Hello.</strong>");
    });
});

test('warning is emitted if run style is unrecognised', function() {
    var run = runOfText("Hello.", {styleId: "Heading1Char", styleName: "Heading 1 Char"});
    var converter = new DocumentConverter();
    return converter.convertToHtml(run).then(function(result) {
        assert.deepEqual(result.messages, [results.warning("Unrecognised run style: 'Heading 1 Char' (Style ID: Heading1Char)")]);
    });
});

test('docx hyperlink is converted to <a>', function() {
    var hyperlink = new documents.Hyperlink(
        [runOfText("Hello.")],
        {href: "http://www.example.com"}
    );
    var converter = new DocumentConverter();
    return converter.convertToHtml(hyperlink).then(function(result) {
        assert.equal(result.value, '<a href="http://www.example.com">Hello.</a>');
    });
});

test('docx hyperlink can be collapsed', function() {
    var hyperlink = new documents.Document([
        new documents.Hyperlink(
            [runOfText("Hello ")],
            {href: "http://www.example.com"}
        ),
        new documents.Hyperlink(
            [runOfText("world")],
            {href: "http://www.example.com"}
        )
    ]);
    var converter = new DocumentConverter();
    return converter.convertToHtml(hyperlink).then(function(result) {
        assert.equal(result.value, '<a href="http://www.example.com">Hello world</a>');
    });
});

test('docx hyperlink with anchor is converted to <a>', function() {
    var hyperlink = new documents.Hyperlink(
        [runOfText("Hello.")],
        {anchor: "_Peter"}
    );
    var converter = new DocumentConverter({
        idPrefix: "doc-42-"
    });
    return converter.convertToHtml(hyperlink).then(function(result) {
        assert.equal(result.value, '<a href="#doc-42-_Peter">Hello.</a>');
    });
});

test('hyperlink target frame is used as anchor target', function() {
    var hyperlink = new documents.Hyperlink(
        [runOfText("Hello.")],
        {anchor: "start", targetFrame: "_blank"}
    );
    var converter = new DocumentConverter();
    return converter.convertToHtml(hyperlink).then(function(result) {
        assert.equal(result.value, '<a href="#start" target="_blank">Hello.</a>');
    });
});

test('unchecked checkbox is converted to unchecked checkbox input', function() {
    var checkbox = documents.checkbox({checked: false});
    var converter = new DocumentConverter();
    return converter.convertToHtml(checkbox).then(function(result) {
        assert.equal(result.value, '<input type="checkbox" />');
    });
});

test('checked checkbox is converted to checked checkbox input', function() {
    var checkbox = documents.checkbox({checked: true});
    var converter = new DocumentConverter();
    return converter.convertToHtml(checkbox).then(function(result) {
        assert.equal(result.value, '<input type="checkbox" checked="checked" />');
    });
});

test('bookmarks are converted to anchors', function() {
    var bookmarkStart = new documents.BookmarkStart({name: "_Peter"});
    var converter = new DocumentConverter({
        idPrefix: "doc-42-"
    });
    var document = new documents.Document([bookmarkStart]);
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, '<a id="doc-42-_Peter"></a>');
    });
});

test('docx tab is converted to tab in HTML', function() {
    var tab = new documents.Tab();
    var converter = new DocumentConverter();
    return converter.convertToHtml(tab).then(function(result) {
        assert.equal(result.value, "\t");
    });
});

test('compound ordered list labels are written explicitly', function() {
    var document = new documents.Document([
        listParagraphOfText("Parent", {numId: "42", level: "0", isOrdered: true, levelText: "%1"}),
        listParagraphOfText("Child", {numId: "42", level: "1", isOrdered: true, levelText: "%1.%2", start: "12"})
    ]);
    var converter = new DocumentConverter({
        styleMap: orderedListStyleMap()
    });
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(
            result.value,
            '<ol><li>Parent<ol><li style="list-style-type: none"><span class="mammoth-list-number" data-mammoth-list-number="true">1.12 </span>Child</li></ol></li></ol>'
        );
    });
});

test('simple ordered list labels are left to the browser', function() {
    var document = new documents.Document([
        listParagraphOfText("One", {numId: "42", level: "0", isOrdered: true, levelText: "%1"}),
        listParagraphOfText("Two", {numId: "42", level: "0", isOrdered: true, levelText: "%1"})
    ]);
    var converter = new DocumentConverter({
        styleMap: orderedListStyleMap()
    });
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, '<ol><li>One</li><li>Two</li></ol>');
    });
});

test('simple ordered lists split by a paragraph keep their numbering', function() {
    var document = new documents.Document([
        listParagraphOfText("One", {numId: "42", level: "0", isOrdered: true, levelText: "%1"}),
        listParagraphOfText("Two", {numId: "42", level: "0", isOrdered: true, levelText: "%1"}),
        paragraphOfText("Between"),
        listParagraphOfText("Three", {numId: "42", level: "0", isOrdered: true, levelText: "%1"}),
        listParagraphOfText("Four", {numId: "42", level: "0", isOrdered: true, levelText: "%1"})
    ]);
    var converter = new DocumentConverter({
        styleMap: orderedListStyleMap()
    });
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, '<ol><li>One</li><li>Two</li></ol><p>Between</p><ol start="3"><li>Three</li><li>Four</li></ol>');
    });
});

test('ordered lists split across separate list definitions use explicit start', function() {
    var document = new documents.Document([
        listParagraphOfText("One", {numId: "42", level: "0", isOrdered: true, levelText: "%1", start: "1"}),
        paragraphOfText("Between"),
        listParagraphOfText("Two", {numId: "43", level: "0", isOrdered: true, levelText: "%1", start: "2"}),
        listParagraphOfText("Three", {numId: "43", level: "0", isOrdered: true, levelText: "%1", start: "2"})
    ]);
    var converter = new DocumentConverter({
        styleMap: orderedListStyleMap()
    });
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, '<ol><li>One</li></ol><p>Between</p><ol start="2"><li>Two</li><li>Three</li></ol>');
    });
});

test('ordered list labels with missing level text are left to the browser', function() {
    var document = new documents.Document([
        listParagraphOfText("One", {numId: "42", level: "0", isOrdered: true})
    ]);
    var converter = new DocumentConverter({
        styleMap: orderedListStyleMap()
    });
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, '<ol><li>One</li></ol>');
    });
});

test('custom simple ordered list labels are written explicitly', function() {
    var document = new documents.Document([
        listParagraphOfText("Parent", {numId: "42", level: "0", isOrdered: true, levelText: "%1"}),
        listParagraphOfText("Child", {numId: "42", level: "1", isOrdered: true, levelText: "(%2)"})
    ]);
    var converter = new DocumentConverter({
        styleMap: orderedListStyleMap()
    });
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(
            result.value,
            '<ol><li>Parent<ol><li style="list-style-type: none"><span class="mammoth-list-number" data-mammoth-list-number="true">(1) </span>Child</li></ol></li></ol>'
        );
    });
});

test('simple ordered list labels with custom number format are written explicitly', function() {
    var document = new documents.Document([
        listParagraphOfText("Item", {
            numId: "42",
            level: "0",
            isOrdered: true,
            levelText: "%1",
            numFmt: "upperLetter"
        })
    ]);
    var converter = new DocumentConverter({
        styleMap: orderedListStyleMap()
    });
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(
            result.value,
            '<ol><li style="list-style-type: none"><span class="mammoth-list-number" data-mammoth-list-number="true">A </span>Item</li></ol>'
        );
    });
});

test('list breaks prevent adjacent ordered lists from merging', function() {
    var document = new documents.Document([
        listParagraphOfText("One", {numId: "42", level: "0", isOrdered: true, levelText: "%1"}),
        listParagraphOfText("Two", {numId: "42", level: "0", isOrdered: true, levelText: "%1"}),
        new documents.Paragraph([], {listBreak: true}),
        listParagraphOfText("Again", {numId: "43", level: "0", isOrdered: true, levelText: "%1"})
    ]);
    var converter = new DocumentConverter({
        styleMap: orderedListStyleMap()
    });
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, '<ol><li>One</li><li>Two</li></ol><ol><li>Again</li></ol>');
    });
});

test('compound ordered list items can contain deeper lists', function() {
    var document = new documents.Document([
        listParagraphOfText("Parent", {numId: "42", level: "0", isOrdered: true, levelText: "%1."}),
        listParagraphOfText("Child", {numId: "42", level: "1", isOrdered: true, levelText: "%1.%2."}),
        listParagraphOfText("Grandchild", {numId: "42", level: "2", isOrdered: true, levelText: "%1.%2.%3."})
    ]);
    var converter = new DocumentConverter({
        styleMap: orderedListStyleMap()
    });
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(
            result.value,
            '<ol><li>Parent<ol><li style="list-style-type: none"><span class="mammoth-list-number" data-mammoth-list-number="true">1.1. </span>Child<ol><li style="list-style-type: none"><span class="mammoth-list-number" data-mammoth-list-number="true">1.1.1. </span>Grandchild</li></ol></li></ol></li></ol>'
        );
    });
});

test('compound ordered list labels use the number format from each referenced level', function() {
    var levelDefinitions = {
        "0": {numFmt: "upperLetter"},
        "1": {numFmt: "lowerRoman"}
    };
    var document = new documents.Document([
        listParagraphOfText("Parent", {
            numId: "42",
            level: "0",
            isOrdered: true,
            levelText: "%1",
            numFmt: "upperLetter",
            levelDefinitions: levelDefinitions
        }),
        listParagraphOfText("Child", {
            numId: "42",
            level: "1",
            isOrdered: true,
            levelText: "%1.%2",
            numFmt: "lowerRoman",
            start: "4",
            levelDefinitions: levelDefinitions
        })
    ]);
    var converter = new DocumentConverter({
        styleMap: orderedListStyleMap()
    });
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(
            result.value,
            '<ol><li style="list-style-type: none"><span class="mammoth-list-number" data-mammoth-list-number="true">A </span>Parent<ol><li style="list-style-type: none"><span class="mammoth-list-number" data-mammoth-list-number="true">A.iv </span>Child</li></ol></li></ol>'
        );
    });
});

test('docx table is converted to table in HTML', function() {
    var table = new documents.Table([
        new documents.TableRow([
            new documents.TableCell([paragraphOfText("Top left")]),
            new documents.TableCell([paragraphOfText("Top right")])
        ]),
        new documents.TableRow([
            new documents.TableCell([paragraphOfText("Bottom left")]),
            new documents.TableCell([paragraphOfText("Bottom right")])
        ])
    ]);
    var converter = new DocumentConverter();

    return converter.convertToHtml(table).then(function(result) {
        var expectedHtml = "<table>" +
            "<tr><td><p>Top left</p></td><td><p>Top right</p></td></tr>" +
            "<tr><td><p>Bottom left</p></td><td><p>Bottom right</p></td></tr>" +
            "</table>";
        assert.equal(result.value, expectedHtml);
    });
});

test('table style mappings can be used to map tables', function() {
    var table = new documents.Table([], {styleName: "Normal Table"});
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.table({styleName: documentMatchers.equalTo("Normal Table")}),
                to: htmlPaths.topLevelElement("table", {"class": "normal-table"})
            }
        ]
    });

    return converter.convertToHtml(table).then(function(result) {
        var expectedHtml = '<table class="normal-table"></table>';
        assert.equal(result.value, expectedHtml);
    });
});

test('header rows are wrapped in thead', function() {
    var table = new documents.Table([
        new documents.TableRow([new documents.TableCell([])], {isHeader: true}),
        new documents.TableRow([new documents.TableCell([])], {isHeader: true}),
        new documents.TableRow([new documents.TableCell([])], {isHeader: false})
    ]);
    var converter = new DocumentConverter();

    return converter.convertToHtml(table).then(function(result) {
        var expectedHtml = "<table>" +
            "<thead><tr><th></th></tr><tr><th></th></tr></thead>" +
            "<tbody><tr><td></td></tr></tbody>" +
            "</table>";
        assert.equal(result.value, expectedHtml);
    });
});

test('tbody is omitted if all rows are headers', function() {
    var table = new documents.Table([
        new documents.TableRow([new documents.TableCell([])], {isHeader: true})
    ]);
    var converter = new DocumentConverter();

    return converter.convertToHtml(table).then(function(result) {
        var expectedHtml = "<table>" +
            "<thead><tr><th></th></tr></thead>" +
            "</table>";
        assert.equal(result.value, expectedHtml);
    });
});

test('unexpected table children do not cause error', function() {
    var table = new documents.Table([
        new documents.tab()
    ]);
    var converter = new DocumentConverter();

    return converter.convertToHtml(table).then(function(result) {
        var expectedHtml = "<table>\t</table>";
        assert.equal(result.value, expectedHtml);
    });
});

test('empty cells are preserved in table', function() {
    var table = new documents.Table([
        new documents.TableRow([
            new documents.TableCell([paragraphOfText("")]),
            new documents.TableCell([paragraphOfText("Top right")])
        ])
    ]);
    var converter = new DocumentConverter();

    return converter.convertToHtml(table).then(function(result) {
        var expectedHtml = "<table>" +
            "<tr><td></td><td><p>Top right</p></td></tr>" +
            "</table>";
        assert.equal(result.value, expectedHtml);
    });
});

test('empty rows are preserved in table', function() {
    var table = new documents.Table([
        new documents.TableRow([
            new documents.TableCell([paragraphOfText("Row 1")])
        ]),
        new documents.TableRow([])
    ]);
    var converter = new DocumentConverter();

    return converter.convertToHtml(table).then(function(result) {
        var expectedHtml = "<table>" +
            "<tr><td><p>Row 1</p></td></tr><tr></tr>" +
            "</table>";
        assert.equal(result.value, expectedHtml);
    });
});

test('table cells are written with colSpan if not equal to one', function() {
    var table = new documents.Table([
        new documents.TableRow([
            new documents.TableCell([paragraphOfText("Top left")], {colSpan: 2}),
            new documents.TableCell([paragraphOfText("Top right")])
        ])
    ]);
    var converter = new DocumentConverter();

    return converter.convertToHtml(table).then(function(result) {
        var expectedHtml = "<table>" +
            "<tr><td colspan=\"2\"><p>Top left</p></td><td><p>Top right</p></td></tr>" +
            "</table>";
        assert.equal(result.value, expectedHtml);
    });
});

test('table cells are written with rowSpan if not equal to one', function() {
    var table = new documents.Table([
        new documents.TableRow([
            new documents.TableCell([], {rowSpan: 2})
        ])
    ]);
    var converter = new DocumentConverter();

    return converter.convertToHtml(table).then(function(result) {
        var expectedHtml = "<table>" +
            "<tr><td rowspan=\"2\"></td></tr>" +
            "</table>";
        assert.equal(result.value, expectedHtml);
    });
});

test('line break is converted to <br>', function() {
    var converter = new DocumentConverter();

    return converter.convertToHtml(documents.lineBreak).then(function(result) {
        assert.equal(result.value, "<br />");
    });
});

test('breaks that are not line breaks are ignored', function() {
    var converter = new DocumentConverter();

    return converter.convertToHtml(documents.pageBreak).then(function(result) {
        assert.equal(result.value, "");
    });
});

test('breaks can be mapped using style mappings', function() {
    var converter = new DocumentConverter({
        styleMap: [
            {
                from: documentMatchers.pageBreak,
                to: htmlPaths.topLevelElement("hr")
            },
            {
                from: documentMatchers.lineBreak,
                to: htmlPaths.topLevelElement("br", {class: "line-break"})
            }
        ]
    });

    var run = documents.run([documents.pageBreak, documents.lineBreak]);

    return converter.convertToHtml(run).then(function(result) {
        assert.equal(result.value, '<hr /><br class="line-break" />');
    });
});

test('footnote reference is converted to superscript intra-page link', function() {
    var footnoteReference = new documents.NoteReference({
        noteType: "footnote",
        noteId: "4"
    });
    var converter = new DocumentConverter({
        idPrefix: "doc-42-"
    });
    return converter.convertToHtml(footnoteReference).then(function(result) {
        assert.equal(result.value, '<sup><a href="#doc-42-footnote-4" id="doc-42-footnote-ref-4">[1]</a></sup>');
    });
});

test('footnotes are included after the main body', function() {
    var footnoteReference = new documents.NoteReference({
        noteType: "footnote",
        noteId: "4"
    });
    var document = new documents.Document(
        [new documents.Paragraph([
            runOfText("Knock knock"),
            new documents.Run([footnoteReference])
        ])],
        {
            notes: new documents.Notes({
                4: new documents.Note({
                    noteType: "footnote",
                    noteId: "4",
                    body: [paragraphOfText("Who's there?")]
                })
            })
        }
    );

    var converter = new DocumentConverter({
        idPrefix: "doc-42-"
    });
    return converter.convertToHtml(document).then(function(result) {
        var expectedOutput = '<p>Knock knock<sup><a href="#doc-42-footnote-4" id="doc-42-footnote-ref-4">[1]</a></sup></p>' +
            '<ol><li id="doc-42-footnote-4"><p>Who\'s there? <a href="#doc-42-footnote-ref-4">↑</a></p></li></ol>';
        assert.equal(result.value, expectedOutput);
    });
});

test('comments are ignored by default', function() {
    var reference = documents.commentReference({commentId: "4"});
    var comment = documents.comment({
        commentId: "4",
        body: [paragraphOfText("Who's there?")]
    });
    var document = documents.document([
        documents.paragraph([
            runOfText("Knock knock"),
            documents.run([reference])
        ])
    ], {comments: [comment]});

    var converter = new DocumentConverter({});
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, '<p>Knock knock</p>');
        assert.deepEqual(result.messages, []);
    });
});

test('comment references are linked to comment after main body', function() {
    var reference = documents.commentReference({commentId: "4"});
    var comment = documents.comment({
        commentId: "4",
        body: [paragraphOfText("Who's there?")],
        authorName: "The Piemaker",
        authorInitials: "TP"
    });
    var document = documents.document([
        documents.paragraph([
            runOfText("Knock knock"),
            documents.run([reference])
        ])
    ], {comments: [comment]});

    var converter = new DocumentConverter({
        idPrefix: "doc-42-",
        styleMap: [
            {from: documentMatchers.commentReference, to: htmlPaths.element("sup")}
        ]
    });
    return converter.convertToHtml(document).then(function(result) {
        var expectedHtml = (
            '<p>Knock knock<sup><a href="#doc-42-comment-4" id="doc-42-comment-ref-4">[TP1]</a></sup></p>' +
            '<dl><dt id="doc-42-comment-4">Comment [TP1]</dt><dd><p>Who\'s there? <a href="#doc-42-comment-ref-4">↑</a></p></dd></dl>'
        );
        assert.equal(result.value, expectedHtml);
        assert.deepEqual(result.messages, []);
    });
});

test('OLE objects are written as a span with icon and display name', function() {
    var oleObject = new documents.OleObject({
        progId: "Excel.Sheet.12",
        displayName: "Excel Worksheet",
        altText: "Excel Worksheet"
    });
    var converter = new DocumentConverter();
    return converter.convertToHtml(oleObject).then(function(result) {
        var svg = embeddedObjectSvg(result.value);
        assert.notEqual(svg.indexOf('>Excel Worksheet</text>'), -1);
        assert.equal(result.value.indexOf(' /> Excel Worksheet</span>'), -1);
    });
});


test('OLE object display name is extracted from the EMF icon text', function() {
    var text = "Workbook Template.xlsx";
    var textBytes = new Buffer(text, "utf-16le");
    var nChars = text.length;
    var offString = 8 + 16 + 4 + 4 + 4 + 8 + 4 + 4 + 4 + 16 + 4; // = 75
    // pad offString to 4-byte alignment
    while (offString % 4 !== 0) {
        offString += 1;
    }
    var recordSize = offString + nChars * 2;
    while (recordSize % 4 !== 0) {
        recordSize += 1;
    }
    var record = new Buffer(recordSize);
    record.fill(0);
    record.writeUInt32LE(84, 0);          // iType = EMR_EXTTEXTOUTW
    record.writeUInt32LE(recordSize, 4); // nSize
    record.writeUInt32LE(nChars, 8 + 16 + 4 + 4 + 4 + 8);  // nChars
    record.writeUInt32LE(offString, 8 + 16 + 4 + 4 + 4 + 8 + 4); // offString
    textBytes.copy(record, offString);
    var iconReader = function() {
        return promises.when(record);
    };
    var oleObject = new documents.OleObject({
        progId: "Excel.Sheet.12",
        displayName: "Excel Worksheet",
        iconReader: iconReader
    });
    var converter = new DocumentConverter();
    return converter.convertToHtml(oleObject).then(function(result) {
        var svg = embeddedObjectSvg(result.value);
        assert.notEqual(svg.indexOf('>Workbook Template.xlsx</text>'), -1);
        assert.equal(result.value.indexOf(' /> Workbook Template.xlsx</span>'), -1);
    });
});


test('OLE object display name is decoded from GB18030 EMF icon text', function() {
    // "台账模板.xlsx" in GB18030. The byte sequence is not valid UTF-8, so the
    // decoder has to fall through to GB18030 rather than to the byte-per-char
    // reading, which would produce mojibake and be discarded.
    var textBytes = new Buffer([0xCC, 0xA8, 0xD5, 0xCB, 0xC4, 0xA3, 0xB0, 0xE5, 0x2E, 0x78, 0x6C, 0x73, 0x78]);
    var offString = 76; // 8 + 16 + 4 + 4 + 4 + 8 + 4 + 4 + 4 + 16 + 4, padded to 4 bytes
    var recordSize = offString + textBytes.length;
    while (recordSize % 4 !== 0) {
        recordSize += 1;
    }
    var record = new Buffer(recordSize);
    record.fill(0);
    record.writeUInt32LE(83, 0); // iType = EMR_EXTTEXTOUTA
    record.writeUInt32LE(recordSize, 4); // nSize
    record.writeUInt32LE(textBytes.length, 8 + 16 + 4 + 4 + 4 + 8); // nChars
    record.writeUInt32LE(offString, 8 + 16 + 4 + 4 + 4 + 8 + 4); // offString
    textBytes.copy(record, offString);

    var oleObject = new documents.OleObject({
        progId: "Excel.Sheet.12",
        displayName: "Excel Worksheet",
        iconReader: function() {
            return promises.when(record);
        }
    });
    var converter = new DocumentConverter();
    return converter.convertToHtml(oleObject).then(function(result) {
        var svg = embeddedObjectSvg(result.value);
        assert.notEqual(svg.indexOf('>台账模板.xlsx</text>'), -1);
    });
});


test('OLE object icon is extracted from the EMF bitmap', function() {
    // Build a minimal EMF containing a 2x2 24bpp DIB.
    var width = 2;
    var height = 2;
    var bpp = 24;
    var rowSize = Math.floor(((bpp * width) + 31) / 32) * 4; // 8
    var pixelSize = rowSize * height; // 16
    var bmiSize = 40; // BITMAPINFOHEADER, no palette
    var bmi = new Buffer(bmiSize + pixelSize);
    bmi.fill(0);
    bmi.writeUInt32LE(40, 0);               // biSize
    bmi.writeInt32LE(width, 4);             // biWidth
    bmi.writeInt32LE(height, 8);            // biHeight
    bmi.writeUInt16LE(1, 12);               // biPlanes
    bmi.writeUInt16LE(bpp, 14);             // biBitCount
    // pixel rows: BGR triples padded to rowSize
    var pixels = bmi.slice(bmiSize, bmiSize + pixelSize);
    pixels.fill(0);
    pixels[0] = 0x00; pixels[1] = 0x7F; pixels[2] = 0xC0; // a pixel
    var iconReader = function() {
        return promises.when(bmi);
    };
    var oleObject = new documents.OleObject({
        progId: "Excel.Sheet.12",
        displayName: "台账模板.xlsx",
        iconReader: iconReader
    });
    var converter = new DocumentConverter();
    return converter.convertToHtml(oleObject).then(function(result) {
        var svg = embeddedObjectSvg(result.value);
        assert.notEqual(svg.indexOf('<image '), -1);
        assert.notEqual(svg.indexOf('data:image/png;base64,'), -1);
        assert.notEqual(svg.indexOf('>台账模板.xlsx</text>'), -1);
        assert.equal(svg.indexOf('<rect x="1"'), -1);
    });
});

test('OLE object PNG previews preserve transparent DIB pixels', function() {
    var dib = new Buffer(40 + 16);
    dib.fill(0);
    dib.writeUInt32LE(40, 0);
    dib.writeInt32LE(2, 4);
    dib.writeInt32LE(2, 8);
    dib.writeUInt16LE(1, 12);
    dib.writeUInt16LE(32, 14);
    dib[40] = 0xFF;
    dib[41] = 0x00;
    dib[42] = 0x00;
    dib[43] = 0x00; // transparent pixel
    dib[44] = 0x00;
    dib[45] = 0x00;
    dib[46] = 0xFF;
    dib[47] = 0xFF; // opaque pixel

    var oleObject = new documents.OleObject({
        progId: "Excel.Sheet.12",
        displayName: "Transparent.xlsx",
        iconReader: function() {
            return promises.when(dib);
        }
    });
    var converter = new DocumentConverter();
    return converter.convertToHtml(oleObject).then(function(result) {
        var png = embeddedObjectPng(result.value);
        assert.equal(png.slice(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(png[25], 6); // RGBA colour type
        var decoded = decodePngPixels(png);
        var alphas = [];
        for (var y = 0; y < decoded.height; y++) {
            for (var x = 0; x < decoded.width; x++) {
                alphas.push(decoded.data[y * (decoded.width * 4 + 1) + 1 + x * 4 + 3]);
            }
        }
        assert.notEqual(alphas.indexOf(0), -1);
        assert.notEqual(alphas.indexOf(255), -1);
    });
});

test('OLE object PNG previews clear black background from a non-square bitmap', function() {
    // 8x3 32bpp DIB. The top row is black, the middle row is black only at
    // x = 4, and the bottom row is white, so the middle black pixel can only be
    // reached by stepping down a full row from the seeded top row. Width and
    // height differ enough that stepping by the wrong one lands on a white
    // pixel and leaves the middle pixel opaque.
    var width = 8;
    var height = 3;
    var rowSize = width * 4;
    var dib = new Buffer(40 + rowSize * height);
    dib.fill(0);
    dib.writeUInt32LE(40, 0);
    dib.writeInt32LE(width, 4);
    dib.writeInt32LE(height, 8);
    dib.writeUInt16LE(1, 12);
    dib.writeUInt16LE(32, 14);

    function writePixel(x, y, isBlack) {
        // DIB rows with a positive height are stored bottom-up.
        var offset = 40 + (height - y - 1) * rowSize + x * 4;
        var value = isBlack ? 0x00 : 0xFF;
        dib[offset] = value;
        dib[offset + 1] = value;
        dib[offset + 2] = value;
        dib[offset + 3] = 0xFF;
    }

    for (var x = 0; x < width; x++) {
        writePixel(x, 0, true);
        writePixel(x, 1, x === 4);
        writePixel(x, 2, false);
    }

    var oleObject = new documents.OleObject({
        progId: "Excel.Sheet.12",
        displayName: "NonSquare.xlsx",
        iconReader: function() {
            return promises.when(dib);
        }
    });
    var converter = new DocumentConverter();
    return converter.convertToHtml(oleObject).then(function(result) {
        var decoded = decodePngPixels(embeddedObjectPng(result.value));
        assert.equal(decoded.width, width);
        assert.equal(decoded.height, height);
        function alphaAt(x, y) {
            return decoded.data[y * (width * 4 + 1) + 1 + x * 4 + 3];
        }
        assert.equal(alphaAt(4, 0), 0); // seeded black pixel in the top row
        assert.equal(alphaAt(4, 1), 0); // only reachable one row down from (4, 0)
        assert.equal(alphaAt(0, 2), 255); // white pixel is left alone
    });
});

test('OLE object icon records preserve EMF destination coordinates', function() {
    var emf = new Buffer(128 + 108 + 40 + 16);
    emf.fill(0);
    emf.writeUInt32LE(1, 0); // EMF header
    emf.writeUInt32LE(128, 4);
    emf.writeInt32LE(0, 8);
    emf.writeInt32LE(0, 12);
    emf.writeInt32LE(32, 16);
    emf.writeInt32LE(32, 20);

    var recordOffset = 128;
    emf.writeUInt32LE(114, recordOffset); // EMR_ALPHABLEND
    emf.writeUInt32LE(108 + 40 + 16, recordOffset + 4);
    emf.writeInt32LE(12, recordOffset + 24); // xDest
    emf.writeInt32LE(3, recordOffset + 28); // yDest
    emf.writeInt32LE(2, recordOffset + 32); // cxDest
    emf.writeInt32LE(2, recordOffset + 36); // cyDest
    emf.writeUInt32LE(108, recordOffset + 84); // offBmiSrc
    emf.writeUInt32LE(40, recordOffset + 88); // cbBmiSrc
    emf.writeUInt32LE(148, recordOffset + 92); // offBitsSrc
    emf.writeUInt32LE(16, recordOffset + 96); // cbBitsSrc

    var dibOffset = recordOffset + 108;
    emf.writeUInt32LE(40, dibOffset);
    emf.writeInt32LE(2, dibOffset + 4);
    emf.writeInt32LE(2, dibOffset + 8);
    emf.writeUInt16LE(1, dibOffset + 12);
    emf.writeUInt16LE(24, dibOffset + 14);

    var oleObject = new documents.OleObject({
        progId: "Excel.Sheet.12",
        displayName: "台账模板.xlsx",
        iconReader: function() {
            return promises.when(emf);
        }
    });
    var converter = new DocumentConverter();
    return converter.convertToHtml(oleObject).then(function(result) {
        var svg = embeddedObjectSvg(result.value);
        assert.notEqual(svg.indexOf('<image x="12" y="3" width="2" height="2"'), -1);
        assert.notEqual(svg.indexOf('xlink:href="data:image/png;base64,'), -1);
    });
});

test('OLE object STRETCHDIBITS records use their DIB offsets', function() {
    var emf = new Buffer(128 + 80 + 40 + 16);
    emf.fill(0);
    emf.writeUInt32LE(1, 0); // EMF header
    emf.writeUInt32LE(128, 4);
    emf.writeInt32LE(0, 8);
    emf.writeInt32LE(0, 12);
    emf.writeInt32LE(32, 16);
    emf.writeInt32LE(32, 20);

    var recordOffset = 128;
    emf.writeUInt32LE(81, recordOffset); // EMR_STRETCHDIBITS
    emf.writeUInt32LE(80 + 40 + 16, recordOffset + 4);
    emf.writeInt32LE(8, recordOffset + 24); // xDest
    emf.writeInt32LE(5, recordOffset + 28); // yDest
    emf.writeInt32LE(3, recordOffset + 72); // cxDest
    emf.writeInt32LE(4, recordOffset + 76); // cyDest
    emf.writeUInt32LE(80, recordOffset + 48); // offBmiSrc
    emf.writeUInt32LE(40, recordOffset + 52); // cbBmiSrc
    emf.writeUInt32LE(120, recordOffset + 56); // offBitsSrc
    emf.writeUInt32LE(16, recordOffset + 60); // cbBitsSrc

    var dibOffset = recordOffset + 80;
    emf.writeUInt32LE(40, dibOffset);
    emf.writeInt32LE(2, dibOffset + 4);
    emf.writeInt32LE(2, dibOffset + 8);
    emf.writeUInt16LE(1, dibOffset + 12);
    emf.writeUInt16LE(24, dibOffset + 14);

    var oleObject = new documents.OleObject({
        progId: "Word.Document.12",
        displayName: "Preview.docx",
        iconReader: function() {
            return promises.when(emf);
        }
    });
    var converter = new DocumentConverter();
    return converter.convertToHtml(oleObject).then(function(result) {
        var svg = embeddedObjectSvg(result.value);
        assert.notEqual(svg.indexOf('<image x="8" y="5" width="3" height="4"'), -1);
    });
});

test('OLE objects without an icon use a labelled fallback icon', function() {
    var oleObject = new documents.OleObject({
        progId: "Excel.Sheet.12",
        displayName: "Excel Worksheet"
    });
    var converter = new DocumentConverter();
    return converter.convertToHtml(oleObject).then(function(result) {
        var svg = embeddedObjectSvg(result.value);
        assert.notEqual(svg.indexOf('>Excel Worksheet</text>'), -1);
    });
});

test('images are written with data URIs', function() {
    var imageBuffer = new Buffer("Not an image at all!");
    var image = new documents.Image({
        readImage: function(encoding) {
            return promises.when(imageBuffer.toString(encoding));
        },
        contentType: "image/png"
    });
    var converter = new DocumentConverter();
    return converter.convertToHtml(image).then(function(result) {
        assert.equal(result.value, '<img src="data:image/png;base64,' + imageBuffer.toString("base64") + '" />');
    });
});

test('images have alt attribute if available', function() {
    var imageBuffer = new Buffer("Not an image at all!");
    var image = new documents.Image({
        readImage: function() {
            return promises.when(imageBuffer);
        },
        altText: "It's a hat"
    });
    var converter = new DocumentConverter();
    return converter.convertToHtml(image)
        .then(function(result) {
            return xml.readString(result.value);
        })
        .then(function(htmlImageElement) {
            assert.equal(htmlImageElement.attributes.alt, "It's a hat");
        });
});

test('can add custom handler for images', function() {
    var imageBuffer = new Buffer("Not an image at all!");
    var image = new documents.Image({
        readImage: function(encoding) {
            return promises.when(imageBuffer.toString(encoding));
        },
        contentType: "image/png"
    });
    var converter = new DocumentConverter({
        convertImage: function(element, messages) {
            return element.read("utf8").then(function(altText) {
                return [Html.freshElement("img", {alt: altText})];
            });
        }
    });
    return converter.convertToHtml(image).then(function(result) {
        assert.equal(result.value, '<img alt="Not an image at all!" />');
    });
});

test('when custom image handler throws error then error is stored in error message', function() {
    var error = new Error("Failed to convert image");
    var image = new documents.Image({
        readImage: function(encoding) {
            return promises.when(new Buffer().toString(encoding));
        },
        contentType: "image/png"
    });
    var converter = new DocumentConverter({
        convertImage: function(element, messages) {
            throw error;
        }
    });
    return converter.convertToHtml(image).then(function(result) {
        assert.equal(result.value, '');
        assert.equal(result.messages.length, 1);
        var message = result.messages[0];
        assert.equal("error", message.type);
        assert.equal("Failed to convert image", message.message);
        assert.equal(error, message.error);
    });
});

test('long documents do not cause stack overflow', function() {
    var paragraphs = [];
    for (var i = 0; i < 1000; i++) {
        paragraphs.push(paragraphOfText("Hello."));
    }
    var document = new documents.Document(paragraphs);
    var converter = new DocumentConverter();
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value.indexOf("<p>Hello.</p>"), 0);
    });
});

test('docx headers and footers are converted to HTML landmarks', function() {
    var headers = [new documents.Header(
        [paragraphOfText("This is a header")]
    )];
    var footers = [new documents.Footer(
        [paragraphOfText("This is a footer")]
    )];
    var document = new documents.Document([], {
        headers: headers,
        footers: footers
    });
    var converter = new DocumentConverter({includeHeadersAndFooters: true});
    return converter.convertToHtml(document).then(function(result) {
        assert.equal(result.value, '<header><p>This is a header</p></header><footer><p>This is a footer</p></footer>');
    });
});

function embeddedObjectSvg(html) {
    var match = html.match(/<img src="data:image\/svg\+xml;base64,([^"]+)"/);
    return Buffer.from(match[1], "base64").toString("utf8");
}

function embeddedObjectPng(html) {
    var svg = embeddedObjectSvg(html);
    var match = svg.match(/xlink:href="data:image\/png;base64,([^"]+)"/);
    return Buffer.from(match[1], "base64");
}

function decodePngPixels(png) {
    var offset = 8;
    var idat = [];
    while (offset < png.length) {
        var length = png.readUInt32BE(offset);
        var type = png.toString("ascii", offset + 4, offset + 8);
        if (type === "IDAT") {
            idat.push(png.slice(offset + 8, offset + 8 + length));
        }
        offset += length + 12;
    }
    return {
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
        data: zlib.inflateSync(Buffer.concat(idat))
    };
}

function paragraphOfText(text, styleId, styleName) {
    var run = runOfText(text);
    return new documents.Paragraph([run], {
        styleId: styleId,
        styleName: styleName
    });
}

function listParagraphOfText(text, numbering) {
    return new documents.Paragraph([runOfText(text)], {
        numbering: numbering
    });
}

function orderedListStyleMap() {
    return [
        {
            from: documentMatchers.paragraph({list: {isOrdered: true, levelIndex: 0}}),
            to: htmlPaths.elements([
                htmlPaths.element("ol"),
                htmlPaths.element("li", {}, {fresh: true})
            ])
        },
        {
            from: documentMatchers.paragraph({list: {isOrdered: true, levelIndex: 1}}),
            to: htmlPaths.elements([
                htmlPaths.element(["ul", "ol"]),
                htmlPaths.element("li"),
                htmlPaths.element("ol"),
                htmlPaths.element("li", {}, {fresh: true})
            ])
        },
        {
            from: documentMatchers.paragraph({list: {isOrdered: true, levelIndex: 2}}),
            to: htmlPaths.elements([
                htmlPaths.element(["ul", "ol"]),
                htmlPaths.element("li"),
                htmlPaths.element(["ul", "ol"]),
                htmlPaths.element("li"),
                htmlPaths.element("ol"),
                htmlPaths.element("li", {}, {fresh: true})
            ])
        }
    ];
}

function runOfText(text, properties) {
    var textElement = new documents.Text(text);
    return new documents.Run([textElement], properties);
}

test('when initials are not blank then comment author label is initials', function() {
    assert.equal(commentAuthorLabel({authorInitials: "TP"}), "TP");
});

test('when initials are blank then comment author label is blank', function() {
    assert.equal(commentAuthorLabel({authorInitials: ""}), "");
    assert.equal(commentAuthorLabel({authorInitials: undefined}), "");
    assert.equal(commentAuthorLabel({authorInitials: null}), "");
});
