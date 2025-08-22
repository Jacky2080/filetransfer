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

textBtn.addEventListener('click', () => {
  postText(text.value.trim());
});

fileBtn.addEventListener('click', () => {
  if (file.files.length === 0) return;
  for (let i = 0; i < file.files.length; i++) {postFile(file.files[i], i);}
});
