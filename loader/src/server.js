const http = require("http");

const hostname = "0.0.0.0";
let port = process.env.PORT || 3000;

function runServer(runFunc, options) {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "text/plain");
    runFunc(options).then((success) => {
      res.statusCode = success ? 200 : 500;
      res.end("Success: " + success);
    });
  });

  server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
  });
}

module.exports = { runServer };
