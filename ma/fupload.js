const express = require('express');
const formidable = require('formidable');
const sharkevent = require("shark-logger-remote");
const logger = new sharkevent("myapplication.log", ["ERR", "WARN", "INFO"], { port: 8080, host: "localhost" });
const redis = require("redis");
const crypto = require('crypto');
const client = redis.createClient("redis://redis");
function chash(file) {
    const hash = crypto.createHash('sha256');
    hash.update(file);
    return hash.digest('hex');
}
const app = express();
 
app.get('/', (req, res) => {
  res.send(`
    <form action="/api/upload" enctype="multipart/form-data" method="post">
      <div>File: <input type="file" name="load" multiple="multiple" /></div>
      <input type="submit" value="Upload" />
    </form>
  `);
});
 
app.post('/api/upload', (req, res, next) => {
  const form = formidable({ multiples: true });
 
  form.parse(req, (err, fields, files) => {
    if (err) {
      next(err);
      return;
    }
    if(files.load){
        res.set({
            "content-type": "text/plain"
        });
        if(Array.isArray(files.load)){
            new Promise((ok,err)=>{
                let xs="";
                let prev=""
                for(let file of files.load){
                    if(prev!=""){
                        xs += `--- END ${prev} ---\n\n`
                    }
                    if(file.type==="text/plain"){
                      xs+=`--- ${file.name} ---\n\n`;
                      xs+="\t";
                      const file=fs.readFileSync(file.path, "utf8");
                      const sh=chash(file);
                      logger.emit("info", `Upload multiple file: ${sh}`);
                      client.set(sh, file);
                      xs+=sh;
                      xs+="\n\n";
                      prev=file.name;
                    }else{
                      xs+=`\nFile type ${file.type} forbidden\n`;
                    }
                }
                if(prev!=""){
                    xs += `--- END ${prev} ---\n`
                }
                ok(xs);
            }).then((data)=>{
                res.send(data);
            });
        }else{
            if(files.load.type==="text/plain"){
                const file=fs.readFileSync(files.load.path, "utf8");
                const sh=chash(file);
                client.set(sh, file);
                logger.emit("info", `Upload one file: ${sh}`);
                res.send(sh);
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