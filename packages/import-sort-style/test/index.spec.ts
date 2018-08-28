import test from "ava";

import _ from "./../dist";

// TODO implement proper tests

test(`"default" import should be a function`, (t) => {
    t.is("function", typeof _);
});
