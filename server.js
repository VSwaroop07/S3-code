require("dotenv").config();
 
const express = require("express");
const multer = require("multer");
const path = require("path");
const {
  S3Client, PutObjectCommand, ListObjectsV2Command,
  GetObjectCommand, DeleteObjectCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
 
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB demo limit
});
 
const region = process.env.AWS_REGION;
const bucket = process.env.S3_BUCKET;
 
// The SDK uses AWS_PROFILE locally when set. On EC2 it uses the instance role.
const s3 = new S3Client({ region });
 
app.use(express.static(path.join(__dirname, "public")));
 
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Select a file first." });
 
    // Generate a unique object key; do not trust a user-supplied path.
    const safeName = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${Date.now()}-${safeName}`;
 
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }));
 
    res.status(201).json({ message: "Uploaded successfully", key });
  } catch (err) {
    console.error("Upload failed:", err);
    res.status(500).json({ message: "Upload failed. Check server logs and IAM permissions." });
  }
});
 
app.get("/api/files", async (req, res) => {
  try {
    const result = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    const files = (result.Contents || []).map(item => ({
      key: item.Key, size: item.Size, lastModified: item.LastModified
    }));
    res.json(files);
  } catch (err) {
    console.error("List failed:", err);
    res.status(500).json({ message: "Could not list files." });
  }
});
 
app.get("/api/download/:key", async (req, res) => {
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: req.params.key });
    const url = await getSignedUrl(s3, command, { expiresIn: 300 });
    res.json({ url, expiresInSeconds: 300 });
  } catch (err) {
    console.error("Download URL failed:", err);
    res.status(500).json({ message: "Could not create download link." });
  }
});
 
app.delete("/api/files/:key", async (req, res) => {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: req.params.key }));
    res.json({ message: "Deleted", key: req.params.key });
  } catch (err) {
    console.error("Delete failed:", err);
    res.status(500).json({ message: "Delete failed." });
  }
});
 
const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => console.log(`S3 File Manager running on port ${port}`));
