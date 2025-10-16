const file = document.getElementById("file");
const dropArea = document.getElementById("drop-area");
const fileBtn = document.getElementById("fileBtn");
const fetchBtn = document.getElementById("fetchBtn");
const date = document.getElementById("date");

const today = new Date().toLocaleDateString("zh-CN").replaceAll("/", "-");
date.value = today;

// prevent default for drag
["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  dropArea.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

// hightlight and unhighlight when dragging
["dragenter", "dragover"].forEach((eventName) => {
  dropArea.addEventListener(eventName, () => dropArea.classList.add("highlight"));
});
["dragleave", "drop"].forEach((eventName) => {
  dropArea.addEventListener(eventName, () => dropArea.classList.remove("highlight"), false);
});

// handle drop
dropArea.addEventListener("drop", (e) => {
  const dt = e.dataTransfer;
  let files = dt.files;
  files = Array.from(files).filter((file) => {
    if (file.name.toLowerCase().endsWith(".url")) return false;
    return true;
  });

  if (files.length === 0) {
    dropArea.innerHTML = "No files detected";
    setTimeout(() => {
      dropArea.innerHTML = "Drag & Drop files here";
    }, 1500);
    return;
  }
  files.map((f, i) => postFile(f, i));
});

// post one file at a time
async function postFile(f, i) {
  console.log(`start sending file ${f.name}`);
  try {
    const res = await fetch("/file", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Filename": encodeURIComponent(f.name),
        "X-Filetype": f.type || "application/octet-stream",
      },
      body: f,
    });
    console.log(await res.text());
    fileBtn.innerHTML = `File ${i + 1} Sent!`;
    setTimeout(() => {
      fileBtn.innerHTML = "Send";
    }, 1500);
  } catch (error) {
    console.log(error);
    alert(error.message);
  }
}

// post file on click
fileBtn.addEventListener("click", async () => {
  if (file.files.length === 0) return;
  Array.from(file.files).map((f, i) => postFile(f, i));
  if (date.value === today)
    fetchFiles(
      today,
      true,
      Array.from(file.files).map((f) => f.name)
    );
});

// get the file list
async function fetchFiles(date, afterPost = false, fileNames = []) {
  console.log("start fetching file list");
  let files = await fetch(`/files?date=${date}`, { method: "GET" });
  files = await files.json();
  const filesDiv = document.getElementById("files");
  filesDiv.innerHTML = "";

  if (afterPost) {
    const fileSet = new Set(files);
    for (const f of fileNames) fileSet.add({ name: f, index: fileSet.size });
    files = Array.from(fileSet);
  }

  // add html elements
  for (const f of files) {
    const optionDiv = document.createElement("div");
    optionDiv.className = "options";
    const checkboxInput = document.createElement("input");
    checkboxInput.type = "checkbox";
    checkboxInput.id = f.index;
    checkboxInput.className = "checkbox-input";
    const label = document.createElement("label");
    label.htmlFor = f.index;
    label.className = "checkbox-label";
    label.textContent = f.name;
    optionDiv.appendChild(checkboxInput);
    optionDiv.appendChild(label);
    filesDiv.appendChild(optionDiv);
  }
  console.log(`file list fetched, ${files.length} file(s) fetched`);
}

// run when first loaded
fetchFiles(today);
// fetch files when selected date
date.addEventListener("change", (e) => {
  const d = e.target.value;
  console.log(`new date: ${d}`);
  fetchFiles(d);
});

// download file request
async function downloadFiles(date, names) {
  console.log("get zip file for: ", names);
  const params = new URLSearchParams();
  params.append("date", date);
  params.append("names", names.join(","));
  const a = document.createElement("a");
  a.href = `/download?${params.toString()}`;
  a.download = names.length === 1 ? names[0] : `files_${date}.zip`;
  a.click();
  console.log(`zip file requested for ${names.length} files`);
}

// click to fetch files
fetchBtn.addEventListener("click", () => {
  const options = document.querySelectorAll(".checkbox-input");
  const dateNow = date.value;
  const download = Array.from(options)
    .filter((o) => o.checked)
    .map((o) => o.labels[0].innerHTML);
  if (download.length === 0) return;
  downloadFiles(dateNow, download);
  Array.from(options).forEach((o) => {
    o.checked = false;
  });
});
