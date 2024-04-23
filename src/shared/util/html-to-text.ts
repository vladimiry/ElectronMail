import TurndownService from "turndown";

export const htmlToText: (html: string) => string = (() => {
    const emptyLineRegex = new RegExp("%%%__EMPTY__LINE__%%%", "gi");
    const turndownService = new TurndownService({
        bulletListMarker: "-",
        strongDelimiter: "" as typeof TurndownService.prototype.options.strongDelimiter,
        emDelimiter: "" as typeof TurndownService.prototype.options.emDelimiter,
        hr: "",
    });

    turndownService.use([() =>
        turndownService.addRule("replaceAnchor", {
            filter: "a",
            replacement(...[/* content */, node /* options */]) {
                return node.textContent ?? "";
            },
        }), () =>
        turndownService.addRule("replaceDiv", {
            filter: "div",
            replacement(...[content /* options */]) {
                return content;
            },
        }), () =>
        turndownService.addRule("replaceBreakLine", {
            filter: "br",
            replacement(...[/* content */, node /* options */]) {
                if (node.parentElement?.lastChild === node && node.parentElement.textContent) {
                    return node.parentElement.nodeName !== "LI" ? "\n" : "";
                }
                return `${emptyLineRegex.source}\n`;
            },
        })]);

    // https://github.com/mixmark-io/turndown#escaping-markdown-characters
    turndownService.escape = (value: string) => value;

    return (html: string): string => {
        return turndownService.turndown(html).replace(emptyLineRegex, "");
    };
})();
