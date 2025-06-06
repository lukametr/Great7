import fs from 'node:fs';
import http from 'node:http';
import ws from 'ws';
import serveStatic from 'serve-static';
import finalhandler from 'finalhandler';
import formidable from 'formidable';

// Common interface between official pg PoolClient and PGLite interface used for testing.
// PGInterface, MailOptions, SentMessageInfo, TransportInterface, ServerInterface, ServerIncomingMessage, ServerResponseInterface, ServerCallback, createServerInterface, ServerConfig, ServerAddress წაშლილია

const DEFAULT_PORT = 8000;
export class Server {
  #config;
  #server;
  #serve;

  constructor(config) {
    this.#config = config;
    this.#server = (this.#config.createServer || http.createServer)(
      this.#onRequest
    );
    this.#serve = serveStatic('./public');
  }

  listen() {
    return new Promise((resolve) => {
      const port = this.#config.port || DEFAULT_PORT;
      const host = this.#config.hostname || '127.0.0.1';
      this.#server.listen(port, host, () => {
        const address = `http://${host}:${port}`;
        resolve(address);
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      this.#server.close(resolve);
    });
  }

  #onRequest = async (req, res) => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
      'Access-Control-Max-Age': 2592000, // 30 days
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers);
      res.end();
      return;
    }
    if (!['POST', 'GET'].includes(req.method)) {
      res.writeHead(405, headers);
      res.end(`${req.method} is not allowed for the request.`);
      return;
    }
    console.log(`Request for ${req.url}`);
    if (req.url == '/register') {
      const form = formidable({});
      let fields;
      try {
        fields = (await form.parse(req))[0];
      } catch (err) {
        console.error(err);
        res.writeHead(err.httpCode || 400, { 'Content-Type': 'text/plain' });
        res.end(String(err));
        return;
      }
      console.log(fields.email, fields.password);
      res.writeHead(200, headers);
      res.end();
    } else if (['/lobby.min.js', '/lobby.min.js.map'].includes(req.url)) {
      const filePath = `dist${req.url}`;
      fs.readFile(
        filePath,
        { encoding: 'utf8' },
        (err, data) => {
          if (err != null) {
            res.writeHead(404, headers);
            res.end();
            return;
          }
          const contentType = filePath.endsWith('.js')
            ? 'text/javascript'
            : 'application/json';
          res.writeHead(200, headers);
          res.end(data || '', 'utf8');
        }
      );
    } else if (res instanceof http.ServerResponse) {
      this.#serve(req, res, finalhandler(req, res));
    } else {
      res.writeHead(404, headers);
      res.end();
    }
  };
}
