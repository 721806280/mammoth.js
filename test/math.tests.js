var assert = require("assert");
var mammoth = require("../");
var warning = require("../lib/results").warning;
var createFakeDocxFile = require("./testing").createFakeDocxFile;
var test = require("./test")(module);

var mathStart = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline">';

test('inline equations keep surrounding text and split identifiers, numbers and operators', function() {
    return mammoth.convertToHtml({file: docx(
        '<w:p><w:r><w:t>Before </w:t></w:r><m:oMath>' + run("x+12.5=α") +
        '</m:oMath><w:r><w:t> after</w:t></w:r></w:p>'
    )}).then(function(result) {
        assert.equal(result.value, '<p>Before ' + mathStart + '<mi>x</mi><mo>+</mo><mn>12.5</mn><mo>=</mo><mi>α</mi></math> after</p>');
        assert.deepEqual(result.messages, []);
    });
});

test('centred Chinese display equations survive DOCX conversion and raw text extraction', function() {
    var input = {file: docx(
        '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>' +
        '<w:bookmarkStart w:id="7" w:name="Formula"/>' +
        '<m:oMathPara><m:oMath>' + run("阶段付款金额 = 含税合同总额 × 付款比例") +
        '<w:bookmarkEnd w:id="7"/></m:oMath></m:oMathPara></w:p>'
    )};
    return mammoth.convertToHtml(input, {preserveAlignment: true}).then(function(result) {
        assert.equal(result.value,
            '<p style="text-align: center"><a id="Formula"></a>' +
            '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">' +
            '<mtext>阶段付款金额</mtext><mtext>\u00a0</mtext><mo>=</mo><mtext>\u00a0</mtext>' +
            '<mtext>含税合同总额</mtext><mtext>\u00a0</mtext><mo>×</mo><mtext>\u00a0</mtext><mtext>付款比例</mtext>' +
            '</math></p>');
        assert.deepEqual(result.messages, []);
        return mammoth.extractRawText(input);
    }).then(function(result) {
        assert.equal(result.value, "阶段付款金额 = 含税合同总额 × 付款比例\n\n");
        assert.deepEqual(result.messages, []);
    });
});

test('strict OOXML equations use namespace URIs rather than input prefixes', function() {
    var file = createFakeDocxFile({
        "word/document.xml": '<word:document xmlns:word="http://purl.oclc.org/ooxml/wordprocessingml/main" ' +
            'xmlns:eq="http://purl.oclc.org/ooxml/officeDocument/math">' +
            '<word:body><word:p><eq:oMath><eq:r><eq:t>x</eq:t></eq:r></eq:oMath></word:p></word:body></word:document>'
    });
    return mammoth.convertToHtml({file: file}).then(function(result) {
        assert.equal(result.value, '<p>' + mathStart + '<mi>x</mi></math></p>');
        assert.deepEqual(result.messages, []);
    });
});

test('nested fractions, superscripts and roots preserve their layout and argument order', function() {
    return assertEquation(
        '<m:f><m:num><m:sSup><m:e>' + run("x") + '</m:e><m:sup>' + run("2") + '</m:sup></m:sSup></m:num>' +
        '<m:den><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>' + run("y") + '</m:e></m:rad></m:den></m:f>',
        '<mfrac><mrow><msup><mrow><mi>x</mi></mrow><mrow><mn>2</mn></mrow></msup></mrow>' +
        '<mrow><msqrt><mrow><mi>y</mi></mrow></msqrt></mrow></mfrac>'
    );
});

test('indexed roots and combined subscripts and superscripts are retained', function() {
    return assertEquation(
        '<m:rad><m:deg>' + run("3") + '</m:deg><m:e><m:sSubSup><m:e>' + run("x") + '</m:e>' +
        '<m:sub>' + run("i") + '</m:sub><m:sup>' + run("2") + '</m:sup></m:sSubSup></m:e></m:rad>',
        '<mroot><mrow><msubsup><mrow><mi>x</mi></mrow><mrow><mi>i</mi></mrow><mrow><mn>2</mn></mrow></msubsup></mrow>' +
        '<mrow><mn>3</mn></mrow></mroot>'
    );
});

test('empty fraction arguments are not removed by the HTML simplifier', function() {
    return assertEquation('<m:f><m:num/><m:den>' + run("2") + '</m:den></m:f>',
        '<mfrac><mrow></mrow><mrow><mn>2</mn></mrow></mfrac>');
});

test('matrices retain row boundaries and empty cells', function() {
    return assertEquation(
        '<m:m><m:mr><m:e>' + run("1") + '</m:e><m:e/></m:mr>' +
        '<m:mr><m:e>' + run("0") + '</m:e><m:e>' + run("1") + '</m:e></m:mr></m:m>',
        '<mtable><mtr><mtd><mn>1</mn></mtd><mtd></mtd></mtr>' +
        '<mtr><mtd><mn>0</mn></mtd><mtd><mn>1</mn></mtd></mtr></mtable>'
    );
});

