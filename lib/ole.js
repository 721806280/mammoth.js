// OLE readers provide the icon bytes; this module converts EMF/DIB data to a preview.
// The document converter remains responsible for HTML output and fallback layout.
var base64js = require("base64-js");

// Encoder and decoders are created on first use and reused: constructing them per
// call showed up as avoidable churn when a document holds many OLE previews.
var textEncoder = null;
var textDecoders = {};

exports.createPreviewIcon = createOlePreviewIcon;
exports.fallbackIcon = generatedOleLabelIconSrc;
exports.extractText = extractEmfText;
exports.looksLikeMojibake = looksLikeMojibake;

function looksLikeMojibake(text) {
    return /\uFFFD/.test(text) || /(?:Ã.|Â.|Ð.|Ñ.)/.test(text);
}

function generatedOleLabelIconSrc(element, label) {
    var fontSize = 13;
    var safeLabel = String(label || "");
    var width = Math.max(128, 66 + measureOleText(safeLabel, fontSize) + 8);
    var height = 58;
    var color = oleIconColor(element ? element.progId : "");
    var initial = oleIconInitial(element ? element.progId : "");
    var svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height +
        '" width="' + width + '" height="' + height + '">' +
        '<rect x="1" y="1" width="56" height="56" rx="9" fill="#ffffff" stroke="#D1D5DB"/>' +
        '<path d="M35 2v13h13" fill="#F8FAFC" stroke="#D1D5DB"/>' +
        '<rect x="10" y="34" width="38" height="14" rx="3" fill="' + color + '"/>' +
        '<text x="29" y="44" font-family="Arial,sans-serif" font-size="10" font-weight="bold" ' +
        'fill="#ffffff" text-anchor="middle">' + xmlEscape(initial) + '</text>' +
        '<text x="66" y="35" font-family="Arial,sans-serif" font-size="' + fontSize + '" fill="#202938">' +
        xmlEscape(safeLabel) + '</text>' +
        '</svg>'
    );
    return {
        src: "data:image/svg+xml;base64," + encodeToTypedBase64(svg),
        width: width,
        height: height
    };
}

function measureOleText(text, fontSize) {
    var width = 0;
    var str = String(text);
    for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        width += (code >= 0x2e80 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)
            ? fontSize
            : fontSize * 0.6;
    }
    return Math.ceil(width);
}

function oleIconColor(progId) {
    var pid = String(progId || "").toLowerCase();
    if (pid.indexOf("excel") !== -1) {
        return "#217346";
    }
    if (pid.indexOf("word") !== -1) {
        return "#2B579A";
    }
    if (pid.indexOf("powerpoint") !== -1) {
        return "#D24726";
    }
    if (pid.indexOf("visio") !== -1) {
        return "#3955A3";
    }
    return "#64748B";
}

function oleIconInitial(progId) {
    var pid = String(progId || "").toLowerCase();
    if (pid.indexOf("excel") !== -1) {
        return "E";
    }
    if (pid.indexOf("word") !== -1) {
        return "W";
    }
    if (pid.indexOf("powerpoint") !== -1) {
        return "P";
    }
    if (pid.indexOf("visio") !== -1) {
        return "V";
    }
    return "F";
}

function xmlEscape(value) {
    if (value == null) {
        return "";
    }
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function extractEmfBitmap(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer);
    var dib = findDibInEmf(bytes);
    if (!dib) {
        return null;
    }

    return {
        base64: wrapDibAsPngBase64(dib),
        mimeType: "image/png",
        width: dib.width,
        height: Math.abs(dib.height),
        x: dib.x,
        y: dib.y,
        displayWidth: dib.displayWidth || dib.width,
        displayHeight: dib.displayHeight || Math.abs(dib.height)
    };
}

