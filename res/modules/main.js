import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getDatabase, ref, set, get, child, remove } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, updateMetadata, deleteObject } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";
import fetcher from "./fetcher.js";

const firebaseConfig = await fetcher.load('../res/config/firebaseConfig.json');
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);

const saveHead = "usb/";
const uploadFile = document.querySelector('.upload-file');
const deleteAll = document.getElementById("deleteAll");
const params = new URLSearchParams(window.location.search);
const f = params.get("f");
if (f) {
    loadFiles(f);
}
uploadFile.addEventListener('click', uploadFiles);

async function uploadFiles() {
    const files = document.getElementById('fileInput').files;
    if (!files || files.length === 0) {
        alert('No file selected.');
        return;
    }
    uploadFile.style.display = "none";
    const expiryMinutes = parseInt(document.getElementById('expiry').value);
    const expiryTime = Date.now() + expiryMinutes * 60 * 1000;

    // 如果網址有 f，就用它；否則產生新的短碼
    const shortCode = f || Math.random().toString(36).substring(2, 8);
    const fileData = [];

    for (let file of files) {
        const fileRef = storageRef(storage, saveHead + shortCode + "/" + file.name);

        await uploadBytes(fileRef, file, { contentType: file.type });

        await updateMetadata(fileRef, {
            contentDisposition: `attachment; filename="${file.name}"`
        });

        const url = await getDownloadURL(fileRef);
        fileData.push({ name: file.name, url });
    }

    let existing = {};
    const snapshot = await get(child(ref(db), saveHead + shortCode));
    if (snapshot.exists()) {
        existing = snapshot.val();
    }

    const mergedFiles = (existing.files || []).concat(fileData);

    await set(ref(db, saveHead + shortCode), {
        files: mergedFiles,
        expiry: expiryTime
    });
    let delaySeconds = expiryMinutes * 60;
    await scheduleClean(delaySeconds);

    uploadFile.style.display = "";

    loadFiles(shortCode);
    const params = new URLSearchParams(window.location.search);
    params.set("f", shortCode);
    window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`);
    document.getElementById('fileInput').value = "";
    document
        .getElementById('fileInput')
        .dispatchEvent(new Event('change', { bubbles: true }));
}


async function loadFiles(f) {
    document.getElementById("time-left").innerText = "";
    document.getElementById('qrcode').innerHTML = "";
    const snapshot = await get(child(ref(db), saveHead + f));
    if (!snapshot.exists()) {
        document.getElementById('fileList').innerHTML = "This folder is empty.";
        return;
    }
    const data = snapshot.val();

    if (Date.now() > data.expiry) {
        const folderRef = storageRef(storage, saveHead + f);
        const files = data.files || [];
        for (let file of files) {
            const filePath = `${saveHead}${f}/${file.name}`;
            const fileRef = storageRef(storage, filePath);
            await deleteObject(fileRef);
        }
        await remove(ref(db, saveHead + f));
        document.getElementById('fileList').innerHTML = "This folder is empty.";
        return;
    }

    deleteAll.style.display = "block";
    deleteAll.addEventListener("click", async () => {
        if (!f) {
            return;
        }

        if (!confirm("Are you sure you want to delete all files?")) return;

        deleteAll.style.display = "";
        uploadFile.style.display = "none";
        const downloadAll = document.getElementById('downloadAll');
        downloadAll.style.display = "none";
        try {
            const folderRef = storageRef(storage, saveHead + f);

            const snapshot = await get(child(ref(db), saveHead + f));
            const data = snapshot.val();
            const files = data.files || [];
            for (let file of files) {
                const filePath = `${saveHead}${f}/${file.name}`;
                const fileRef = storageRef(storage, filePath);
                await deleteObject(fileRef);
            }
            await remove(ref(db, saveHead + f));

            document.getElementById("fileList").innerHTML = "This folder is empty.";
            downloadAll.remove();
            uploadFile.style.display = "";
            deleteAll.style.display = "";
            if (timer) {
                clearInterval(timer);
            }
            loadFiles(f);
        } catch (err) {
            console.error("failed:", err);
            alert("Deletion failed, please try again later.");
            deleteAll.style.display = "block";
            uploadFile.style.display = "";
            downloadAll.style.display = "";
        }
    });

    new QRCode(document.getElementById('qrcode'), {
        text: `${location.origin}?f=${f}`,
        width: 128,
        height: 128,
        colorDark: '#66666699',
        colorLight: 'transparent',
    });
    const now = Date.now();
    const remaining = data.expiry - now;
    const minutes = Math.floor(remaining / 1000 / 60);
    const timeLeft = document.getElementById("time-left");
    const timer = setInterval(() => {
        const now = Date.now();
        const remaining = data.expiry - now;

        if (remaining <= 0) {
            clearInterval(timer);
            loadFiles(f);
            return;
        }

        const hours = Math.floor(remaining / 1000 / 60 / 60);
        const minutes = Math.floor((remaining / 1000 / 60) % 60);
        const seconds = Math.floor((remaining / 1000) % 60);

        timeLeft.innerText = `${hours.toString().padStart(2, "0")} : ${minutes.toString().padStart(2, "0")} : ${seconds.toString().padStart(2, "0")}`;
    }, 1000);

    let html = "<h3>📁 Files</h3>";
    data.files.forEach(f => {
        html += `
          <div class="file-item">
            <a href="${f.url}" target="_blank">${f.name}</a>
          </div>`;
    });

    html += `<button id="downloadAll">Download All</button>`;
    document.getElementById('fileList').innerHTML = html;
    document.getElementById('fileList').appendChild(deleteAll);

    document.querySelectorAll('.download-single').forEach(btn => {
        btn.addEventListener('click', () => {
            const a = document.createElement("a");
            a.href = btn.dataset.url;
            a.download = btn.dataset.name;
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    });

    document.getElementById('downloadAll').addEventListener('click', async () => {
        const zip = new JSZip();

        for (let f of data.files) {
            const response = await fetch(f.url);
            const blob = await response.blob();
            zip.file(f.name, blob);
        }

        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "files.zip");
    });

}

async function scheduleClean(sec) {
    const response = await fetch("https://schedulecleanexpiredfastfiles-uqj7m73rbq-uc.a.run.app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delaySeconds: sec })
    });
    const result = await response.json();
    console.log(result);
}

const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("fileInput");
const uploadText = document.getElementById("uploadText");

function updateUploadText() {
    if (fileInput.files.length > 0) {
        const names = Array.from(fileInput.files).map(f => f.name).join(", ");
        uploadText.textContent = "Selected files: " + names;
    } else {
        uploadText.textContent = "Drag and drop files here, or click to select.";
    }
}

uploadArea.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", updateUploadText);

uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.classList.add("dragover");
});

uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("dragover");
});

uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.classList.remove("dragover");

    fileInput.files = e.dataTransfer.files;
    updateUploadText();
});