const assert = require("assert/strict");
const { HttpApiError } = require("../../exceptions");

class RiteAidApiError extends HttpApiError {
  parse(response) {
    assert.equal(typeof response.body, "object");
    this.details = response.body;
    this.message = `${this.details.Status} ${this.details.ErrCde}: ${this.details.ErrMsg}`;
  }
}

module.exports = { RiteAidApiError };
