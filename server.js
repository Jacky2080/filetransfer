// import https from 'https';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import helmet from 'helmet';

// // Path to the SSL/TLS certificate and key
// const sslOptions = {
//   key: await fs.readFile(path.normalize('D:/code/filetransfer/key.pem')),
//   cert: await fs.readFile(path.normalize( 'D:/code/filetransfer/cert.pem')),
//   // Enable HTTP/2 if available
//   allowHTTP1: true,
//   // Recommended security options
//   minVersion: 'TLSv1.2',
//   ciphers: ['TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256', 'TLS_AES_128_GCM_SHA256', 'ECDHE-RSA-AES128-GCM-SHA256', '!DSS', '!aNULL', '!eNULL', '!EXPORT', '!DES', '!RC4', '!3DES', '!MD5', '!PSK'].join(':'),
//   honorCipherOrder: true
// };

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
app.use(express.raw({
  type: 'application/octet-stream',
  limit: '1gb'
}));

// Serve static files from 'filetransfer' directory
app.use(express.static(path.normalize('d:/code/filetransfer'), {
  dotfiles: 'ignore',
  etag: true,
  extensions: ['html', 'htm'],
  index: 'index.html',
  maxAge: '10m',
  redirect: true
}));

const htmlContent = await fs.readFile(path.normalize('d:/code/filetransfer/index.html'), 'utf8');

app.get('/filetransfer', (req, res) => {
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

app.post('/filetransfer/text', express.text(), (req, res) => {
  try {
    console.log(`text received: ${req.body}`);
    const now = new Date();
    fs.appendFile(path.normalize('d:/code/filetransfer/text.log'), `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}\n${req.body}\n\n`, 'utf8');
    res.end('text received');
  } catch (e) {
    console.log(e);
  }
});

app.post('/filetransfer/file', express.raw({type: 'application/octet-stream'}), async (req, res) => {
  try {
    console.log('receiving file');
    let fileName = decodeURIComponent(req.headers['x-filename']);
    const fileExt = path.extname(fileName);
    fileName = path.basename(fileName, fileExt);
    let i = 0;
    while (true) {
      try {
        await fs.access(path.join(path.normalize('d:/code/filetransfer/files'), fileName + `${i === 0 ? '' : `_${i}`}` + fileExt));
        i++;
      } catch {fileName = fileName + `${i === 0 ? '' : `_${i}`}` + fileExt; break;}
    }
    fs.writeFile(path.join(path.normalize('d:/code/filetransfer/files'), fileName), req.body);
    console.log(`file ${fileName} received`);
    res.end(`file ${fileName} received`);
  } catch (e) {
    console.log(e);
  }
});

const PORT = 3000;
// const server = https.createServer(sslOptions, app);
const server = http.createServer(app);

const HOST = '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Express server running at http://${HOST}:${PORT}`);
});
