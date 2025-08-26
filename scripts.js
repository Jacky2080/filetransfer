const file = document.getElementById('file');
const text = document.getElementById('text');
const textBtn = document.getElementById('textBtn');
const fileBtn = document.getElementById('fileBtn');
const fetchBtn = document.getElementById('fetchBtn');

// post text to the back-end
async function postText(t) {
  if (t === '') {text.value = ''; return;}
  try {
    const res = await fetch('/filetransfer/text', {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: t
    });
    console.log(await res.text());
    text.value = '';
    textBtn.innerHTML = 'Text Sent!';
    setTimeout(() => {textBtn.innerHTML = 'Send'}, 1500);
  } catch (e) {
    alert(e);
  }
}

// post one file at a time
async function postFile(f, i) {
  console.log(`start sending file ${f.name}`);
    try {
      const res = await fetch('/filetransfer/file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Filename': encodeURIComponent(f.name)
        },
        body: f
      });
      console.log(await res.text());
      fileBtn.innerHTML = `File ${i + 1} Sent!`;
      setTimeout(() => {fileBtn.innerHTML = 'Send'}, 1500);
    } catch (error) {
      console.log(error);
    }
}

textBtn.addEventListener('click', () => {
  postText(text.value.trim());
});

fileBtn.addEventListener('click', async () => {
  if (file.files.length === 0) return;
  const tasks = Array.from(file.files).map((f, i) => postFile(f, i));
  await Promise.all(tasks);
  await fetchFiles();
});

// get the file list
async function fetchFiles() {
  console.log('start fetching file list');
  let files = await fetch('/files', {method: 'GET'});
  files = JSON.parse(await files.text());
  const filesDiv = document.getElementById('files');
  filesDiv.innerHTML = '';

  // add html elements
  for (f of files) {
    filesDiv.innerHTML += `<div class="options"><input type="checkbox" id="${f.index}" class="checkbox-input">
    <label for="${f.index}" class="checkbox-label">${f.name}</label></div>`
  }
  console.log(`file list fetched, ${files.length} file(s) fetched`);
}

// run when first loaded
fetchFiles();


// download file request
async function downloadFiles(id) {
  console.log('get file id: ', id)
  const params = new URLSearchParams();
  params.append('id', id);
  const res = await fetch(`/filetransfer/download?${params.toString()}`);
  const blob = await res.blob();
  const contentDisposition = res.headers.get('Content-Disposition');
  const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
  const fileName = decodeURIComponent(matches[1].replace(/['"]/g, ''));

  // create download link
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  window.URL.revokeObjectURL(url);
  console.log(`file "${fileName}" downloaded`);
}

fetchBtn.addEventListener('click', () => {
  const options = document.querySelectorAll('.checkbox-input');
  const download = Array.from(options).filter((o) => o.checked).map((o) => o.id);
  for (id of download) downloadFiles(id);
});
