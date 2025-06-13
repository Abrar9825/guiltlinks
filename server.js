
const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const uuid = require('uuid').v4;
const path = require('path');
const { urlencoded } = require('body-parser');

require('dotenv').config();
const app = express();
app.use(urlencoded({ extended: true }))
app.use(express.static('public'))

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

const s3 = new AWS.S3({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
})

const upload = multer({ storage: multer.memoryStorage() })

app.post("/upload", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).send("No file uploaded");

    const filekey = `${uuid()}_${file.originalname}`;
    const params = {
        Bucket: process.env.S3_BUCKET,
        Key: filekey,
        Body: file.buffer,
        ContentType: file.mimetype,
    };

    try {
        await s3.putObject(params).promise();

        const signedUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.S3_BUCKET,
            Key: filekey,
            Expires: 10 // 5 mins
        });

        res.send(`
            <h2>Uploaded!</h2>
            <a href="${signedUrl}" target="_blank">Download File</a>
        `);
    } catch (err) {
        console.error("S3 Upload Error:", err);
        res.status(500).send("Upload failed: " + err.message);
    }
});

// router
app.get("/", (req, res) => {
    res.render('upload')
})

app.listen(8000, () => {
    console.log('Server running on http://localhost:' + 8000);
});