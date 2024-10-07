"use strict";

// Adapted from: https://github.com/mozilla-b2g/gaia/blob/f34ce82a840ad3c0aed3bfff18517b3f6a0eb37f/build/l10n/qps.js
// This is a pseudolocalization module for testing localization.

var reAlphas = /[a-zA-Z]/g;
var reVowels = /[aeiouAEIOU]/g;

// ȦƁƇḒḖƑƓĦĪĴĶĿḾȠǾƤɊŘŞŦŬṼẆẊẎẐ + [\\]^_` + ȧƀƈḓḗƒɠħīĵķŀḿƞǿƥɋřşŧŭṽẇẋẏẑ
var ACCENTED_MAP =
    "\u0226\u0181\u0187\u1E12\u1E16\u0191\u0193\u0126\u012A" +
    "\u0134\u0136\u013F\u1E3E\u0220\u01FE\u01A4\u024A\u0158" +
    "\u015E\u0166\u016C\u1E7C\u1E86\u1E8A\u1E8E\u1E90" +
    "[\\]^_`" +
    "\u0227\u0180\u0188\u1E13\u1E17\u0192\u0260\u0127\u012B" +
    "\u0135\u0137\u0140\u1E3F\u019E\u01FF\u01A5\u024B\u0159" +
    "\u015F\u0167\u016D\u1E7D\u1E87\u1E8B\u1E8F\u1E91";

// ∀ԐↃpƎɟפHIſӼ˥WNOԀÒᴚS⊥∩ɅＭXʎZ + [\\]ᵥ_, + ɐqɔpǝɟƃɥıɾʞʅɯuodbɹsʇnʌʍxʎz
var FLIPPED_MAP =
    "\u2200\u0510\u2183p\u018E\u025F\u05E4HI\u017F" +
    "\u04FC\u02E5WNO\u0500\xD2\u1D1AS\u22A5\u2229\u0245" +
    "\uFF2DX\u028EZ" +
    "[\\]\u1D65_," +
    "\u0250q\u0254p\u01DD\u025F\u0183\u0265\u0131\u027E" +
    "\u029E\u0285\u026Fuodb\u0279s\u0287n\u028C\u028Dx\u028Ez";

function makeLonger(val) {
    return val.replace(reVowels, function (match) {
        return match + match.toLowerCase();
    });
}

function replaceChars(map, val) {
    // Replace each Latin letter with a Unicode character from map
    return val.replace(reAlphas, function (match) {
        return map.charAt(match.charCodeAt(0) - 65);
    });
}

var reWords = /[^\W0-9_]+/g;

function makeRTL(val) {
    // Surround each word with Unicode formatting codes, RLO and PDF:
    //   U+202E:   RIGHT-TO-LEFT OVERRIDE (RLO)
    //   U+202C:   POP DIRECTIONAL FORMATTING (PDF)
    // See http://www.w3.org/International/questions/qa-bidi-controls
    return val.replace(reWords, function (match) {
        return "\u202e" + match + "\u202c";
    });
}

// strftime tokens (%a, %Eb) and template {vars}
var reExcluded = /(%[EO]?\w|\{\s*.+?\s*\})/;

function mapContent(fn, val) {
    if (!val) {
        return val;
    }
    var parts = val.split(reExcluded);
    var modified = parts.map(function (part) {
        if (reExcluded.test(part)) {
            return part;
        }
        return fn(part);
    });
    return modified.join("");
}

class Pseudo {
    constructor(id, name, charMap, modFn) {
        this.id = id;
        this.translate = mapContent.bind(null, function (val) {
            return replaceChars(charMap, modFn(val));
        });
        this.name = this.translate(name);
    }
}

export const PSEUDO = {
    xa: new Pseudo("xa", "Packaged Accented", ACCENTED_MAP, makeLonger),
    xb: new Pseudo("xb", "Packaged Mirrored", FLIPPED_MAP, makeRTL),
};
