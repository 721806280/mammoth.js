exports.convertToText = convertToText;

function convertToText(element) {
    if (element.type === "text") {
        return element.value.replace(/\u00a0/g, " ").replace(/\u2061/g, "");
    }
    var children = element.children.map(convertToText);
    switch (element.name) {
    case "mfrac":
        return "(" + children[0] + ")/(" + children[1] + ")";
    case "msqrt":
        return "sqrt(" + children.join("") + ")";
    case "mroot":
        return "root(" + children[1] + ", " + children[0] + ")";
    case "msub":
    case "munder":
        return children[0] + "_(" + children[1] + ")";
    case "msup":
    case "mover":
        return children[0] + "^(" + children[1] + ")";
    case "msubsup":
    case "munderover":
        return children[0] + "_(" + children[1] + ")^(" + children[2] + ")";
    case "mtable":
        return children.join("; ");
    case "mtr":
        return children.join(", ");
    default:
        return children.join("");
    }
}
