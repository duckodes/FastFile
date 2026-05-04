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
const params = new URLSearchParams(window.location.search);
const f = params.get("f");
if (f) {
    loadFiles(f);

    const deleteAll = document.getElementById("deleteAll");
    deleteAll.style.display = "block";
    deleteAll.addEventListener("click", async () => {
        if (!f) {
            return;
        }

        if (!confirm("確定要刪除這個分享下的所有檔案嗎？")) return;

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

            document.getElementById("fileList").innerHTML = "所有檔案已刪除";
            downloadAll.remove();
            uploadFile.style.display = "";
            deleteAll.style.display = "";
        } catch (err) {
            console.error("刪除失敗:", err);
            alert("刪除失敗，請稍後再試");
            deleteAll.style.display = "block";
            uploadFile.style.display = "";
            downloadAll.style.display = "";
        }
    });

    new QRCode(document.getElementById('qrcode'), {
        text: location.href,
        width: 128,
        height: 128,
        colorDark: '#66666699',
        colorLight: 'transparent',
    });
}
uploadFile.addEventListener('click', uploadFiles);

async function uploadFiles() {
    const files = document.getElementById('fileInput').files;
    if (!files || files.length === 0) {
        alert('尚未選擇檔案');
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

    const shortUrlContainer = document.getElementById("shortUrl");
    shortUrlContainer.innerHTML = "短網址: ";

    const shortUrlEl = document.createElement("a");
    shortUrlEl.className = "short-url";
    shortUrlEl.href = `${location.origin}?f=${shortCode}`;
    shortUrlEl.textContent = shortUrlEl.href;

    shortUrlContainer.appendChild(shortUrlEl);
    uploadFile.style.display = "";
    shortUrlEl.click();
}


async function loadFiles(f) {
    const snapshot = await get(child(ref(db), saveHead + f));
    if (!snapshot.exists()) {
        document.getElementById('fileList').innerHTML = "此連結已過期或不存在";
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
        document.getElementById('fileList').innerHTML = "檔案已過期";
        return;
    }

    let html = "<h3>檔案清單</h3>";
    data.files.forEach(f => {
        html += `
          <div class="file-item">
            <!-- 檔案檢視 -->
            <a href="${f.url}" target="_blank">${f.name}</a>
          </div>`;
    });

    html += `<button id="downloadAll">全部下載</button>`;
    document.getElementById('fileList').innerHTML = html;

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

const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("fileInput");
const uploadText = document.getElementById("uploadText");

function updateUploadText() {
    if (fileInput.files.length > 0) {
        const names = Array.from(fileInput.files).map(f => f.name).join(", ");
        uploadText.textContent = "已選擇檔案: " + names;
    } else {
        uploadText.textContent = "拖曳檔案到這裡，或點擊選擇檔案";
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