const file = document.getElementById('file');
const text = document.getElementById('text');
const textBtn = document.getElementById('textBtn');
const fileBtn = document.getElementById('fileBtn');


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

async function postFile(f, i) {
  console.log('start');
  const reader = new FileReader();
  reader.onload = async (e) => {
    const res = await fetch('/filetransfer/file', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Filename': encodeURIComponent(f.name)
      },
      body: e.target.result
    });
    console.log(await res.text());
    fileBtn.innerHTML = `File ${i + 1} Sent!`;
    setTimeout(() => {fileBtn.innerHTML = 'Send'}, 1500);  
  };
  reader.readAsArrayBuffer(f);
}

// async function postFile(files) {
//   const reader = new FileReader();
//   const req = [];
//   reader.onload = e => e.target.result;
 
//   for (f of files) {
//     const content = reader.readAsArrayBuffer(f);
//     req.push({name: f.name, content: content});
//   }
  
//   const res = await fetch('/filetransfer/file', {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/octet-stream'
//     },
//     body: JSON.stringify(req)
//   });
//   console.log(await res.text());
//   fileBtn.innerHTML = `File ${i + 1} Sent!`;
//   setTimeout(() => {fileBtn.innerHTML = 'Send'}, 1500); 
// }

textBtn.addEventListener('click', () => {
  postText(text.value.trim());
});

fileBtn.addEventListener('click', () => {
  if (file.files.length === 0) return;
  const tasks = [];
  for (let i = 0; i < file.files.length; i++) {tasks.push(postFile(file.files[i], i));}
  Promise.all(tasks)
    .then(_ => fetchFiles())
    .catch(err => console.log(err));
  // postFile(file.files);
});

async function fetchFiles() {
  let files = await fetch('/files', {method: 'GET'});
  files = JSON.parse(await files.text());
  const filesDiv = document.getElementById('files');
  filesDiv.innerHTML = '';
  for (f of files) {
    filesDiv.innerHTML += `<div class="options"><input type="checkbox" id="${f.index}" class="checkbox-input">
    <label for="${f.index}" class="checkbox-label">${f.name}</label></div>`
  }
}

fetchFiles();
