const mega = require("megajs");
const fs = require("fs");

const auth = {
  email: "mahiyabotz@gmail.com",
  password: "mutgmw@0624",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246",
};

const upload = (data, name) => {
  return new Promise((resolve, reject) => {
    const storage = new mega.Storage(auth);

    storage.on("ready", () => {
      const uploadStream = storage.upload({ name });

      uploadStream.on("complete", (file) => {
        file.link((err, url) => {
          if (err) {
            reject(err);
          } else {
            storage.close();
            resolve(url);
          }
        });
      });

      uploadStream.on("error", reject);

      if (Buffer.isBuffer(data)) {
        uploadStream.end(data);
      } else if (typeof data === "string") {
        fs.createReadStream(data).pipe(uploadStream);
      } else {
        data.pipe(uploadStream);
      }
    });

    storage.on("error", reject);
  });
};

module.exports = { upload };