function createOlePreviewIcon(arrayBuffer, label) {
    var bytes = new Uint8Array(arrayBuffer);
    var bitmap = extractEmfBitmap(bytes);
    if (!bitmap) {
        return null;
    }

    var bounds = readEmfBounds(bytes);
    var textRecords = extractEmfTextRecords(bytes);
    var extractedText = textRecords.map(function(r) {
        return r.text;
    }).join("");

    if (!extractedText || looksLikeMojibake(extractedText)) {
        textRecords = [];
    }

    var padding = 2;
    var left = bounds ? bounds.left - padding : 0;
    var top = bounds ? bounds.top - padding : 0;
    var right = bounds ? bounds.right + padding : bitmap.displayWidth + padding * 2;
    var bottom = bounds ? bounds.bottom + padding : bitmap.displayHeight + 24;
    var bitmapLeft = bitmap.x == null ? left + (right - left - bitmap.displayWidth) / 2 : bitmap.x;
    var bitmapTop = bitmap.y == null ? top : bitmap.y;

    left = Math.min(left, bitmapLeft - padding);
    top = Math.min(top, bitmapTop - padding);
    right = Math.max(right, bitmapLeft + bitmap.displayWidth + padding);
    bottom = Math.max(bottom, bitmapTop + bitmap.displayHeight + padding);

    if (textRecords.length === 0 && label) {
        var fallbackFontSize = 16;
        var fallbackTextWidth = measureOleText(label, fallbackFontSize);
        var fallbackWidth = fallbackTextWidth + padding * 2;
        right = Math.max(right, left + fallbackWidth);
        bottom = Math.max(bottom, top + bitmap.displayHeight + fallbackFontSize + 8);
        textRecords = [{
            text: String(label),
            x: left + (right - left) / 2,
            y: top + bitmap.displayHeight + 4,
            left: left,
            top: top + bitmap.displayHeight + 2,
            right: left + fallbackWidth,
            bottom: bottom,
            fontSize: fallbackFontSize
        }];
    }

    var width = Math.max(1, right - left);
    var height = Math.max(1, bottom - top);
    var imageX = bitmap.x == null ? left + (width - bitmap.displayWidth) / 2 : bitmap.x;
    var imageY = bitmap.y == null ? top : bitmap.y;

    var svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="' + left + ' ' + top + ' ' + width + ' ' + height +
        '" width="' + width + '" height="' + height + '">' +
        '<image x="' + imageX + '" y="' + imageY + '" width="' + bitmap.displayWidth +
        '" height="' + bitmap.displayHeight + '" xlink:href="data:' + bitmap.mimeType + ';base64,' + bitmap.base64 + '" ' +
        'preserveAspectRatio="none" />' +
        textRecords.map(emfTextSvg).join("") +
        '</svg>'
    );

    return {
        src: "data:image/svg+xml;base64," + encodeToTypedBase64(svg),
        width: width,
        height: height
    };
}

function readEmfBounds(bytes) {
    if (bytes.length < 24 || readUInt32LE(bytes, 0) !== 1) {
        return null;
    }

    var left = readInt32LE(bytes, 8);
    var top = readInt32LE(bytes, 12);
    var right = readInt32LE(bytes, 16);
    var bottom = readInt32LE(bytes, 20);

    if (right <= left || bottom <= top || right - left > 4096 || bottom - top > 4096) {
        return null;
    }
    return {left: left, top: top, right: right, bottom: bottom};
}

function emfTextSvg(record) {
    var fontSize = record.fontSize || Math.max(10, Math.round((record.bottom - record.top) * 0.7));
    var width = record.right - record.left;
    var textLength = width > 0 ? ' textLength="' + width + '" lengthAdjust="spacingAndGlyphs"' : '';
    return '<text x="' + record.x + '" y="' + record.y + '" font-family="Microsoft YaHei UI,Microsoft YaHei,Arial,sans-serif"' +
        ' font-size="' + fontSize + '" fill="#000000" text-anchor="middle" dominant-baseline="hanging"' +
        textLength + '>' + xmlEscape(record.text) + '</text>';
}

// Extracts the device-independent bitmap (DIB) embedded in an EMF icon.
// Word/WPS draw the application icon as a DIB (BITMAPINFOHEADER + optional
// bitfield masks + pixel array) wrapped in a StretchDIBITS-style record. The
// record types are not always spec-compliant, so fall back to walking the
// bitmap info header signature directly.
function findDibInEmf(bytes) {
    var recordDib = findDibInEmfRecords(bytes);
    if (recordDib) {
        return recordDib;
    }

    // BITMAPINFOHEADER opens with its own size, 40 as a little-endian uint32.
    for (var i = 0; i + 40 <= bytes.length; i++) {
        if (bytes[i] === 0x28 && bytes[i + 1] === 0x00 && bytes[i + 2] === 0x00 && bytes[i + 3] === 0x00) {
            var header = bytes.subarray(i, i + 40);
            var info = readDibInfo(header);
            if (info && i + info.bmiSize + info.pixelSize <= bytes.length) {
                return {
                    header: bytes.subarray(i, i + info.bmiSize),
                    pixels: bytes.subarray(i + info.bmiSize, i + info.bmiSize + info.pixelSize),
                    width: info.width,
                    height: info.height,
                    bpp: info.bpp,
                    rowSize: info.rowSize,
                    compression: info.compression
                };
            }
        }
    }
    return null;
}

