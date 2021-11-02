const nockBackPlugin = require("./nock-back-plugin");
const customMatchers = require("./matchers");

nockBackPlugin.setupJestNockBack();
expect.extend(customMatchers);
