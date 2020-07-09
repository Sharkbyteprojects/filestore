const express = require('express');
const formidable = require('formidable');
const sharkevent = require("shark-logger-remote");
const fs = require("fs");
const logger = new sharkevent("myapplication.log", ["ERR", "WARN", "INFO"], { port: 8080, host: "localhost" });
const redis = require("redis");
const path=require("path");
const crypto = require('crypto');
const client = redis.createClient("redis://redis");
let key = crypto.randomBytes(32);
let iv = crypto.randomBytes(16);
client.get("key",(err, getss)=>{
if(getss){
  key=Buffer.from(getss, "hex");
}else{
  client.set("key", key.toString('hex'));
}
console.log(key.toString("hex"));
logger.emit("info", `ENCKEY: ${key.toString("hex")}`);
});
const cleanseString = function(string) {
  return string.replace(/</g, "&lt;").replace(/>/g, "&gt;");
};
function encrypt(text) {
  let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return JSON.stringify({ iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') });
 }
 
 function decrypt(textx) {
  const text=JSON.parse(textx);
  let iv = Buffer.from(text.iv, 'hex');
  let encryptedText = Buffer.from(text.encryptedData, 'hex');
  let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
 }
function chash(file) {
    const hash = crypto.createHash('sha256');
    hash.update(file);
    return hash.digest('hex');
}
const app = express();
app.get("/api/downstream",(req,res)=>{
  res.set({
    "content-type": "text/plain"
  });
  client.get(req.query.hash,(err, getss)=>{
    if(getss===null){
      res.send("!Not Found!");
    }else{
      res.send(decrypt(getss));
    }
  });
});
app.post('/api/upload', (req, res, next) => {
  const form = formidable({ multiples: true });
 
  form.parse(req, (err, fields, files) => {
    if (err) {
      next(err);
      return;
    }
    if(files.load){
      const top=`<!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Uploaded Files</title>
      </head>
      <body>`;
      const end=`</body>
      </html>`;
        if(Array.isArray(files.load)){
            new Promise((ok,err)=>{
                let xs=top;
                let prev=""
                for(let file of files.load){
                    if(file.type==="text/plain"){
                      const file=fs.readFileSync(file.path, "utf8");
                      const sh=chash(file);
                      logger.emit("info", `Upload multiple file: ${sh}`);
                      client.set(sh, encrypt(file));
                      xs+=`<li><a href="/file.html#${sh}">${cleanseString(file.name)}</a></li>`;
                      prev=file.name;
                    }else{
                      xs+=`\n<br>File type ${cleanseString(file.type)} forbidden\n`;
                    }
                }
                xs+=end;
                ok(xs);
            }).then((data)=>{
                res.send(data);
            });
        }else{
            if(files.load.type==="text/plain"){
                const file=fs.readFileSync(path.resolve(files.load.path), "utf8");
                const sh=chash(file);
                client.set(sh, encrypt(file));
                logger.emit("info", `Upload one file: ${sh}`);
                res.send(`${top}<li><a href="/file.html#${sh}">${cleanseString(files.load.name)}</a></li>${end}`);
            }else{
                res.send(`Type ${files.load.type} forbidden`);
                logger.emit("warn", "Forbidden");
            }
        }
    }else{
      logger.emit("warn", "Fail upload");
      res.sendStatus(400);
    }
  });
});
 
app.listen(3000, () => {
  console.log('Server listening on http://localhost:3000 ...');
});