// EMF bitmap records keep the bitmap info and pixels at offsets recorded in
// the record rather than necessarily placing them back-to-back. Handle the
// common records used by Office for OLE previews before falling back to the
// contiguous DIB scan above.
function findDibInEmfRecords(bytes) {
    var offset = 0;
    while (offset + 8 <= bytes.length) {
        var type = readUInt32LE(bytes, offset);
        var size = readUInt32LE(bytes, offset + 4);
        if (size < 8 || offset + size > bytes.length) {
            return null;
        }

        var record = bytes.subarray(offset, offset + size);
        var dib = findDibInRecord(record, type);
        if (dib) {
            return dib;
        }

        offset += size;
    }
    return null;
}

function findDibInRecord(record, type) {
    var offsets;
    var destinationOffsets = null;
    if (type === 76 || type === 77 || type === 114 || type === 116) {
        // EMR_BITBLT/STRETCHBLT/ALPHABLEND/TRANSPARENTBLT share a record layout.
        offsets = [84, 88, 92, 96];
        destinationOffsets = [24, 28, 32, 36];
    } else if (type === 80) { // EMR_SETDIBITSTODEVICE
        offsets = [48, 52, 56, 60];
        destinationOffsets = [24, 28, 40, 72];
    } else if (type === 81) { // EMR_STRETCHDIBITS
        offsets = [48, 52, 56, 60];
        destinationOffsets = [24, 28, 72, 76];
    } else {
        return null;
    }

    if (offsets[3] + 4 > record.length) {
        return null;
    }

    var offBmi = readUInt32LE(record, offsets[0]);
    var cbBmi = readUInt32LE(record, offsets[1]);
    var offBits = readUInt32LE(record, offsets[2]);
    var cbBits = readUInt32LE(record, offsets[3]);

    if (cbBmi < 40 || cbBits === 0 || offBmi + cbBmi > record.length || offBits + cbBits > record.length) {
        return null;
    }

    var header = record.subarray(offBmi, offBmi + cbBmi);
    var info = readDibInfo(header);
    if (!info || info.bmiSize > cbBmi || info.pixelSize > cbBits) {
        return null;
    }

    var result = {
        header: header,
        pixels: record.subarray(offBits, offBits + info.pixelSize),
        width: info.width,
        height: info.height,
        bpp: info.bpp,
        rowSize: info.rowSize,
        compression: info.compression
    };

    if (destinationOffsets) {
        result.x = readInt32LE(record, destinationOffsets[0]);
        result.y = readInt32LE(record, destinationOffsets[1]);
        result.displayWidth = Math.abs(readInt32LE(record, destinationOffsets[2]));
        result.displayHeight = Math.abs(readInt32LE(record, destinationOffsets[3]));
    }
    return result;
}

function readDibInfo(header) {
    if (header.length < 40) {
        return null;
    }
    var headerSize = readUInt32LE(header, 0);
    if (headerSize < 40 || headerSize > header.length) {
        return null;
    }

    var width = readInt32LE(header, 4);
    var height = readInt32LE(header, 8);
    var planes = readUInt16LE(header, 12);
    var bpp = readUInt16LE(header, 14);
    var compression = readUInt32LE(header, 16);

    if (planes !== 1 || width <= 0 || width > 4096 || height === 0 || Math.abs(height) > 4096) {
        return null;
    }
    if ([1, 4, 8, 16, 24, 32].indexOf(bpp) === -1) {
        return null;
    }
    if ([0, 3].indexOf(compression) === -1) {
        return null;
    }

    var absHeight = Math.abs(height);
    var colorUsed = readUInt32LE(header, 32);
    var paletteEntries = (bpp < 16) ? Math.min(colorUsed || (1 << bpp), 1 << bpp) : 0;
    var maskSize = (compression === 3) ? 12 : 0;
    var bmiSize = 40 + maskSize + paletteEntries * 4;
    var rowSize = Math.floor(((bpp * width) + 31) / 32) * 4;
    var pixelSize = rowSize * absHeight;

    return {
        width: width,
        height: height,
        bpp: bpp,
        compression: compression,
        maskSize: maskSize,
        bmiSize: bmiSize,
        rowSize: rowSize,
        pixelSize: pixelSize
    };
}

