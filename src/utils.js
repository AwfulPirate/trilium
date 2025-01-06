import { Element, Text, TextProxy, ViewElement } from 'ckeditor5/src/engine.js';
// There's ample DRY violation in this file; type checking
// polymorphism without full typescript is just incredibly finicky.
// I (Jonathan) suspect there's a more elegant solution for this,
// but I tried a lot of things and none of them worked.
/**
 * Returns an array of all descendant elements of
 * the root for which the provided predicate returns true.
 */
export const modelQueryElementsAll = (editor, rootElement, predicate = _ => true) => {
    const range = editor.model.createRangeIn(rootElement);
    const output = [];
    for (const item of range.getItems()) {
        if (!(item instanceof Element)) {
            continue;
        }
        if (predicate(item)) {
            output.push(item);
        }
    }
    return output;
};
/**
 * Returns an array of all descendant text nodes and text proxies of
 * the root for which the provided predicate returns true.
 */
export const modelQueryTextAll = (editor, rootElement, predicate = _ => true) => {
    const range = editor.model.createRangeIn(rootElement);
    const output = [];
    for (const item of range.getItems()) {
        if (!(item instanceof Text || item instanceof TextProxy)) {
            continue;
        }
        if (predicate(item)) {
            output.push(item);
        }
    }
    return output;
};
/**
 * Returns the first descendant element of the root for which the provided
 * predicate returns true, or null if no such element is found.
 */
export const modelQueryElement = (editor, rootElement, predicate = _ => true) => {
    const range = editor.model.createRangeIn(rootElement);
    for (const item of range.getItems()) {
        if (!(item instanceof Element)) {
            continue;
        }
        if (predicate(item)) {
            return item;
        }
    }
    return null;
};
/**
 * Returns the first descendant text node or text proxy of the root for which the provided
 * predicate returns true, or null if no such element is found.
 */
export const modelQueryText = (editor, rootElement, predicate = _ => true) => {
    const range = editor.model.createRangeIn(rootElement);
    for (const item of range.getItems()) {
        if (!(item instanceof Text || item instanceof TextProxy)) {
            continue;
        }
        if (predicate(item)) {
            return item;
        }
    }
    return null;
};
/**
 * Returns the first descendant element of the root for which the provided
 * predicate returns true, or null if no such element is found.
 */
export const viewQueryElement = (editor, rootElement, predicate = _ => true) => {
    const range = editor.editing.view.createRangeIn(rootElement);
    for (const item of range.getItems()) {
        if (!(item instanceof ViewElement)) {
            continue;
        }
        if (predicate(item)) {
            return item;
        }
    }
    return null;
};
//# sourceMappingURL=utils.js.map