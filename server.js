import https from 'https';
import http from 'http';
import fs from 'fs/promises';
import { createReadStream,createWriteStream } from 'fs';
import path from 'path';
import express from 'express';
import helmet from 'helmet';
import notifier from 'node-notifier';
import { pipeline } from 'stream/promises';

const logFile = 'd:/code/filetransfer/server.log';

function getDate() {
  const now = new Date();
  return `[${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
} 

// Path to the SSL/TLS certificate and key
const sslOptions = {
  key: await fs.readFile(path.normalize('D:/code/filetransfer/key.pem')),
  cert: await fs.readFile(path.normalize( 'D:/code/filetransfer/cert.pem')),
  // Enable HTTP/2 if available
  allowHTTP1: true,
  // Recommended security options
  minVersion: 'TLSv1.2',
  ciphers: ['TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256', 'TLS_AES_128_GCM_SHA256', 'ECDHE-RSA-AES128-GCM-SHA256', '!DSS', '!aNULL', '!eNULL', '!EXPORT', '!DES', '!RC4', '!3DES', '!MD5', '!PSK'].join(':'),
  honorCipherOrder: true
};

const app = express();

// Security middleware
app.use(helmet());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, POST');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Filename, X-Filesize, X-Filetype');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.text({ limit: '50mb' }));

// Serve static files from 'filetransfer' directory
app.use(express.static(path.normalize('d:/code/filetransfer'), {
  dotfiles: 'ignore',
  etag: true,
  extensions: ['html', 'htm'],
  index: 'index.html',
  maxAge: '10m',
  redirect: true
}));

app.get('/filetransfer', async (req, res) => {
  const htmlContent = await fs.readFile(path.normalize('d:/code/filetransfer/index.html'), 'utf8');
  res.type('html').send(htmlContent);
});

app.get('/filetransfer/styles.css', async (req, res) => {
  try {
    const cssContent = await fs.readFile(
      path.normalize('d:/code/filetransfer/styles.css'), 
      'utf8'
    );
    res.type('css').send(cssContent);
  } catch (error) {
    res.status(404).send('CSS file not found');
  }
});

app.get('/filetransfer/scripts.js', async (req, res) => {
  try {
    const jsContent = await fs.readFile(
      path.normalize('d:/code/filetransfer/scripts.js'), 
      'utf8'
    );
    res.type('js').send(jsContent);
  } catch (error) {
    res.status(404).send('JS file not found');
  }
});

// return file list
const filePromises = new Set();
let fileList;
app.get('/files', async (req, res) => {
  try {
    if (filePromises.size > 0) {
      await Promise.all(filePromises);
    }

    // create directory if doesn't exist
    try {
      await fs.access('d:/code/filetransfer/files');
      fileList = await fs.readdir('d:/code/filetransfer/files');
      fileList = fileList.map((val, idx) => {return {'index': idx, 'name': val}})
    } catch {
      fs.mkdir('d:/code/filetransfer/files');
      await fs.appendFile(logFile, `${getDate()} Directory /files doesn't exist, created one\n`);
      fileList = [];
    } finally {
      res.end(JSON.stringify(fileList));
      await fs.appendFile(logFile, `${getDate()} Sent file list, ${fileList.length} file(s) found\n`);
    }
  } catch (e) {
    console.log(e);
    await fs.appendFile(logFile, `${getDate()} [error] Error sending file list: ${e}\n`);
  }
})

// handle text posts
app.post('/filetransfer/text', express.text(), (req, res) => {
  try {
    console.log(`text received: ${req.body}`);
    fs.appendFile(path.normalize('d:/code/filetransfer/text.log'), `${getDate()}\n${req.body}\n\n`, 'utf8');
    res.end('text received');
    fs.appendFile(logFile, `${getDate()} Received text: ${JSON.stringify(req.body)}\n`);
  } catch (e) {
    console.log(e);
    fs.appendFile(logFile, `${getDate()} [error] Error receiving text: ${e}\n`);
  }
});

// handle file posts
app.post('/filetransfer/file', async (req, res) => {
  let fileName = '';
  try {
    console.log('receiving file');
    await fs.appendFile(logFile, `${getDate()} Start receiving file\n`);
    fileName = decodeURIComponent(req.headers['x-filename']);

    // handle repeated file names
    const fileExt = path.extname(fileName);
    fileName = path.basename(fileName, fileExt);
    try {
      await fs.access('d:/code/filetransfer/files');
      let i = 0;
      while (true) {
        try {
          await fs.access(path.join(path.normalize('d:/code/filetransfer/files'), fileName + `${i === 0 ? '' : `_${i}`}` + fileExt));
          i++;
        } catch {fileName = fileName + `${i === 0 ? '' : `_${i}`}` + fileExt; break;}
      }
    } catch {
      await fs.mkdir('d:/code/filetransfer/files');
      fileName = fileName + fileExt;
    }

    // write file with stream
    const writeStream = createWriteStream(path.join(path.normalize('d:/code/filetransfer/files'), fileName));
    const pipelineStream =  pipeline(req, writeStream);
    filePromises.add(pipelineStream);
    await pipelineStream;
    res.end(`file ${fileName} received`);
    console.log(`file ${fileName} received`);
    filePromises.delete(pipelineStream);

    // send system notification and write into log
    notifier.notify({
      title: 'File received',
      message: `File ${fileName} received`,
      appID: 'com.node.filetransfer',
      timeout: 1,
      icon: null,
      sound: false
    });
    await fs.appendFile(logFile, `${getDate()} Received file "${fileName}"\n`);
  } catch (e) {
    console.log(e);
    await fs.appendFile(logFile, `${getDate()} [error] Error receiving file "${fileName}": ${e}\n`);
  }
});

// handle download file request
app.get('/filetransfer/download', async (req, res) => {
  const id = req.query.id;
  fileList = await fs.readdir('d:/code/filetransfer/files');
  const fileName = fileList[id];
  await fs.appendFile(logFile, `${getDate()} Start sending file "${fileName}" to download\n`);
  const filePath = `d:/code/filetransfer/files/${fileName}`;
  const stats = await fs.stat(filePath);
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    'Content-Length': stats.size
  });
  const readStream = createReadStream(filePath);
  try {
    await pipeline(readStream, res);
    await fs.appendFile(logFile, `${getDate()} Sent file "${fileName}" to download\n`);
  } catch (e) {
    console.log(e);
    await fs.appendFile(logFile, `${getDate()} [error] ${e}\n`);
  }
});

const PORT = 3000;
const server = https.createServer(sslOptions, app);
// const server = http.createServer(app);

const HOST = '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Express server running at http://${HOST}:${PORT}`);
});