function wrapDibAsPngBase64(dib) {
    var rgba = dibToRgba(dib);
    var width = dib.width;
    var height = Math.abs(dib.height);
    if (!hasTransparency(rgba)) {
        removeBlackBackgroundFromRgba(rgba, width, height);
    }
    return encodeRgbaPng(rgba, width, height);
}

function dibToRgba(dib) {
    var width = dib.width;
    var height = Math.abs(dib.height);
    var rgba = new Uint8Array(width * height * 4);
    var paletteOffset = 40 + ((dib.compression === 3) ? 12 : 0);
    var palette = dib.header.subarray(paletteOffset);

    var redMask = 0x7C00;
    var greenMask = 0x03E0;
    var blueMask = 0x001F;
    if (dib.compression === 3 && dib.header.length >= 52) {
        redMask = readUInt32LE(dib.header, 40);
        greenMask = readUInt32LE(dib.header, 44);
        blueMask = readUInt32LE(dib.header, 48);
    }

    var hasAlpha = false;
    for (var y = 0; y < height; y++) {
        var sourceY = dib.height > 0 ? height - y - 1 : y;
        var sourceRow = sourceY * dib.rowSize;
        var targetRow = y * width * 4;

        for (var x = 0; x < width; x++) {
            var sourceOffset = sourceRow + pixelOffsetForX(dib, x);
            var color = readDibPixel(dib, sourceOffset, x, palette, redMask, greenMask, blueMask);
            var targetOffset = targetRow + (x * 4);

            rgba[targetOffset] = color.red;
            rgba[targetOffset + 1] = color.green;
            rgba[targetOffset + 2] = color.blue;
            rgba[targetOffset + 3] = color.alpha;

            if (color.alpha !== 0) {
                hasAlpha = true;
            }
        }
    }

    // Many Office EMF icons carry an all-zero alpha channel. Synthesising alpha
    // from the colour channels keeps the icon's transparent background.
    if (dib.bpp === 32 && !hasAlpha) {
        for (var i = 0; i < rgba.length; i += 4) {
            rgba[i + 3] = (rgba[i] !== 0 || rgba[i + 1] !== 0 || rgba[i + 2] !== 0) ? 255 : 0;
        }
    }
    return rgba;
}

function pixelOffsetForX(dib, x) {
    if (dib.bpp < 8) {
        return Math.floor((x * dib.bpp) / 8);
    }
    return x * (dib.bpp / 8);
}

function readDibPixel(dib, offset, x, palette, redMask, greenMask, blueMask) {
    var bytes = dib.pixels;
    if (dib.bpp <= 8) {
        var index;
        if (dib.bpp === 1) {
            index = (bytes[offset] >> (7 - (x % 8))) & 1;
        } else if (dib.bpp === 4) {
            index = (bytes[offset] >> (x % 2 === 0 ? 4 : 0)) & 0xF;
        } else {
            index = bytes[offset];
        }
        var pOff = index * 4;
        if (pOff + 3 < palette.length) {
            return {red: palette[pOff + 2], green: palette[pOff + 1], blue: palette[pOff], alpha: 255};
        }
        return {red: 255, green: 255, blue: 255, alpha: 255};
    } else if (dib.bpp === 16) {
        var value16 = bytes[offset] | (bytes[offset + 1] << 8);
        return colorFromMask(value16, redMask, greenMask, blueMask, 255);
    } else if (dib.bpp === 24) {
        return {red: bytes[offset + 2], green: bytes[offset + 1], blue: bytes[offset], alpha: 255};
    }
    return {red: bytes[offset + 2], green: bytes[offset + 1], blue: bytes[offset], alpha: bytes[offset + 3]};
}

