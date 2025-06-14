const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const uuid = require('uuid').v4;
const path = require('path');
const { urlencoded } = require('body-parser');
const axios = require('axios');

require('dotenv').config();
const app = express();
app.use(urlencoded({ extended: true }));
app.use(express.static('public'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// AWS S3 config
const s3 = new AWS.S3({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const upload = multer({ storage: multer.memoryStorage() });
const usedLinks = new Set(); // One-time download tracker

// Upload Route
app.post("/upload", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).send("No file uploaded");

    const fileKey = `${uuid()}_${file.originalname}`;
    const params = {
        Bucket: process.env.S3_BUCKET,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype
    };

    try {
        await s3.putObject(params).promise();
        const downloadLink = `http://13.232.170.236:8000/file/${fileKey}`;

        res.render('show', { downloadLink })
    } catch (err) {
        console.error("S3 Upload Error:", err);
        res.status(500).send("Upload failed: " + err.message);
    }
});

// One-time file access + IP log
app.get("/file/:key", async (req, res) => {
    const fileKey = req.params.key;
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // Fetch location from IP
    let location = {};
    try {
        const { data } = await axios.get(`https://ipapi.co/${ip}/json/`);
        location = data;
    } catch (err) {
        console.warn("IP Location fetch failed:", err.message);
    }

    console.log("User IP:", ip);
    console.log("Location:", `${location.city || ''}, ${location.region || ''}, ${location.country_name || ''}`);

    if (usedLinks.has(fileKey)) {
        res.render('delete'); // This will render views/delete.ejs
        return;
    }
    try {
        const signedUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.S3_BUCKET,
            Key: fileKey,
            Expires: 60 // 1 minute
        });

        usedLinks.add(fileKey);
        res.redirect(signedUrl);

        // Delay the delete to allow the user to download
        setTimeout(async () => {
            try {
                await s3.deleteObject({
                    Bucket: process.env.S3_BUCKET,
                    Key: fileKey
                }).promise();
                console.log("File deleted:", fileKey);
            } catch (deleteErr) {
                console.error("Error deleting file:", deleteErr);
            }
        }, 5000); // 5-second delay
    } catch (err) {
        console.error("Download error:", err);
        res.status(500).send("Download failed");
    }

});

// Upload form
app.get("/", (req, res) => {
    res.render('upload');
});

app.listen(8000, () => {
    console.log('Server running on http://13.232.170.236:8000');
});
