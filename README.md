# File Transfer Webpage

A simple webpage for transferring text and files over a local network. Built with Node.js, Express, and vanilla JavaScript.

## Features

- Send plain text messages to the server (logged to `text.log`)
- Upload single or multiple files (saved to `files/` directory with automatic naming conflicts resolution)
- HTTPS/HTTP support (HTTPS is currently commented out in favor of HTTP)
- Desktop notifications for received files (Windows)
- Cross-origin resource sharing (CORS) enabled
- Security headers implemented with Helmet.js

## Setup

1. Clone the repository
2. Install dependencies: `npm install express helmet node-notifier`
3. Configure your preferred protocol:

### Option A: Run with HTTP (Current Default)
The server is currently configured to use HTTP by default. Simply run:
```bash
node server.js
```

### Option B: Run with HTTPS
1. Generate SSL certificates or place your own in the project directory (key.pem and cert.pem)
2. Uncomment the HTTPS line and comment the HTTP line in `server.js`:
```javascript
const server = https.createServer(sslOptions, app);
// const server = http.createServer(app);
```
3. Update the file paths in `server.js` to match your certificate locations
4. Run the server: `node server.js`

4. Access the application:
   - HTTP: `http://your-server-ip:3000/filetransfer`
   - HTTPS: `https://your-server-ip:3000/filetransfer`

## Important Security Note

- When using HTTP (current default), all data is transmitted in plain text
- For secure transmission over networks, please use HTTPS option and provide your own SSL certificates
- The HTTPS configuration includes secure TLS 1.2+ settings with strong cipher suites

## File Structure

```
/filetransfer
  ├── index.html      # Main webpage
  ├── styles.css      # Styling
  ├── scripts.js      # Client-side functionality
  ├── server.js       # Express server
  ├── text.log        # Created automatically for text messages
  └── files/          # Created automatically for uploaded files
```

## Usage

- Enter text in the textarea and click "Send" to submit text messages
- Select one or multiple files using the file input and click "Send" to upload
- Received files are automatically saved with unique names to prevent overwriting
- Text messages are appended to text.log with timestamps

## Browser Support

Works in modern browsers that support:
- Fetch API
- FileReader API
- ES6+ JavaScript features

## License

MIT License