function colorFromMask(value, redMask, greenMask, blueMask, alpha) {
    return {
        red: scaleMaskedChannel(value, redMask),
        green: scaleMaskedChannel(value, greenMask),
        blue: scaleMaskedChannel(value, blueMask),
        alpha: alpha
    };
}

function scaleMaskedChannel(value, mask) {
    if (!mask) {
        return 0;
    }
    var shift = 0;
    var temp = mask;
    while ((temp & 1) === 0) {
        shift++;
        temp >>>= 1;
    }
    var channel = (value & mask) >>> shift;
    var max = mask >>> shift;
    return max ? Math.round((channel * 255) / max) : 0;
}

function hasTransparency(rgba) {
    for (var i = 3; i < rgba.length; i += 4) {
        if (rgba[i] !== 255) {
            return true;
        }
    }
    return false;
}

function removeBlackBackgroundFromRgba(rgba, width, height) {
    var totalPixels = width * height;
    var visited = new Uint8Array(totalPixels);
    var queue = [];
    var head = 0;

    for (var x = 0; x < width; x++) {
        queue.push(x);
        queue.push((height - 1) * width + x);
    }
    for (var y = 1; y < height - 1; y++) {
        queue.push(y * width);
        queue.push(y * width + width - 1);
    }

    while (head < queue.length) {
        var pixel = queue[head++];
        if (!visited[pixel] && isBlackRgbaPixel(rgba, pixel)) {
            visited[pixel] = 1;
            rgba[pixel * 4 + 3] = 0;

            var px = pixel % width;
            var py = Math.floor(pixel / width);

            if (px > 0) {
                queue.push(pixel - 1);
            }
            if (px + 1 < width) {
                queue.push(pixel + 1);
            }
            if (py > 0) {
                queue.push(pixel - width);
            }
            if (py + 1 < height) {
                queue.push(pixel + width);
            }
        }
    }
}

function isBlackRgbaPixel(rgba, pixel) {
    var offset = pixel * 4;
    return rgba[offset + 3] !== 0 && rgba[offset] < 24 && rgba[offset + 1] < 24 && rgba[offset + 2] < 24;
}

function encodeRgbaPng(rgba, width, height) {
    var rowLength = width * 4 + 1;
    var raw = new Uint8Array(rowLength * height);

    for (var y = 0; y < height; y++) {
        var rowOffset = y * rowLength;
        raw[rowOffset] = 0; // PNG filter: None
        raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowOffset + 1);
    }

    var ihdr = new Uint8Array(13);
    writeUInt32BE(ihdr, width, 0);
    writeUInt32BE(ihdr, height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA colour type

    var idatData = encodeUncompressedZlib(raw);
    var chunks = [
        pngChunk("IHDR", ihdr),
        pngChunk("IDAT", idatData),
        pngChunk("IEND", new Uint8Array(0))
    ];

    var totalLength = 8;
    for (var i = 0; i < chunks.length; i++) {
        totalLength += chunks[i].length;
    }

    var png = new Uint8Array(totalLength);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    var offset = 8;

    for (var j = 0; j < chunks.length; j++) {
        png.set(chunks[j], offset);
        offset += chunks[j].length;
    }
    return base64js.fromByteArray(png);
}

function pngChunk(type, data) {
    var chunk = new Uint8Array(data.length + 12);
    writeUInt32BE(chunk, data.length, 0);
    for (var i = 0; i < 4; i++) {
        chunk[4 + i] = type.charCodeAt(i);
    }
    chunk.set(data, 8);
    writeUInt32BE(chunk, crc32(chunk.subarray(4, data.length + 8)), data.length + 8);
    return chunk;
}

function encodeUncompressedZlib(data) {
    var blockCount = Math.ceil(data.length / 65535);
    var result = new Uint8Array(2 + data.length + blockCount * 5 + 4);
    result[0] = 0x78;
    result[1] = 0x01;

    var inputOffset = 0;
    var outputOffset = 2;

    while (inputOffset < data.length) {
        var blockLength = Math.min(65535, data.length - inputOffset);
        var isFinal = (inputOffset + blockLength === data.length);

        result[outputOffset++] = isFinal ? 1 : 0;
        result[outputOffset++] = blockLength & 0xFF;
        result[outputOffset++] = (blockLength >>> 8) & 0xFF;
        result[outputOffset++] = (~blockLength) & 0xFF;
        result[outputOffset++] = (~blockLength >>> 8) & 0xFF;

        result.set(data.subarray(inputOffset, inputOffset + blockLength), outputOffset);
        inputOffset += blockLength;
        outputOffset += blockLength;
    }

    writeUInt32BE(result, adler32(data), outputOffset);
    return result;
}

