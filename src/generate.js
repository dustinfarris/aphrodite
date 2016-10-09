import prefixAll from 'inline-style-prefixer/static';

import {
    objectToPairs, kebabifyStyleName, recursiveMerge, stringifyValue,
    flatten
} from './util';
import stringHandlers from './stringHandlers';

/**
 * Generate CSS for a selector and some styles.
 *
 * This function handles the media queries, pseudo selectors, and descendant
 * styles that can be used in aphrodite styles.
 *
 * @param {string} selector: A base CSS selector for the styles to be generated
 *     with.
 * @param {Object} styleTypes: A list of properties of the return type of
 *     StyleSheet.create, e.g. [styles.red, styles.blue].
 *
 * To actually generate the CSS special-construct-less styles are passed to
 * `generateCSSRuleset`.
 *
 * For instance, a call to
 *
 *     generateCSS(".foo", {
 *       color: "red",
 *       "@media screen": {
 *         height: 20,
 *         ":hover": {
 *           backgroundColor: "black"
 *         }
 *       },
 *       ":active": {
 *         fontWeight: "bold",
 *         ">>bar": {
 *           _names: { "foo_bar": true },
 *           height: 10,
 *         }
 *       }
 *     });
 *
 * will make 5 calls to `generateCSSRuleset`:
 *
 *     generateCSSRuleset(".foo", { color: "red" }, ...)
 *     generateCSSRuleset(".foo:active", { fontWeight: "bold" }, ...)
 *     generateCSSRuleset(".foo:active .foo_bar", { height: 10 }, ...)
 *     // These 2 will be wrapped in @media screen {}
 *     generateCSSRuleset(".foo", { height: 20 }, ...)
 *     generateCSSRuleset(".foo:hover", { backgroundColor: "black" }, ...)
 */
export const generateCSS = (selector, styleTypes) => {
    const merged = styleTypes.reduce(recursiveMerge);

    const declarations = {};
    const mediaQueries = {};
    const pseudoStyles = {};

    Object.keys(merged).forEach(key => {
        if (key[0] === ':') {
            pseudoStyles[key] = merged[key];
        } else if (key[0] === '@') {
            mediaQueries[key] = merged[key];
        } else {
            declarations[key] = merged[key];
        }
    });

    return (
        generateCSSRuleset(selector, declarations) +
        Object.keys(pseudoStyles).map(pseudoSelector => {
            return generateCSSRuleset(selector + pseudoSelector,
                                      pseudoStyles[pseudoSelector]);
        }).join("") +
        Object.keys(mediaQueries).map(mediaQuery => {
            const ruleset = generateCSS(selector, [mediaQueries[mediaQuery]]);
            return `${mediaQuery}{${ruleset}}`;
        }).join("")
    );
};

/**
 * Helper method of generateCSSRuleset to facilitate custom handling of certain
 * CSS properties. Used for e.g. font families.
 *
 * See generateCSSRuleset for usage and documentation of paramater types.
 */
const runStringHandlers = (declarations) => {
    const result = {};

    Object.keys(declarations).forEach(key => {
        // If a handler exists for this particular key, let it interpret
        // that value first before continuing
        if (stringHandlers[key]) {
            result[key] = stringHandlers[key](declarations[key]);
        } else {
            result[key] = declarations[key];
        }
    });

    return result;
};

/**
 * Generate a CSS ruleset with the selector and containing the declarations.
 *
 * This function assumes that the given declarations don't contain any special
 * children (such as media queries, pseudo-selectors, or descendant styles).
 *
 * Note that this method does not deal with nesting used for e.g.
 * psuedo-selectors or media queries. That responsibility is left to  the
 * `generateCSS` function.
 *
 * @param {string} selector: the selector associated with the ruleset
 * @param {Object} declarations: a map from camelCased CSS property name to CSS
 *     property value.
 * @returns {string} A string of raw CSS.
 *
 * Examples:
 *
 *    generateCSSRuleset(".blah", { color: "red !important" })
 *    -> ".blah{color: red !important;}"
 *    generateCSSRuleset(".blah", { color: "red" })
 *    -> ".blah{color: red}"
 *    generateCSSRuleset(".blah", { color: "red" }, {color: c => c.toUpperCase})
 *    -> ".blah{color: RED}"
 *    generateCSSRuleset(".blah:hover", { color: "red" })
 *    -> ".blah:hover{color: red}"
 */
export const generateCSSRuleset = (selector, declarations) => {
    const handledDeclarations = runStringHandlers(declarations);

    const prefixedDeclarations = prefixAll(handledDeclarations);

    const prefixedRules = flatten(
        objectToPairs(prefixedDeclarations).map(([key, value]) => {
            if (Array.isArray(value)) {
                // inline-style-prefix-all returns an array when there should be
                // multiple rules, we will flatten to single rules

                const prefixedValues = [];
                const unprefixedValues = [];

                value.forEach(v => {
                  if (v.indexOf('-') === 0) {
                    prefixedValues.push(v);
                  } else {
                    unprefixedValues.push(v);
                  }
                });

                prefixedValues.sort();
                unprefixedValues.sort();

                return prefixedValues
                  .concat(unprefixedValues)
                  .map(v => [key, v]);
            }
            return [[key, value]];
        })
    );

    const rules = prefixedRules.map(([key, value]) => {
        const stringValue = stringifyValue(key, value);
        return `${kebabifyStyleName(key)}:${stringValue};`;
    }).join("");

    if (rules) {
        return `${selector}{${rules}}`;
    } else {
        return "";
    }
};