test('sums keep upper and lower limits above and below the operator', function() {
    return assertEquation(
        '<m:nary><m:naryPr><m:chr m:val="∑"/><m:limLoc m:val="undOvr"/></m:naryPr>' +
        '<m:sub>' + run("i=1") + '</m:sub><m:sup>' + run("n") + '</m:sup><m:e>' + run("i") + '</m:e></m:nary>',
        '<mrow><munderover><mo largeop="true">∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow>' +
        '<mrow><mi>n</mi></mrow></munderover><mrow><mi>i</mi></mrow></mrow>'
    );
});

test('integrals respect hidden limits', function() {
    return assertEquation(
        '<m:nary><m:naryPr><m:subHide m:val="true"/><m:supHide m:val="1"/></m:naryPr>' +
        '<m:sub>' + run("0") + '</m:sub><m:sup>' + run("1") + '</m:sup><m:e>' + run("x") + '</m:e></m:nary>',
        '<mrow><mo largeop="true">∫</mo><mrow><mi>x</mi></mrow></mrow>'
    );
});

test('equation boolean properties without a value are enabled and explicit false values are retained', function() {
    return assertEquation(
        '<m:nary><m:naryPr><m:subHide m:val="0"/><m:supHide/></m:naryPr>' +
        '<m:sub>' + run("0") + '</m:sub><m:sup>' + run("1") + '</m:sup><m:e>' + run("x") + '</m:e></m:nary>',
        '<mrow><msub><mo largeop="true">∫</mo><mrow><mn>0</mn></mrow></msub><mrow><mi>x</mi></mrow></mrow>'
    );
});

test('delimiters preserve empty fences and separators', function() {
    return assertEquation(
        '<m:d><m:dPr><m:begChr m:val=""/><m:endChr m:val="]"/><m:sepChr m:val=";"/></m:dPr>' +
        '<m:e>' + run("a") + '</m:e><m:e>' + run("b") + '</m:e></m:d>',
        '<mrow><mrow><mi>a</mi></mrow><mo separator="true" stretchy="true">;</mo>' +
        '<mrow><mi>b</mi></mrow><mo fence="true" stretchy="true">]</mo></mrow>'
    );
});

test('normal equation text and operator characters are escaped as HTML', function() {
    return assertEquation(
        '<m:r><m:rPr><m:nor/></m:rPr><m:t>&lt;script&gt;&amp;</m:t></m:r>' +
        '<m:acc><m:accPr><m:chr m:val="&lt;"/></m:accPr><m:e>' + run("x") + '</m:e></m:acc>',
        '<mtext>&lt;script&gt;&amp;</mtext><mover accent="true"><mrow><mi>x</mi></mrow><mo stretchy="true">&lt;</mo></mover>'
    );
});

test('unsupported equation structures retain visible contents and produce a warning', function() {
    var input = {file: docx('<w:p><m:oMath><m:unknown>' + run("x") + '</m:unknown></m:oMath></w:p>')};
    var messages = [warning('An unrecognised equation element was read using its contents: m:unknown')];
    return mammoth.convertToHtml(input)
        .then(function(result) {
            assert.equal(result.value, '<p>' + mathStart + '<mi>x</mi></math></p>');
            assert.deepEqual(result.messages, messages);
            return mammoth.extractRawText(input);
        }).then(function(result) {
            assert.equal(result.value, 'x\n\n');
            assert.deepEqual(result.messages, messages);
        });
});

test('equation text participates in document transforms', function() {
    var transforms = require("../lib/transforms");
    var options = {
        transformDocument: function(document) {
            transforms.getDescendantsOfType(document, "text").forEach(function(text) {
                text.value = text.value.replace("x", "y");
            });
            return document;
        }
    };
    return mammoth.convertToHtml({file: docx('<w:p><m:oMath>' + run("x") + '</m:oMath></w:p>')}, options)
        .then(function(result) {
            assert.equal(result.value, '<p>' + mathStart + '<mi>y</mi></math></p>');
            assert.deepEqual(result.messages, []);
        });
});

test('text and Markdown exports retain fraction and script meaning', function() {
    var file = docx('<w:p><m:oMath><m:f><m:num>' + run("a") + '</m:num><m:den><m:sSup>' +
        '<m:e>' + run("x") + '</m:e><m:sup>' + run("2") + '</m:sup></m:sSup></m:den></m:f></m:oMath></w:p>');
    return mammoth.extractRawText({file: file}).then(function(result) {
        assert.equal(result.value, '(a)/(x^(2))\n\n');
        return mammoth.convertToMarkdown({file: file});
    }).then(function(result) {
        assert.equal(result.value, '\\(a\\)/\\(x^\\(2\\)\\)\n\n');
        assert.deepEqual(result.messages, []);
    });
});

function assertEquation(source, expected) {
    return mammoth.convertToHtml({file: docx('<w:p><m:oMath>' + source + '</m:oMath></w:p>')}).then(function(result) {
        assert.equal(result.value, '<p>' + mathStart + expected + '</math></p>');
        assert.deepEqual(result.messages, []);
    });
}

function run(text) {
    return '<m:r><m:t>' + text + '</m:t></m:r>';
}

function docx(body) {
    return createFakeDocxFile({
        "word/document.xml": '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
            'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>' + body + '</w:body></w:document>'
    });
}