function adler32(data) {
    var a = 1;
    var b = 0;
    for (var i = 0; i < data.length; i++) {
        a = (a + data[i]) % 65521;
        b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
}

function crc32(data) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (var bit = 0; bit < 8; bit++) {
            crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function writeUInt32BE(bytes, value, offset) {
    bytes[offset] = (value >>> 24) & 0xFF;
    bytes[offset + 1] = (value >>> 16) & 0xFF;
    bytes[offset + 2] = (value >>> 8) & 0xFF;
    bytes[offset + 3] = value & 0xFF;
}

function readUInt32LE(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readInt32LE(bytes, offset) {
    var value = readUInt32LE(bytes, offset);
    return value > 0x7FFFFFFF ? value - 0x100000000 : value;
}

function readUInt16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
}

function extractEmfText(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer);
    return extractEmfTextRecords(bytes).map(function(r) {
        return r.text;
    }).join("").replace(/\s+/g, " ").trim();
}

function extractEmfTextRecords(bytes) {
    var offset = 0;
    var records = [];
    while (offset + 8 <= bytes.length) {
        var type = readUInt32LE(bytes, offset);
        var size = readUInt32LE(bytes, offset + 4);
        if (size < 8 || offset + size > bytes.length) {
            break;
        }

        if (type === 84 || type === 83) { // EMR_EXTTEXTOUTW/EMR_EXTTEXTOUTA
            var record = bytes.subarray(offset, offset + size);
            var textOffset = 36; // header (8) + bounds (16) + iGraphicsMode, exScale, eyScale
            if (textOffset + 16 <= record.length) {
                var nChars = readUInt32LE(record, textOffset + 8);
                var offString = readUInt32LE(record, textOffset + 12);
                if (nChars > 0 && offString > 0) {
                    var charSize = (type === 84) ? 2 : 1;
                    var end = offString + nChars * charSize;
                    if (end <= record.length) {
                        var snippet = record.subarray(offString, end);
                        var text = (type === 84) ? decodeUtf16LE(snippet) : decodeAscii(snippet);
                        if (text && /\S/.test(text)) {
                            records.push({
                                text: text,
                                x: readInt32LE(record, textOffset),
                                y: readInt32LE(record, textOffset + 4),
                                left: readInt32LE(record, 8),
                                top: readInt32LE(record, 12),
                                right: readInt32LE(record, 16),
                                bottom: readInt32LE(record, 20)
                            });
                        }
                    }
                }
            }
        }
        offset += size;
    }
    return records;
}

function decodeUtf16LE(bytes) {
    var chars = [];
    for (var i = 0; i + 1 < bytes.length; i += 2) {
        var code = bytes[i] | (bytes[i + 1] << 8);
        if (code !== 0) {
            chars.push(String.fromCharCode(code));
        }
    }
    return chars.join("");
}

function decodeAscii(bytes) {
    var utf8 = decodeText(bytes, "utf-8");
    if (utf8) {
        return utf8;
    }
    var gb18030 = decodeText(bytes, "gb18030");
    if (gb18030) {
        return gb18030;
    }

    var chars = [];
    for (var i = 0; i < bytes.length; i++) {
        if (bytes[i] !== 0) {
            chars.push(String.fromCharCode(bytes[i]));
        }
    }
    return chars.join("");
}

// Decoders are stateless between non-streaming decode() calls, including after a
// fatal error, so one instance per encoding can be reused.
function decodeText(bytes, encoding) {
    try {
        if (!textDecoders[encoding]) {
            textDecoders[encoding] = new TextDecoder(encoding, {fatal: true});
        }
        var text = textDecoders[encoding].decode(bytes);
        return /\S/.test(text) ? text : "";
    } catch (error) {
        return "";
    }
}

function encodeToTypedBase64(value) {
    if (!textEncoder) {
        textEncoder = new TextEncoder();
    }
    return base64js.fromByteArray(textEncoder.encode(value));
}
