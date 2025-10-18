const file = document.getElementById("file");
const dropArea = document.getElementById("drop-area");
const fileBtn = document.getElementById("fileBtn");
const fetchBtn = document.getElementById("fetchBtn");
const date = document.getElementById("date");

const now = new Date();
const pad = (n) => n.toString().padStart(2, "0");
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
dropArea.addEventListener("drop", async (e) => {
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

  dropArea.innerHTML = "Uploading...";
  const results = await Promise.all(
    files.map((f, i) =>
      postFile(f, i)
        .then(() => ({ ok: true, name: f.name }))
        .catch((err) => ({ ok: false, name: f.name, error: err.message }))
    )
  );
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    dropArea.innerHTML =
      `${failed.length} file(s) failed:<br>` +
      failed.map((r) => `<div>${r.name}: ${r.error}</div>`).join("");
  } else {
    dropArea.innerHTML = `${files.length} file${files.length > 1 ? "s" : ""} sent`;
  }
  if (date.value === today) fetchFiles(today);

  setTimeout(() => {
    dropArea.innerHTML = "Drag & Drop files here";
  }, 1500);
  console.log("All files uploaded", results);
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
  try {
    await Promise.all(Array.from(file.files).map((f, i) => postFile(f, i)));
    if (date.value === today) fetchFiles(today);
  } catch (e) {
    console.error(`error when uploading file: ${e}`);
  }
});

// get the file list
async function fetchFiles(date) {
  console.log("start fetching file list");
  let files = await fetch(`/files?date=${date}`, { method: "GET" });
  files = await files.json();
  const filesDiv = document.getElementById("files");
  filesDiv.innerHTML = "";

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
