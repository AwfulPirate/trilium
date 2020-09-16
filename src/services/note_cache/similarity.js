const noteCache = require('./note_cache');
const noteCacheService = require('./note_cache_service.js');
const dateUtils = require('../date_utils');

const IGNORED_ATTR_NAMES = [
    "includenotelink",
    "internallink",
    "imagelink",
    "relationmaplink"
];

function filterLabelValue(value) {
    return value
        .replace(/https?:\/\//ig, "")
        .replace(/www\./ig, "")
        .replace(/(\.net|\.com|\.org|\.info|\.edu)/ig, "");
}

/**
 * @param {Note} note
 */
function buildRewardMap(note) {
    const map = {};

    function addToRewardMap(text, baseReward) {
        if (!text) {
            return;
        }

        for (const word of splitToWords(text)) {
            if (word) {
                map[word] = map[word] || 0;

                // reward grows with the length of matched string
                map[word] += baseReward * Math.sqrt(word.length);
            }
        }
    }

    for (const ancestorNote of note.ancestors) {
        if (ancestorNote.isDecrypted) {
            addToRewardMap(ancestorNote.title, 0.3);
        }

        for (const branch of ancestorNote.parentBranches) {
            addToRewardMap(branch.prefix, 0.3);
        }
    }

    addToRewardMap(note.type, 0.2);
    addToRewardMap(trimMime(note.mime), 0.3);

    if (note.isDecrypted) {
        addToRewardMap(note.title, 1);
    }

    for (const branch of note.parentBranches) {
        addToRewardMap(branch.prefix, 1);
    }

    for (const attr of note.attributes) {
        const reward = note.noteId === attr.noteId ? 0.8 : 0.5;

        if (!IGNORED_ATTR_NAMES.includes(attr.name)) {
            addToRewardMap(attr.name, reward);
        }

        addToRewardMap(filterLabelValue(attr.value), reward);
    }

    return map;
}

const mimeCache = {};

function trimMime(mime) {
    if (!mime || mime === 'text/html') {
        return;
    }

    if (!(mime in mimeCache)) {
        const chunks = mime.split('/');

        let str = "";

        if (chunks.length >= 2) {
            // we're not interested in 'text/' or 'application/' prefix
            str = chunks[1];

            if (str.startsWith('-x')) {
                str = str.substr(2);
            }
        }

        mimeCache[mime] = str;
        mimeCache[mime] = str;
    }

    return mimeCache[mime];
}

function buildDateLimits(baseNote) {
    const dateCreatedTs = dateUtils.parseDateTime(baseNote.utcDateCreated);

    return {
        minDate: dateUtils.utcDateStr(new Date(dateCreatedTs - 1800)),
        minExcludedDate: dateUtils.utcDateStr(new Date(dateCreatedTs - 5)),
        maxExcludedDate: dateUtils.utcDateStr(new Date(dateCreatedTs + 5)),
        maxDate: dateUtils.utcDateStr(new Date(dateCreatedTs + 1800)),
    };
}

const wordCache = {};

function splitToWords(text) {
    let words = wordCache[text];

    if (!words) {
        wordCache[text] = words = text.toLowerCase().split(/\W+/);

        for (const idx in words) {
            // special case for english plurals
            if (words[idx].endsWith("s")) {
                words[idx] = words[idx].substr(0, words[idx] - 1);
            }
        }
    }

    return words;
}

async function findSimilarNotes(noteId) {
    const results = [];
    let i = 0;

    const baseNote = noteCache.notes[noteId];

    if (!baseNote) {
        return [];
    }

    const dateLimits = buildDateLimits(baseNote);
    const rewardMap = buildRewardMap(baseNote);
    const ancestorRewardCache = {};
    const ancestorNoteIds = new Set(baseNote.ancestors.map(note => note.noteId));

    function gatherRewards(text, factor = 1) {
        if (!text) {
            return 0;
        }

        let counter = 0;

        // when the title is very long then weight of each individual word should be lower
        // also pretty important in e.g. long URLs in label values
        const lengthPenalization = 1 / Math.pow(text.length, 0.3);

        for (const word of splitToWords(text)) {
            counter += rewardMap[word] * factor * lengthPenalization || 0;
        }

        return counter;
    }

    function gatherAncestorRewards(note) {
        if (!(note.noteId in ancestorRewardCache)) {
            let score = 0;

            for (const parentNote of note.parents) {
                if (!ancestorNoteIds.has(parentNote.noteId)) {
                    if (parentNote.isDecrypted) {
                        score += gatherRewards(parentNote.title, 0.3);
                    }

                    for (const branch of parentNote.parentBranches) {
                        score += gatherRewards(branch.prefix, 0.3)
                               + gatherAncestorRewards(branch.parentNote);
                    }
                }
            }

            ancestorRewardCache[note.noteId] = score;
        }

        return ancestorRewardCache[note.noteId];
    }

    function computeScore(candidateNote) {
        let score = gatherRewards(trimMime(candidateNote.mime))
                  + gatherAncestorRewards(candidateNote);

        if (candidateNote.isDecrypted) {
            score += gatherRewards(candidateNote.title);
        }

        for (const branch of candidateNote.parentBranches) {
            score += gatherRewards(branch.prefix);
        }

        for (const attr of candidateNote.attributes) {
            if (!IGNORED_ATTR_NAMES.includes(attr.name)) {
                score += gatherRewards(attr.name);
            }

            score += gatherRewards(attr.value);
        }

        if (candidateNote.type === baseNote.type) {
            score += 0.2;
        }

        /**
         * We want to improve standing of notes which have been created in similar time to each other since
         * there's a good chance they are related.
         *
         * But there's an exception - if they were created really close to each other (withing few seconds) then
         * they are probably part of the import and not created by hand - these OTOH should not benefit.
         */
        const {utcDateCreated} = candidateNote;

        if (utcDateCreated >= dateLimits.minDate && utcDateCreated <= dateLimits.maxDate
            && utcDateCreated < dateLimits.minExcludedDate && utcDateCreated > dateLimits.maxExcludedDate) {

            score += 1;
        }

        return score;
    }

    for (const candidateNote of Object.values(noteCache.notes)) {
        if (candidateNote.noteId === baseNote.noteId) {
            continue;
        }

        let score = computeScore(candidateNote);

        if (score >= 1) {
            const notePath = noteCacheService.getSomePath(candidateNote);

            // this takes care of note hoisting
            if (!notePath) {
                return;
            }

            if (noteCacheService.isNotePathArchived(notePath)) {
                score -= 0.5; // archived penalization
            }

            results.push({score, notePath, noteId: candidateNote.noteId});
        }

        i++;

        if (i % 1000 === 0) {
            await setImmediatePromise();
        }
    }

    results.sort((a, b) => a.score > b.score ? -1 : 1);

    return results.length > 200 ? results.slice(0, 200) : results;
}

/**
 * Point of this is to break up long running sync process to avoid blocking
 * see https://snyk.io/blog/nodejs-how-even-quick-async-functions-can-block-the-event-loop-starve-io/
 */
function setImmediatePromise() {
    return new Promise((resolve) => {
        setTimeout(() => resolve(), 0);
    });
}

module.exports = {
    findSimilarNotes
};
