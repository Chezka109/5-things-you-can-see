const http = require("http");
const fs = require("fs");
const path = require("path");

const requestedPort = Number(process.env.PORT) || 8000;
const root = __dirname;

const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
};

function requestHandler(req, res) {
    const safePath = req.url === "/" ? "/index.html" : req.url;
    const filePath = path.normalize(path.join(root, safePath));

    if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === "ENOENT") {
                res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
                res.end("Not found");
                return;
            }
            res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Server error");
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
    });
}

function startServer(initialPort) {
    const maxRetries = 20;

    const tryListen = (port, attempts) => {
        const server = http.createServer(requestHandler);

        server.once("error", (error) => {
            if (error.code === "EADDRINUSE" && attempts < maxRetries) {
                const nextPort = port + 1;
                console.warn(`Port ${port} is in use, trying ${nextPort}...`);
                tryListen(nextPort, attempts + 1);
                return;
            }

            console.error("Failed to start server:", error.message);
            process.exit(1);
        });

        server.listen(port, () => {
            console.log(`Grounding app running at http://localhost:${port}`);
        });
    };

    tryListen(initialPort, 0);
}

startServer(requestedPort);
