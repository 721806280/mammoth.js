var hamjest = require("hamjest");
var assertThat = hamjest.assertThat;
var equalTo = hamjest.equalTo;
var containsString = hamjest.containsString;

var documents = require("../lib/documents");
var promises = require("../lib/promises");

var test = require("./test")(module);


// Browser bundlers no longer polyfill Node's `Buffer`, so the Buffer-returning
// readers have to explain themselves rather than throwing a bare ReferenceError.
function withoutBuffer(action) {
    var savedBuffer = global.Buffer;
    delete global.Buffer;
    function restore() {
        global.Buffer = savedBuffer;
    }
    return promises.attempt(action).then(function(result) {
        restore();
        return result;
    }, function(error) {
        restore();
        throw error;
    });
}

function assertRejectsWithoutBuffer(readBytes) {
    return withoutBuffer(readBytes).then(function() {
        throw new Error("expected read to be rejected");
    }, function(error) {
        assertThat(error.message, containsString("Buffer is not defined"));
        assertThat(error.message, containsString("readAsArrayBuffer()"));
        assertThat(error.message, containsString("readAsBase64String()"));
    });
}

// The readers are exercised with Buffer deleted, so the test double encodes its
// payload up front rather than reaching for Buffer at read time.
function imageOf(bytes) {
    var buffer = Buffer.from(bytes);
    var arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    var encodings = {base64: buffer.toString("base64")};
    return new documents.Image({
        contentType: "image/png",
        readImage: function(encoding) {
            return promises.when(encoding ? encodings[encoding] : arrayBuffer);
        }
    });
}


test("Image", {
    "read() without an encoding returns a Buffer": function() {
        return imageOf([1, 2, 3]).read().then(function(buffer) {
            assertThat(Buffer.isBuffer(buffer), equalTo(true));
            assertThat(buffer.toString("hex"), equalTo("010203"));
        });
    },

    "readAsBuffer() returns a Buffer": function() {
        return imageOf([1, 2, 3]).readAsBuffer().then(function(buffer) {
            assertThat(Buffer.isBuffer(buffer), equalTo(true));
            assertThat(buffer.toString("hex"), equalTo("010203"));
        });
    },

    "read() without an encoding is rejected when Buffer is unavailable": function() {
        var image = imageOf([1, 2, 3]);
        return assertRejectsWithoutBuffer(function() {
            return image.read();
        });
    },

    "readAsBuffer() is rejected when Buffer is unavailable": function() {
        var image = imageOf([1, 2, 3]);
        return assertRejectsWithoutBuffer(function() {
            return image.readAsBuffer();
        });
    },

    "read(encoding) does not need Buffer": function() {
        var image = imageOf([1, 2, 3]);
        return withoutBuffer(function() {
            return image.read("base64");
        }).then(function(base64) {
            assertThat(base64, equalTo("AQID"));
        });
    },

    "readAsArrayBuffer() does not need Buffer": function() {
        var image = imageOf([1, 2, 3]);
        return withoutBuffer(function() {
            return image.readAsArrayBuffer();
        }).then(function(arrayBuffer) {
            assertThat(new Uint8Array(arrayBuffer).length, equalTo(3));
        });
    }
});
