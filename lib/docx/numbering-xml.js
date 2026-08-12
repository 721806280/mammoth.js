var _ = require("underscore");

exports.readNumberingXml = readNumberingXml;
exports.Numbering = Numbering;
exports.defaultNumbering = new Numbering({}, {});

function Numbering(nums, abstractNums, styles) {
    var allLevels = _.flatten(_.values(abstractNums).map(function(abstractNum) {
        var levelDefinitions = levelDefinitionsForAbstractNum(abstractNum);
        return _.values(levelDefinitions).map(function(level) {
            return _.extend({}, level, {
                levelDefinitions: levelDefinitions
            });
        });
    }));

    var levelsByParagraphStyleId = _.indexBy(
        allLevels.filter(function(level) {
            return level.paragraphStyleId != null;
        }),
        "paragraphStyleId"
    );

    function findLevel(numId, level) {
        return findLevelWithSeenNumIds(numId, level, {});
    }

    function findLevelWithSeenNumIds(numId, level, seenNumIds) {
        if (seenNumIds[numId]) {
            return null;
        }
        seenNumIds[numId] = true;

        var num = nums[numId];
        if (!num) {
            return null;
        }

        var abstractNum = abstractNums[num.abstractNumId];
        var numberingLevel;
        var levelDefinitions;
        if (!abstractNum) {
            return null;
        } else if (abstractNum.numStyleLink == null) {
            levelDefinitions = levelDefinitionsForNum(num, abstractNum);
            numberingLevel = levelDefinitions[level];
        } else {
            var style = styles.findNumberingStyleById(abstractNum.numStyleLink);
            if (style == null) {
                return null;
            }
            numberingLevel = findLevelWithSeenNumIds(style.numId, level, seenNumIds);
            levelDefinitions = numberingLevel ? numberingLevel.levelDefinitions : {};
        }

        if (numberingLevel == null) {
            return null;
        } else {
            return _.extend({}, numberingLevel, (num.levelOverrides || {})[level], {
                levelDefinitions: levelDefinitions,
                numId: numId
            });
        }
    }

    function levelDefinitionsForNum(num, abstractNum) {
        var levelDefinitions = {};
        var levelOverrides = num.levelOverrides || {};
        var levelIndexes = _.uniq(_.keys(abstractNum.levels).concat(_.keys(levelOverrides)));
        levelIndexes.forEach(function(levelIndex) {
            levelDefinitions[levelIndex] = _.extend(
                {},
                abstractNum.levels[levelIndex],
                {level: levelIndex},
                levelOverrides[levelIndex]
            );
        });
        return levelDefinitions;
    }

    function levelDefinitionsForAbstractNum(abstractNum) {
        var levelDefinitions = {};
        _.keys(abstractNum.levels).forEach(function(levelIndex) {
            levelDefinitions[levelIndex] = _.extend({}, abstractNum.levels[levelIndex], {
                level: levelIndex
            });
        });
        return levelDefinitions;
    }

    function findLevelByParagraphStyleId(styleId) {
        return levelsByParagraphStyleId[styleId] || null;
    }

    return {
        findLevel: findLevel,
        findLevelByParagraphStyleId: findLevelByParagraphStyleId
    };
}

function readNumberingXml(root, options) {
    if (!options || !options.styles) {
        throw new Error("styles is missing");
    }

    var abstractNums = readAbstractNums(root);
    var nums = readNums(root, abstractNums);
    return new Numbering(nums, abstractNums, options.styles);
}

function readAbstractNums(root) {
    var abstractNums = {};
    root.getElementsByTagName("w:abstractNum").forEach(function(element) {
        var id = element.attributes["w:abstractNumId"];
        abstractNums[id] = readAbstractNum(element);
    });
    return abstractNums;
}

function readAbstractNum(element) {
    var levels = {};

    // Some malformed documents define numbering levels without an index, and
    // reference the numbering using a w:numPr element without a w:ilvl child.
    // To handle such cases, we assume a level of 0 as a fallback.
    var levelWithoutIndex = null;

    element.getElementsByTagName("w:lvl").forEach(function(levelElement) {
        var levelIndex = levelElement.attributes["w:ilvl"];
        var level = readLevel(levelElement, levelIndex || "0");

        if (levelIndex === undefined) {
            levelWithoutIndex = level;
        } else {
            levels[levelIndex] = level;
        }
    });

    if (levelWithoutIndex !== null && levels[levelWithoutIndex.level] === undefined) {
        levels[levelWithoutIndex.level] = levelWithoutIndex;
    }

    var numStyleLink = element.firstOrEmpty("w:numStyleLink").attributes["w:val"];

    return {levels: levels, numStyleLink: numStyleLink};
}

function readLevel(levelElement, levelIndex) {
    var numFmt = levelElement.firstOrEmpty("w:numFmt").attributes["w:val"];
    var isOrdered = numFmt !== "bullet";
    var paragraphStyleId = levelElement.firstOrEmpty("w:pStyle").attributes["w:val"];
    var levelText = levelElement.firstOrEmpty("w:lvlText").attributes["w:val"];
    var start = levelElement.firstOrEmpty("w:start").attributes["w:val"];

    return {
        isOrdered: isOrdered,
        level: levelIndex,
        numFmt: numFmt,
        paragraphStyleId: paragraphStyleId,
        levelText: levelText,
        start: start
    };
}

function readNums(root) {
    var nums = {};
    root.getElementsByTagName("w:num").forEach(function(element) {
        var numId = element.attributes["w:numId"];
        var abstractNumId = element.first("w:abstractNumId").attributes["w:val"];
        nums[numId] = {
            abstractNumId: abstractNumId,
            levelOverrides: readLevelOverrides(element)
        };
    });
    return nums;
}

function readLevelOverrides(element) {
    var levelOverrides = {};
    element.getElementsByTagName("w:lvlOverride").forEach(function(levelOverrideElement) {
        var levelIndex = levelOverrideElement.attributes["w:ilvl"];
        var startOverride = levelOverrideElement.firstOrEmpty("w:startOverride").attributes["w:val"];
        var levelElement = levelOverrideElement.first("w:lvl");
        if (levelIndex !== undefined && (startOverride !== undefined || levelElement !== null)) {
            levelOverrides[levelIndex] = levelElement ? readLevel(levelElement, levelIndex) : {};
            if (startOverride !== undefined) {
                levelOverrides[levelIndex].start = startOverride;
            }
        }
    });
    return levelOverrides;
}
