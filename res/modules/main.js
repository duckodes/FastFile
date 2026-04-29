import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";
import fetcher from "./fetcher.js";

const firebaseConfig = await fetcher.load('../res/config/firebaseConfig.json');

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);

document
    .querySelector('.upload-file')
    .addEventListener('click', uploadFiles);

async function uploadFiles() {
    const files = document.getElementById('fileInput').files;
    const expiryMinutes = parseInt(document.getElementById('expiry').value);
    const expiryTime = Date.now() + expiryMinutes * 60 * 1000;

    const shortCode = Math.random().toString(36).substring(2, 8);
    const fileData = [];

    for (let file of files) {
        const fileRef = storageRef(storage, "fastfile/" + shortCode + "/" + file.name);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);

        fileData.push({ name: file.name, url });
    }

    await set(ref(db, "fastfile/" + shortCode), {
        files: fileData,
        expiry: expiryTime
    });

    const shortUrlContainer = document.getElementById("shortUrl");
    shortUrlContainer.innerHTML = "短網址: ";

    const shortUrlEl = document.createElement("span");
    shortUrlEl.className = "short-url";
    shortUrlEl.textContent = "/" + shortCode;

    shortUrlEl.addEventListener("click", () => {
        loadFiles(shortCode);
    });

    shortUrlContainer.appendChild(shortUrlEl);
}

async function loadFiles(code) {
    const snapshot = await get(child(ref(db), "fastfile/" + code));
    if (!snapshot.exists()) {
        document.getElementById('fileList').innerHTML = "此連結已過期或不存在";
        return;
    }
    const data = snapshot.val();

    if (Date.now() > data.expiry) {
        await remove(ref(db, "fastfile/" + code));
        document.getElementById('fileList').innerHTML = "檔案已過期";
        return;
    }

    let html = "<h3>檔案清單</h3>";
    data.files.forEach(f => {
        html += `<div class="file-item"><a href="${f.url}" target="_blank">${f.name}</a></div>`;
    });
    document.getElementById('fileList').innerHTML = html;
}