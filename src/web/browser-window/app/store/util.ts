import outdent from "outdent"; // eslint-disable-line import/no-named-as-default

export const formatCodeLines = (input: { title?: string, value: string, disabled?: boolean }): typeof input => {
    const {title, value} = input;
    return {title, value: outdent.string(value), disabled: true};
};
