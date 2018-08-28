import {IMatcherFunction, IStyle, IStyleAPI, IStyleItem} from "import-sort-style";

type Operator = IStyleAPI["and"] | IStyleAPI["or"];

const generateItems: IStyle = (styleApi, baseFile) => {
    if (typeof baseFile === "undefined") {
        throw new Error(`"isInstalledModule" matcher function requires "baseFile" argument to be defined`);
    }

    const {
        and,
        hasDefaultMember,
        hasNamedMembers,
        hasNamespaceMember,
        hasNoMember,
        hasOnlyDefaultMember,
        hasOnlyNamedMembers,
        hasOnlyNamespaceMember,
        isInstalledModule,
        isNodeModule,
        member,
        name,
        not,
        or,
        startsWithAlphanumeric,
        startsWithLowerCase,
        startsWithUpperCase,
        unicode,
    } = styleApi;
    const attach = (
        items: IStyleItem[],
        matcher: IMatcherFunction,
        operator: Operator = and,
    ): IStyleItem[] => items.map((item) => typeof item.match !== "undefined" ? {...item, match: operator(item.match, matcher)} : item);
    const multiply = (
        item: IStyleItem,
        multipliers: IMatcherFunction[],
        operator: Operator = and,
    ): IStyleItem[] => multipliers.reduce(
        (accumulator, multiplier) => accumulator.concat(attach([item], multiplier, operator)),
        [] as ReturnType<typeof multiply>,
    );
    const multiplyByStartsWithMatchers = (item: IStyleItem) => multiply(item, [
        not(member(startsWithAlphanumeric)),
        member(startsWithUpperCase),
        member(startsWithLowerCase),
    ]);
    const thirdPartyModulesMatcher = or(isNodeModule, isInstalledModule(baseFile));
    const separationGroup = [
        // import "…"
        {
            match: and(hasNoMember),
        },
        // import * as _ from "…";
        // import * as Foo from "…";
        // import * as foo from "…";
        ...multiplyByStartsWithMatchers({
            match: and(
                hasOnlyNamespaceMember,
            ),
            sort: member(unicode),
        }),
        // import _, * as bar from "…";
        // import Foo, * as bar from "…";
        // import foo, * as bar from "…";
        ...multiplyByStartsWithMatchers({
            match: and(
                hasDefaultMember,
                hasNamespaceMember,
            ),
            sort: member(unicode),
        }),
        // import _ from "…";
        // import Foo from "…";
        // import foo from "…";
        ...multiplyByStartsWithMatchers({
            match: and(
                hasOnlyDefaultMember,
            ),
            sort: member(unicode),
        }),
        // import _, {bar, …} from "…";
        // import Foo, {bar, …} from "…";
        // import foo, {bar, …} from "…";
        ...multiplyByStartsWithMatchers({
            match: and(
                hasDefaultMember,
                hasNamedMembers,
            ),
            sort: member(unicode),
            sortNamedMembers: name(unicode),
        }),
        // import {_, bar, …} from "…";
        // import {Foo, bar, …} from "…";
        // import {foo, bar, …} from "…";
        ...multiplyByStartsWithMatchers({
            match: and(
                hasOnlyNamedMembers,
            ),
            sort: member(unicode),
            sortNamedMembers: name(unicode),
        }),
    ];

    return [
        ...attach(separationGroup, thirdPartyModulesMatcher),
        {
            separator: true,
        },
        ...attach(separationGroup, not(thirdPartyModulesMatcher)),
        {
            separator: true,
        },
    ];
};

export default generateItems;
