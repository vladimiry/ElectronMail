import angular from "angular-eslint";
import importX from "eslint-plugin-import-x";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [
            "**/node_modules/**",
            "**/app/**",
            "**/app-dev/**",
            "**/dist/**",
            "**/output/**",
        ],
    },
    {
        files: ["**/*.ts"],
        extends: [
            tseslint.configs.recommendedTypeChecked,
            importX.flatConfigs.recommended,
            sonarjs.configs.recommended,
        ],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: "./tsconfig.json",
                sourceType: "module",
                ecmaVersion: 2020,
            },
        },
        rules: {
            "max-len": ["error", {code: 140}],
            "no-console": "error",
            "no-else-return": "error",
            "no-lonely-if": "error",
            "no-return-await": "error",
            "no-unused-expressions": "error",
            "no-useless-return": "error",
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        "rxjs/*",
                        "!rxjs/operators",
                    ],
                    paths: [
                        {
                            name: "@ngrx/store",
                            importNames: ["props"],
                            message: "Import \"props\" from \"src/shared/ngrx-util\" instead.",
                        },
                        {
                            name: "@ngrx/effects",
                            importNames: ["ofType"],
                            message: "Import \"ofType\" from \"src/shared/ngrx-util-of-type\" instead.",
                        },
                    ],
                },
            ],
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-unsafe-return": "error",
            "@typescript-eslint/promise-function-async": "error",
            "@typescript-eslint/require-await": "off",
            "@typescript-eslint/no-misused-promises": [
                "error",
                {checksVoidReturn: false},
            ],
            "@typescript-eslint/explicit-function-return-type": [
                "warn",
                {allowExpressions: true},
            ],
            "import-x/no-relative-parent-imports": "error",
            "import-x/no-unresolved": "off",
            "prefer-destructuring": "error",
            "semi": "warn",
            "sonarjs/cognitive-complexity": "off",
            "sonarjs/deprecation": "off",
            "sonarjs/no-nested-conditional": "off",
            "sonarjs/no-nested-functions": "off",
            "sonarjs/todo-tag": "off",
        },
    },
    // TODO make sure angular-specific TS code linting works after eslint v8=>v10 upgrade
    {
        files: ["./src/web/browser-window/**/*.ts"],
        extends: [
            ...angular.configs.tsRecommended,
        ],
        rules: {
            "quotes": ["error", "double", {allowTemplateLiterals: true}],
            "@typescript-eslint/member-ordering": "off",
            "@angular-eslint/prefer-standalone": "off",
            "@angular-eslint/directive-selector": [
                "error",
                {type: "attribute", prefix: "electron-mail", style: "camelCase"},
            ],
            "@angular-eslint/component-selector": [
                "error",
                {type: "element", prefix: "electron-mail", style: "kebab-case"},
            ],
        },
    },
    // TODO make sure angular template linting works after eslint v8=>v10 upgrade
    {
        files: ["./src/web/browser-window/**/*.component.html"],
        extends: [
            ...angular.configs.templateRecommended,
        ],
        rules: {
            "@angular-eslint/template/banana-in-a-box": "error",
            "@angular-eslint/template/cyclomatic-complexity": "error",
            "@angular-eslint/template/no-call-expression": "error",
            "@angular-eslint/template/no-negated-async": "error",
            "@angular-eslint/template/i18n": [
                "error",
                {
                    checkId: false,
                    checkText: true,
                    checkAttributes: true,
                    ignoreAttributes: ["field", "identifier"],
                },
            ],
        },
    },
);
